// Event-triggered session spawner (SPEC §10 / DESIGN §7).
//
// A surviving event (post filter + dedup) can spawn a fresh agent session via
// `@a5c-ai/adapters` instead of — or in addition to — emitting into the current
// session. The spawned session is SELF-ASSOCIATED: it is re-launched with THIS
// MCP server over stdio (same config path) and handed the event context + the
// same `reply_to` token, so it can post back to the SAME origin by calling the
// `reply` tool.
//
// Two seams:
//   - `buildSpawnRunOptions(source, event, { configPath, replySecret })` is a
//     PURE function mapping the effective spawn config + event -> adapters
//     `RunOptions`. No I/O, no client — the cheapest, most stable unit target.
//   - `SessionSpawner` calls an INJECTED adapters-like client's `run(opts)` with
//     bounded concurrency + error isolation. `@a5c-ai/adapters` is lazy-loaded
//     only when no client is injected (so the suite stays fully offline and the
//     dep is never imported in CI).

import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import type { RunOptions, ChannelEvent, SpawnConfig, McpServerConfig } from './types.js';

type AnySource = Record<string, any>;

/** The minimal structural seam the spawner needs from an adapters-like client.
 *  Typed locally (NOT imported from `@a5c-ai/adapters`) so the pure
 *  `buildSpawnRunOptions` mapping is duck-typed by `client.run()` and the package
 *  never couples to the SDK's exact internal RunOptions type. */
export interface AdaptersClientLike {
  run(opts: RunOptions): unknown;
}

/**
 * The canonical adapters agent id for Claude Code, as registered by
 * `registerBuiltInAdapters(client)` in `@a5c-ai/adapters` (verified empirically:
 * `client.adapters.get('claude')` resolves; `'claude-code'` does NOT). SPEC §10
 * examples and configs write `claude-code` as a friendly alias — we normalize it
 * to the canonical id so `client.run({ agent })` actually resolves the adapter.
 */
const DEFAULT_AGENT = 'claude';

/**
 * Map of friendly/catalog agent aliases -> the canonical adapter key the
 * `@a5c-ai/adapters` registry resolves. `'claude-code'` is the documented friendly
 * name (SPEC §10.3) but is an UNNORMALIZED catalog alias the registry does not
 * resolve; the registered id is `'claude'`. A user may write either.
 */
const AGENT_ALIASES: Record<string, string> = { 'claude-code': 'claude' };

/**
 * Normalize a configured agent id to the canonical adapter key, so a friendly
 * alias (e.g. `claude-code`) resolves against the real adapters registry. An
 * unknown/already-canonical id passes through unchanged.
 */
export function normalizeAgentId(agent: string | null | undefined): string {
  if (agent == null || agent === '') return DEFAULT_AGENT;
  return AGENT_ALIASES[agent] || agent;
}

/** Absolute path to THIS framework's cli.js, resolved from this module so it is
 *  correct regardless of the child's cwd (Windows-safe; no process.cwd reliance). */
function defaultCliPath(): string {
  return fileURLToPath(new URL('./cli.js', import.meta.url));
}

/**
 * Render a `promptTemplate` with literal `{{…}}` substitution. Supported
 * placeholders: `{{content}}`, `{{reply_to}}`, `{{source_id}}`, `{{meta.KEY}}`.
 * Substitution is a SINGLE pass with literal values, so untrusted event text in
 * `content`/`meta` can never inject a *new* placeholder (an unknown `{{meta.X}}`
 * or missing key expands to the empty string).
 */
function renderTemplate(
  template: string,
  {
    content,
    reply_to,
    source_id,
    meta
  }: { content?: unknown; reply_to?: unknown; source_id?: unknown; meta?: Record<string, unknown> }
): string {
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    if (key === 'content') return content == null ? '' : String(content);
    if (key === 'reply_to') return reply_to == null ? '' : String(reply_to);
    if (key === 'source_id') return source_id == null ? '' : String(source_id);
    if (key.startsWith('meta.')) {
      const metaKey = key.slice('meta.'.length);
      const val = meta ? meta[metaKey] : undefined;
      return val == null ? '' : String(val);
    }
    // Unknown placeholder -> empty string (boring, predictable).
    return '';
  });
}

