// Config loading + validation (SPEC §5, DESIGN §1).
//
// `loadConfig(yamlStringOrPath, { env })` -> { config, errors }. It NEVER throws:
// malformed YAML, an unresolved ${ENV}, an unknown backend type, a malformed
// filter, or a backend.validateConfig failure are all collected into
// `errors: string[]` so misconfiguration surfaces as actionable diagnostics
// rather than a crash at poll time.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import yaml from 'js-yaml';
import { registry } from './registry.js';
import type { ChannelsConfig, NormalizedSource, SpawnConfig } from './types.js';

const KNOWN_OPS = new Set([
  'eq', 'ne', 'in', 'nin', 'includes', 'contains', 'regex', 'exists', 'gt', 'gte', 'lt', 'lte'
]);

const DEFAULT_POLL_INTERVAL = 60;
// SPEC §5: default `state.maxSeenPerSource` when the YAML omits it. A finite
// default keeps the FIFO seen-bound from silently becoming UNBOUNDED (which would
// let state files grow without limit); an explicit YAML value still wins.
const DEFAULT_MAX_SEEN_PER_SOURCE = 1000;

// SPEC §10 / DESIGN §7.5: the session-spawner config additions. All keys are
// OPTIONAL and additive — an absent key preserves today's behavior.
const SPAWN_MODES = new Set(['headless', 'interactive']);
const APPROVAL_MODES = new Set(['yolo', 'prompt', 'deny']);
const ON_EVENT_VALUES = new Set(['emit', 'spawn', 'both']);
// adapters McpServerConfig.name regex.
const MCP_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** Default global spawn block (DESIGN §7.5). `agent` defaults to the CANONICAL
 *  adapters key `'claude'`. An explicit YAML `agent` value is preserved verbatim
 *  here (normalization happens in the spawner, not at load). */
const SPAWN_DEFAULTS: SpawnConfig = {
  agent: 'claude',
  mode: 'headless',
  approvalMode: 'yolo',
  selfMcpName: 'mcp-channels',
  maxConcurrent: 4
};

/**
 * Interpolate `${NAME}` placeholders from `env` across the PARSED config tree.
 * Walking the parsed structure (rather than the raw text) means YAML comments
 * are already stripped, so a literal `${ENV}` inside a comment is never mistaken
 * for a required variable. Records every unresolved name in `errors`.
 */
function interpolateNode(node: unknown, env: Record<string, string>, missing: Set<string>): unknown {
  if (typeof node === 'string') {
    return node.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => {
      const val = env[name];
      if (val === undefined || val === null || val === '') {
        missing.add(name);
        return '';
      }
      return String(val);
    });
  }
  if (Array.isArray(node)) {
    return node.map((v) => interpolateNode(v, env, missing));
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = interpolateNode(v, env, missing);
    }
    return out;
  }
  return node;
}

/**
 * Validate a filter spec recursively. Pushes human-readable problems into
 * `errors`. Mirrors the engine in filter.js so a bad filter is caught at load
 * time (rather than silently never matching at runtime).
 */
function validateFilter(spec: unknown, sourceId: unknown, errors: string[]): void {
  if (spec == null) return;
  if (typeof spec !== 'object' || Array.isArray(spec)) {
    errors.push(`Source "${sourceId}": filter must be an object`);
    return;
  }
  const s = spec as Record<string, unknown>;
  if (Array.isArray(s.all)) {
    s.all.forEach((sub) => validateFilter(sub, sourceId, errors));
    return;
  }
  if (Array.isArray(s.any)) {
    s.any.forEach((sub) => validateFilter(sub, sourceId, errors));
    return;
  }
  if ('not' in s) {
    validateFilter(s.not, sourceId, errors);
    return;
  }
  // An empty object is "no gate"; allow it.
  if (!('field' in s) && !('op' in s)) return;

  // Leaf clause.
  if (typeof s.field !== 'string' || s.field.length === 0) {
    errors.push(`Source "${sourceId}": filter clause is missing a "field"`);
  }
  if (typeof s.op !== 'string' || !KNOWN_OPS.has(s.op)) {
    errors.push(
      `Source "${sourceId}": filter clause has an unknown op "${s.op}" ` +
        `(valid: ${[...KNOWN_OPS].join(', ')})`
    );
  }
}

/**
 * Validate an EFFECTIVE spawn config block (DESIGN §7.5). `label` identifies the
 * origin in error messages. Pushes human-readable problems into `errors`; never
 * throws.
 */
