// Runtime composition root (SPEC §3/§6, DESIGN §1/§3).
//
// createRuntime(configPathOrYaml, deps) loads + validates config, constructs the
// ChannelServer, resolves backends (built-in via the registry, custom via a
// relative path), wires the Poller, and wires the reply tool back through the
// opaque reply_to token to the owning backend's reply(). Returns
// { server, poller, config, start, stop }.
//
//   start(): connect the (optional) transport + start the poller.
//   stop():  stop the poller + close the server.
//
// `deps` injects the seams the tests need: a fake `http`, an in-memory
// `stateStore`, a fixed `now`, and/or a capturing `transport`.

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { ChannelServer } from './server.js';
import { Poller } from './poller.js';
import { StateStore } from './state.js';
import { registry } from './registry.js';
import { createRelay } from './relay.js';
import { SessionSpawner, type AdaptersClientLike } from './spawner.js';
import type { Backend, ChannelsConfig } from './types.js';
import type { StateStoreLike } from './state.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

type AnySource = Record<string, any>;

export interface RuntimeDeps {
  http?: (url: string | URL, opts?: Record<string, unknown>) => Promise<unknown>;
  stateStore?: StateStoreLike;
  now?: () => Date;
  transport?: Transport;
  env?: Record<string, string>;
  client?: AdaptersClientLike;
  loadClient?: () => Promise<AdaptersClientLike> | AdaptersClientLike;
  resolveCliPath?: () => string;
  permissionHandler?: (req: unknown) => 'allow' | 'deny' | Promise<'allow' | 'deny'>;
  log?: (...args: unknown[]) => void;
}