/**
 * Build the default spawned prompt (AC-23): the event content, the routing-
 * relevant meta (rendered as `key: value` lines), the source id, the `reply_to`
 * token verbatim, and an explicit instruction to call the `reply` tool with it.
 */
function buildDefaultPrompt(source: AnySource, event: ChannelEvent): string {
  const meta = event.meta || {};
  const reply_to = meta.reply_to;
  const lines: string[] = [];

  lines.push('A new channel event was triggered and needs your attention.');
  lines.push('');
  lines.push(`source_id: ${source.id}`);

  // Routing-relevant meta first (whatever identifies origin for that backend),
  // then the remaining identifier meta (kind/author/etc.), excluding reply_to
  // (surfaced separately, verbatim, below).
  const routingKeys = ['repo', 'issue_number', 'project', 'issue_key', 'kind', 'author'];
  const seen = new Set<string>();
  for (const key of routingKeys) {
    if (key in meta && meta[key] != null && meta[key] !== '') {
      lines.push(`${key}: ${meta[key]}`);
      seen.add(key);
    }
  }
  for (const [key, value] of Object.entries(meta)) {
    if (key === 'reply_to' || seen.has(key)) continue;
    if (value == null || value === '') continue;
    lines.push(`${key}: ${value}`);
  }

  lines.push('');
  lines.push('Event content:');
  lines.push(event.content == null ? '' : String(event.content));
  lines.push('');
  lines.push(`reply_to: ${reply_to == null ? '' : reply_to}`);
  lines.push('');
  lines.push(
    'To respond to the origin of this event, call the `reply` tool with `reply_to` ' +
      'set to the token above and your message as `text`. Echo the token exactly; ' +
      'do not modify it.'
  );

  return lines.join('\n');
}

/**
 * PURE mapping of (source, event, ctx) -> adapters `RunOptions` (SPEC §10.2).
 * Reads the source's EFFECTIVE spawn config (`source.spawn`, already merged over
 * the global defaults by config.js / the caller). Optional fields are OMITTED
 * when unset (never emitted as `undefined`) so the adapter's own defaults apply.
 */
export function buildSpawnRunOptions(
  source: AnySource & { id: string; spawn?: SpawnConfig; baseDir?: string },
  event: ChannelEvent,
  ctx: { configPath: string; replySecret?: string; resolveCliPath?: () => string } = {} as {
    configPath: string;
    replySecret?: string;
    resolveCliPath?: () => string;
  }
): RunOptions {
  const spawn: SpawnConfig = (source && source.spawn) || {};
  const { configPath, replySecret, resolveCliPath } = ctx;

  // --- prompt -------------------------------------------------------------
  let prompt: string;
  if (typeof spawn.promptTemplate === 'string') {
    prompt = renderTemplate(spawn.promptTemplate, {
      content: event.content,
      reply_to: event.meta ? event.meta.reply_to : undefined,
      source_id: source.id,
      meta: event.meta || {}
    });
  } else {
    prompt = buildDefaultPrompt(source, event);
  }

  const opts: RunOptions = {
    // Normalize the configured agent to the canonical adapters key so a friendly
    // alias (`claude-code`) resolves against the real registry (`claude`). An
    // unset agent falls back to the canonical default.
    agent: normalizeAgentId(spawn.agent),
    prompt
  } as RunOptions;

  // --- mode mapping (exactly one of nonInteractive/interactive) -----------
  const mode = spawn.mode || 'headless';
  if (mode === 'interactive') {
    opts.interactive = true;
  } else {
    opts.nonInteractive = true;
  }

  // --- optional passthroughs (omitted when unset) -------------------------
  if (spawn.model != null && spawn.model !== '') opts.model = spawn.model;
  if (spawn.systemPrompt != null && spawn.systemPrompt !== '') {
    opts.systemPrompt = spawn.systemPrompt;
  }

  // approvalMode defaults to 'yolo' (autonomous reply).
  opts.approvalMode = spawn.approvalMode || 'yolo';

  // cwd resolved to an absolute path against the config's baseDir when set.
  if (spawn.cwd != null && spawn.cwd !== '') {
    const base = (source && source.baseDir) || process.cwd();
    opts.cwd = isAbsolute(spawn.cwd) ? spawn.cwd : resolve(base, spawn.cwd);
  }

  if (spawn.env && typeof spawn.env === 'object') {
    opts.env = { ...spawn.env };
  }

  // --- self-association mcpServers entry (AC-20) --------------------------
  const cliPath = (typeof resolveCliPath === 'function' && resolveCliPath()) || defaultCliPath();
  const selfMcp: McpServerConfig = {
    name: spawn.selfMcpName || 'mcp-channels',
    transport: 'stdio',
    command: 'node',
    args: [cliPath, configPath],
    env: replySecret ? { MCP_CHANNELS_REPLY_SECRET: replySecret } : {}
  };
  opts.mcpServers = [selfMcp];

  return opts;
}