function validateSpawn(spawn: unknown, label: string, errors: string[]): void {
  if (spawn == null) return;
  if (typeof spawn !== 'object' || Array.isArray(spawn)) {
    errors.push(`${label}: spawn must be a mapping`);
    return;
  }
  const sp = spawn as Record<string, unknown>;
  if (sp.mode != null && !SPAWN_MODES.has(sp.mode as string)) {
    errors.push(`${label}: spawn.mode must be one of headless, interactive (got "${sp.mode}")`);
  }
  if (sp.approvalMode != null && !APPROVAL_MODES.has(sp.approvalMode as string)) {
    errors.push(
      `${label}: spawn.approvalMode must be one of yolo, prompt, deny (got "${sp.approvalMode}")`
    );
  }
  if (sp.selfMcpName != null && !MCP_NAME_RE.test(String(sp.selfMcpName))) {
    errors.push(
      `${label}: spawn.selfMcpName must match ^[a-zA-Z0-9_-]{1,64}$ (got "${sp.selfMcpName}")`
    );
  }
  if (sp.maxConcurrent != null) {
    const n = sp.maxConcurrent;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      errors.push(`${label}: spawn.maxConcurrent must be a positive integer (got "${n}")`);
    }
  }
  if (sp.promptTemplate != null && typeof sp.promptTemplate !== 'string') {
    errors.push(`${label}: spawn.promptTemplate must be a string`);
  }
}

/** Shallow-merge a per-source spawn block OVER the global defaults (per-source
 *  wins). `env` is deep-merged so a source can add one variable without
 *  redefining the whole block (DESIGN §7.5). */
function mergeSpawn(global: SpawnConfig | undefined, perSource: unknown): SpawnConfig {
  const merged: Record<string, unknown> = { ...(global || {}) };
  if (perSource && typeof perSource === 'object' && !Array.isArray(perSource)) {
    for (const [k, v] of Object.entries(perSource)) {
      if (v === undefined) continue;
      if (k === 'env' && v && typeof v === 'object' && !Array.isArray(v)) {
        merged.env = { ...((merged.env as Record<string, unknown>) || {}), ...v };
      } else {
        merged[k] = v;
      }
    }
  }
  return merged as SpawnConfig;
}

/**
 * Resolve the raw YAML text from either an inline string or a file path. An
 * inline config always contains newlines; a bare path won't, so a single-line
 * existing file is read from disk. Returns `{ text, baseDir }` where `baseDir`
 * is the directory custom backends resolve against.
 */
function resolveSource(input: string): { text: string; baseDir: string } {
  if (typeof input === 'string' && !input.includes('\n')) {
    try {
      if (existsSync(input) && statSync(input).isFile()) {
        return { text: readFileSync(input, 'utf8'), baseDir: dirname(resolve(input)) };
      }
    } catch {
      // fall through to treating it as inline YAML
    }
  }
  return { text: String(input ?? ''), baseDir: process.cwd() };
}

/**
 * Load and validate a channels config.
 */