export interface Runtime {
  server: ChannelServer;
  poller: Poller;
  config: ChannelsConfig;
  errors: string[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** A backend reference is a custom-module path (not a built-in type) when it
 *  looks like a relative/absolute path or ends in a JS extension. */
function looksLikePath(backend: unknown): boolean {
  return (
    typeof backend === 'string' &&
    (backend.startsWith('.') ||
      backend.startsWith('/') ||
      /\.[cm]?js$/.test(backend) ||
      /^[A-Za-z]:[\\/]/.test(backend))
  );
}

export async function createRuntime(
  configPathOrYaml: string,
  deps: RuntimeDeps = {}
): Promise<Runtime> {
  const { config, errors } = loadConfig(configPathOrYaml, { env: deps.env });
  if (errors.length > 0) {
    throw new Error(`mcp-channels: invalid config:\n  - ${errors.join('\n  - ')}`);
  }

  const http =
    deps.http || ((url: string | URL, opts?: Record<string, unknown>) => fetch(url as RequestInfo, opts as RequestInit));
  const now = deps.now || (() => new Date());

  // Resolve the effective reply secret (DESIGN §7.4): config wins, env is the
  // fallback. When set, a bound relay signs AND verifies with the derived key so
  // the running instance interoperates with a child sharing the secret (both
  // directions). When unset, the bound relay degrades to the per-process random
  // key — identical to today's behavior (backward compatible).
  const replySecret =
    config.server.replySecret ||
    (deps.env ? deps.env.MCP_CHANNELS_REPLY_SECRET : process.env.MCP_CHANNELS_REPLY_SECRET) ||
    undefined;
  const relay = createRelay(replySecret);

  const stateStore =
    deps.stateStore ||
    new StateStore({
      dir: (config.state.dir as string) || defaultStateDir(config.server.name as string),
      maxSeenPerSource: config.state.maxSeenPerSource
    });

  const server = new ChannelServer({
    name: config.server.name as string,
    instructions: config.server.instructions as string | undefined,
    permissionRelay: config.server.permissionRelay
  });

  // Wire a default permission handler when the relay is enabled (finding §13).
  if (config.server.permissionRelay) {
    server.setPermissionRequestHandler(async (req) => {
      let behavior: 'allow' | 'deny' = 'deny';
      try {
        if (typeof deps.permissionHandler === 'function') {
          const decision = await deps.permissionHandler(req);
          behavior = decision === 'allow' ? 'allow' : 'deny';
        }
      } catch {
        behavior = 'deny';
      }
      await server.emitPermission({ request_id: (req as { request_id?: string })?.request_id as string, behavior });
    });
  }

  // Cache resolved backends per source id (custom backends are imported once).
  const backendCache = new Map<string, Backend>();
  const sourcesById = new Map<string, AnySource>(config.sources.map((s) => [s.id as string, s]));

  async function resolveBackend(source: AnySource): Promise<Backend | undefined> {
    if (backendCache.has(source.id)) return backendCache.get(source.id);
    let backend: Backend | undefined;
    if (looksLikePath(source.backend)) {
      backend = await registry.load(source.backend, config.baseDir);
    } else {
      backend = registry.get(source.backend);
    }
    if (backend) backendCache.set(source.id, backend);
    return backend;
  }

  // Eagerly resolve + validate custom-path backends at startup so a broken
  // custom backend (missing poll/reply, bad import) fails createRuntime rather
  // than the first tick.
  for (const source of config.sources) {
    if (looksLikePath(source.backend)) {
      await resolveBackend(source); // throws -> propagates out of createRuntime
    }
  }

  // Wire the reply tool through relay.dispatchReply — the SINGLE source of truth
  // for the reply path (decode token -> owning source + backend -> backend.reply).
  server.setReplyHandler(async ({ reply_to, text }) =>
    relay.dispatchReply({
      reply_to,
      text,
      http,
      resolveSource: (id) => sourcesById.get(id),
      // Resolve the reply backend from the token's OWN sourceId, not by scanning
      // sources for a matching `type`.
      resolveBackend: async (_backendType, sourceId) => {
        const source = sourcesById.get(sourceId as string);
        if (!source) return undefined;
        return resolveBackend(source) as Promise<Record<string, unknown> | undefined>;
      }
    })
  );

  // Construct a SessionSpawner only when a source actually opts into spawning
  // (DESIGN §7.1).
  const wantsSpawn = config.sources.some(
    (s) => s.onEvent === 'spawn' || s.onEvent === 'both'
  );
  let spawner: SessionSpawner | null = null;
  if (wantsSpawn) {
    spawner = new SessionSpawner({
      client: deps.client,
      loadClient: deps.loadClient,
      configPath: resolveConfigPath(configPathOrYaml),
      replySecret,
      maxConcurrent: config.spawn?.maxConcurrent,
      resolveCliPath: deps.resolveCliPath,
      log: deps.log || (() => {})
    });
    // AC-25: a source needs spawn but no client is injected and the optional dep
    // can't be obtained -> fail STARTUP clearly, not at event time.
    await spawner.validate();
  }

  const poller = new Poller({
    sources: config.sources,
    resolveBackend,
    stateStore,
    server,
    spawner,
    // Mint reply_to under the bound relay so a child sharing the secret can
    // decode tokens this instance emitted (DESIGN §7.6).
    encodeReplyTo: relay.encodeReplyTo,
    http,
    now,
    log: () => {}
  });

  let started = false;

  return {
    server,
    poller,
    config,
    errors,
    async start() {
      if (started) return;
      started = true;
      if (deps.transport) {
        await server.connect(deps.transport);
      }
      poller.start();
    },
    async stop() {
      poller.stop();
      if (started) {
        try {
          await server.close();
        } catch {
          // ignore close errors during teardown
        }
      }
      started = false;
    }
  };
}

/**
 * Resolve the config path for the self-MCP re-launch (DESIGN §7.3): an existing
 * file path is resolved ABSOLUTELY (so the child finds it regardless of cwd);
 * inline YAML (which has no path on disk) is passed through unchanged.
 */
function resolveConfigPath(input: string): string {
  if (typeof input === 'string' && !input.includes('\n')) {
    try {
      if (existsSync(input) && statSync(input).isFile()) {
        return resolve(input);
      }
    } catch {
      // fall through — treat as inline / non-file
    }
  }
  return input;
}

/** Default per-server state dir under ~/.claude/channels/<name>/state. */
function defaultStateDir(name: string | undefined): string {
  const home = process.env.HOME || process.env.USERPROFILE || process.cwd();
  return `${home}/.claude/channels/${name || 'mcp-channels'}/state`;
}