/**
 * The default lazy loader for the optional `@a5c-ai/adapters` client. Dynamic-
 * imports the package, creates a client, then registers the built-in adapters
 * ONTO that client (so `agent:'claude'` resolves), and returns it. NEVER imported
 * at module load — only invoked when no client is injected (so tests that inject a
 * fake stay fully offline).
 */
/* c8 ignore start -- the real `@a5c-ai/adapters` launch path is environment-gated
   (needs the optional dep + the claude CLI + auth), out of scope for the offline
   suite (DESIGN §7.7); tests always inject a fake client or loadClient. */
async function defaultLoadClient(): Promise<AdaptersClientLike> {
  const mod = (await import('@a5c-ai/adapters')) as unknown as {
    createClient: () => AdaptersClientLike;
    registerBuiltInAdapters?: (client: AdaptersClientLike) => void;
  };
  const client = mod.createClient();
  if (typeof mod.registerBuiltInAdapters === 'function') {
    mod.registerBuiltInAdapters(client);
  }
  return client;
}
/* c8 ignore stop */

export interface SessionSpawnerDeps {
  client?: AdaptersClientLike;
  configPath: string;
  replySecret?: string;
  maxConcurrent?: number;
  log?: (...args: unknown[]) => void;
  resolveCliPath?: () => string;
  loadClient?: () => Promise<AdaptersClientLike> | AdaptersClientLike;
  onDispatch?: (source: AnySource, event: ChannelEvent) => void;
}

/**
 * Launches sessions for surviving events via an injected adapters-like client.
 * Bounded concurrency (a tiny promise-queue semaphore), error isolation (a
 * throwing/rejecting `run` is caught + logged, never thrown to the caller), and
 * an `onDispatch` hook so the poller records seen-on-dispatch exactly once.
 */
export class SessionSpawner {
  client: AdaptersClientLike | null;
  configPath: string;
  replySecret?: string;
  maxConcurrent: number;
  log: (...args: unknown[]) => void;
  resolveCliPath?: () => string;
  loadClient: () => Promise<AdaptersClientLike> | AdaptersClientLike;
  onDispatch: ((source: AnySource, event: ChannelEvent) => void) | null;
  _free: number;
  _waiters: Array<() => void>;
  _clientPromise: Promise<AdaptersClientLike> | null;

  constructor({
    client,
    configPath,
    replySecret,
    maxConcurrent = 4,
    log,
    resolveCliPath,
    loadClient,
    onDispatch
  }: SessionSpawnerDeps = {} as SessionSpawnerDeps) {
    this.client = client || null;
    this.configPath = configPath;
    this.replySecret = replySecret;
    this.maxConcurrent = Math.max(1, Number(maxConcurrent) || 4);
    this.log = typeof log === 'function' ? log : () => {};
    this.resolveCliPath = resolveCliPath;
    this.loadClient = typeof loadClient === 'function' ? loadClient : defaultLoadClient;
    this.onDispatch = typeof onDispatch === 'function' ? onDispatch : null;

    // Concurrency semaphore: count of free slots + a FIFO queue of waiters.
    this._free = this.maxConcurrent;
    this._waiters = [];
    // Memoize a lazily-loaded client so we resolve the dep at most once.
    this._clientPromise = null;
  }