export function loadConfig(
  input: string,
  opts: { env?: Record<string, string> } = {}
): { config: ChannelsConfig; errors: string[] } {
  const env = opts.env || (process.env as Record<string, string>);
  const errors: string[] = [];

  const { text, baseDir } = resolveSource(input);

  let parsed: unknown;
  try {
    parsed = yaml.load(text);
  } catch (err) {
    errors.push(`Failed to parse YAML: ${(err as Error)?.message || String(err)}`);
    return {
      config: { server: { permissionRelay: false }, sources: [], state: { maxSeenPerSource: DEFAULT_MAX_SEEN_PER_SOURCE }, defaults: { pollIntervalSeconds: DEFAULT_POLL_INTERVAL }, spawn: {}, baseDir },
      errors
    };
  }

  // Interpolate ${ENV} on the parsed tree (comments already stripped), then
  // surface any unresolved variables as actionable errors.
  const missing = new Set<string>();
  let raw = interpolateNode(parsed, env, missing) as Record<string, any>;
  for (const name of missing) {
    errors.push(`Missing required environment variable: \${${name}}`);
  }

  if (raw == null || typeof raw !== 'object') {
    errors.push('Config must be a YAML mapping with `server` and `sources`.');
    raw = {};
  }

  const server = raw.server && typeof raw.server === 'object' ? raw.server : {};
  const state = raw.state && typeof raw.state === 'object' ? raw.state : {};
  const defaults = raw.defaults && typeof raw.defaults === 'object' ? raw.defaults : {};
  const defaultInterval =
    typeof defaults.pollIntervalSeconds === 'number'
      ? defaults.pollIntervalSeconds
      : DEFAULT_POLL_INTERVAL;

  if (!server.name) {
    errors.push('config.server.name is required.');
  }

  // server.replySecret (DESIGN §7.4): optional string (typically ${ENV}). An
  // empty/unset value is omitted (per-process random key path).
  let replySecret: string | undefined;
  if (server.replySecret != null && server.replySecret !== '') {
    if (typeof server.replySecret === 'string') {
      replySecret = server.replySecret;
    } else {
      errors.push('config.server.replySecret must be a string.');
    }
  }

  // Global spawn defaults block (DESIGN §7.5). Validate the RAW block, then
  // normalize it onto config.spawn with documented defaults applied.
  const rawSpawn = raw.spawn && typeof raw.spawn === 'object' && !Array.isArray(raw.spawn) ? raw.spawn : null;
  if (raw.spawn != null && !rawSpawn) {
    errors.push('config.spawn must be a mapping.');
  }
  validateSpawn(rawSpawn, 'global spawn', errors);
  const globalSpawn = mergeSpawn(SPAWN_DEFAULTS, rawSpawn);

  const rawSources: any[] = Array.isArray(raw.sources) ? raw.sources : [];
  if (!Array.isArray(raw.sources)) {
    errors.push('config.sources must be an array.');
  }

  const sources: NormalizedSource[] = rawSources.map((s) => {
    const src = s && typeof s === 'object' ? s : {};
    const id = src.id;
    if (!id) errors.push('Each source requires an `id`.');

    // onEvent routing (DESIGN §7.5): default 'emit' so existing configs (which
    // have no onEvent) keep emitting and never spawn. An unknown value is an error.
    let onEvent: 'emit' | 'spawn' | 'both' = 'emit';
    if (src.onEvent != null) {
      if (ON_EVENT_VALUES.has(src.onEvent)) {
        onEvent = src.onEvent;
      } else {
        errors.push(
          `Source "${id}": onEvent must be one of emit, spawn, both (got "${src.onEvent}")`
        );
      }
    }

    // Per-source spawn merged OVER the global spawn (per-source wins). Validate
    // the EFFECTIVE merged block so an invalid effective mode/name is caught.
    const rawSrcSpawn =
      src.spawn && typeof src.spawn === 'object' && !Array.isArray(src.spawn) ? src.spawn : null;
    if (src.spawn != null && !rawSrcSpawn) {
      errors.push(`Source "${id}": spawn must be a mapping.`);
    }
    const effectiveSpawn = mergeSpawn(globalSpawn, rawSrcSpawn);
    validateSpawn(effectiveSpawn, `Source "${id}"`, errors);

    const normalized: NormalizedSource = {
      id,
      backend: src.backend,
      pollIntervalSeconds:
        typeof src.pollIntervalSeconds === 'number'
          ? src.pollIntervalSeconds
          : defaultInterval,
      auth: src.auth || {},
      config: src.config || {},
      filter: src.filter,
      routing: src.routing || {},
      onEvent,
      spawn: effectiveSpawn,
      baseDir
    };

    // Backend resolution: a built-in/registered type, OR a relative path to a
    // custom JS module. We only deeply validate registered types here; a custom
    // path is validated at load time by registry.load().
    const backendType = normalized.backend;
    const looksLikePath =
      typeof backendType === 'string' &&
      (backendType.startsWith('.') ||
        backendType.startsWith('/') ||
        /\.[cm]?js$/.test(backendType) ||
        /^[A-Za-z]:[\\/]/.test(backendType));

    if (!backendType) {
      errors.push(`Source "${id}": a \`backend\` is required.`);
    } else if (!looksLikePath) {
      const backend = registry.get(backendType as string);
      if (!backend) {
        errors.push(`Source "${id}": unknown backend type "${backendType}".`);
      } else if (typeof backend.validateConfig === 'function') {
        try {
          const problems = backend.validateConfig(normalized as unknown as Record<string, unknown>) || [];
          for (const p of problems) errors.push(p);
        } catch (err) {
          errors.push(`Source "${id}": backend.validateConfig threw: ${(err as Error)?.message || err}`);
        }
      }
    }

    validateFilter(normalized.filter, id, errors);

    return normalized;
  });

  const config: ChannelsConfig = {
    server: {
      name: server.name,
      instructions: server.instructions,
      permissionRelay: !!server.permissionRelay,
      replySecret
    },
    state: {
      dir: state.dir,
      maxSeenPerSource:
        typeof state.maxSeenPerSource === 'number'
          ? state.maxSeenPerSource
          : DEFAULT_MAX_SEEN_PER_SOURCE
    },
    defaults: { pollIntervalSeconds: defaultInterval },
    spawn: globalSpawn,
    sources,
    baseDir
  };

  return { config, errors };
}