  /**
   * Resolve the adapters client: the injected one if present, else the lazily
   * loaded one. A failure to obtain a client is surfaced as a CLEAR, actionable
   * error (AC-25). Memoized so the dep is resolved at most once.
   */
  async _getClient(): Promise<AdaptersClientLike> {
    if (this.client) return this.client;
    if (!this._clientPromise) {
      this._clientPromise = (async () => {
        let loaded: AdaptersClientLike | undefined;
        try {
          loaded = await this.loadClient();
        } catch (err) {
          throw new Error(
            "Spawn is configured but no client was injected and '@a5c-ai/adapters' " +
              `could not be loaded (${(err as Error)?.message || err}); install it or inject a client.`
          );
        }
        if (!loaded || typeof loaded.run !== 'function') {
          throw new Error(
            "Spawn is configured but no usable adapters client is available; install " +
              "'@a5c-ai/adapters' or inject a client with a run(options) method."
          );
        }
        return loaded;
      })();
      // Don't cache a rejected promise — let a later validate()/spawn retry.
      this._clientPromise.catch(() => {
        this._clientPromise = null;
      });
    }
    return this._clientPromise;
  }

  /**
   * Startup validation hook (AC-25): if no client is injected, eagerly attempt
   * to obtain one so a missing dep fails FAST and LOUDLY at startup rather than
   * silently at event time. Throws a clear error when no client can be obtained.
   * A no-op when a client is injected (stays offline).
   */
  async validate(): Promise<void> {
    if (this.client) return;
    await this._getClient();
  }

  /** Acquire a concurrency slot (awaits when the cap is reached). */
  _acquire(): Promise<void> {
    if (this._free > 0) {
      this._free -= 1;
      return Promise.resolve();
    }
    return new Promise((res) => {
      this._waiters.push(res);
    });
  }

  /** Release a concurrency slot, handing it to the next waiter if any. */
  _release(): void {
    const next = this._waiters.shift();
    if (next) {
      next();
    } else {
      this._free += 1;
    }
  }

  /**
   * Spawn a session for one surviving event. Builds RunOptions, resolves the
   * client, acquires a concurrency slot, calls `client.run(opts)`, and returns
   * the launch outcome. NEVER throws to the caller (the poller): a launch error
   * is caught + logged and converted to `{ ok:false, error }`. The event is
   * recorded as dispatched EXACTLY ONCE (AC-24), regardless of launch outcome.
   *
   * The missing-client/dep error (AC-25) is the one case allowed to surface as a
   * rejection (it is a misconfiguration, not a per-launch failure).
   */
  async spawn(
    source: AnySource & { id: string; spawn?: SpawnConfig },
    event: ChannelEvent
  ): Promise<{ ok: boolean; handle?: unknown; error?: unknown }> {
    // Resolve the client FIRST. A missing client/dep is a hard configuration
    // error (AC-25) and is allowed to surface. (When a client is injected this
    // never throws.)
    const client = await this._getClient();

    // Record the event as dispatched exactly once, BEFORE the launch settles, so
    // a launch failure does not roll back dedup (at-most-once stance, AC-24).
    if (this.onDispatch) {
      try {
        this.onDispatch(source, event);
      } catch {
        // an onDispatch hook failure must not affect the spawn outcome
      }
    }

    const opts = buildSpawnRunOptions(source, event, {
      configPath: this.configPath,
      replySecret: this.replySecret,
      resolveCliPath: this.resolveCliPath
    });

    await this._acquire();

    // `client.run` may throw SYNCHRONOUSLY (bad options) -> caught here -> the
    // slot is released and the failure reported. This is a launch-start failure.
    let handle: unknown;
    try {
      handle = client.run(opts);
    } catch (err) {
      this._release();
      this.log(`spawner: spawn failed for source "${source?.id}": ${(err as Error)?.message || err}`);
      return { ok: false, error: err };
    }

    // The slot is bound to the HANDLE's lifetime: the cap is on in-flight launches
    // (DESIGN §7.2), so the slot stays occupied while the handle is open, and is
    // freed the moment it settles (success OR failure).
    let rejected = false;
    let launchError: unknown;
    Promise.resolve(handle).then(
      () => {
        this._release();
      },
      (err) => {
        rejected = true;
        launchError = err;
        this._release();
      }
    );

    // Give an IMMEDIATE rejection a chance to settle, so it is reported as
    // `{ ok:false }` and logged (AC-24). A pending (long-lived) handle does not
    // reject in this window and is reported as a started launch.
    await Promise.resolve();
    await Promise.resolve();

    if (rejected) {
      this.log(
        `spawner: spawn failed for source "${source?.id}": ${(launchError as Error)?.message || launchError}`
      );
      return { ok: false, error: launchError };
    }

    return { ok: true, handle };
  }
}
