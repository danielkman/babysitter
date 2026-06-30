// Poller — per-source scheduling + the inbound pipeline (SPEC §3/§6 R5,
// DESIGN §1/§3.1).
//
// For each source, on its scheduled tick (or a test's explicit tick(id)):
//   1. load state           StateStore.get(id) -> { cursor, seen }
//   2. poll the backend      backend.poll({ source, state, http, log, now })
//   3. FILTER (core)         keep events whose payload satisfies source.filter
//   4. DEDUP (core)          drop events whose id is already in seen
//   5. mint reply_to         attach the opaque routing token to event.meta
//   6. persist state         StateStore.set(id, { cursor', seen ∪ survivor ids })
//   7. EMIT                  server.emit({ content, meta }) per survivor
//
// Filtering happens BEFORE dedup so a non-matching event is simply ignored that
// tick (not recorded as seen). Dedup is the authoritative at-most-once gate.

import { compileFilter } from './filter.js';
import { deriveNew } from './dedup.js';
import { encodeReplyTo as defaultEncodeReplyTo } from './relay.js';
import type { Backend, ChannelEvent, ReplyToken } from './types.js';
import type { StateStoreLike } from './state.js';

type AnySource = Record<string, any>;

/** A spawner-like seam the poller dispatches surviving events to. */
export interface SpawnerLike {
  spawn(source: AnySource, event: ChannelEvent): unknown;
}

/** A server-like seam the poller emits surviving events to. */
export interface EmitTargetLike {
  emit(event: { content: string; meta: Record<string, unknown> }): void | Promise<void>;
}

export interface PollerDeps {
  sources: AnySource[];
  resolveBackend: (source: AnySource) => Backend | undefined | Promise<Backend | undefined>;
  stateStore: StateStoreLike;
  server: EmitTargetLike;
  spawner?: SpawnerLike | null;
  encodeReplyTo?: (record: ReplyToken) => string;
  http: (url: string | URL, opts?: Record<string, unknown>) => Promise<unknown>;
  now?: () => Date;
  log?: (...args: unknown[]) => void;
}

export class Poller {
  sources: AnySource[];
  resolveBackend: PollerDeps['resolveBackend'];
  stateStore: StateStoreLike;
  server: EmitTargetLike;
  spawner: SpawnerLike | null;
  encodeReplyTo: (record: ReplyToken) => string;
  http: PollerDeps['http'];
  now: () => Date;
  log: (...args: unknown[]) => void;
  _byId: Map<string, AnySource>;
  _timers: Map<string, ReturnType<typeof setInterval>>;
  _initialized: Set<string>;
  _active: Map<string, Promise<void>>;
  _pending: Map<string, Promise<void>>;

  constructor({
    sources,
    resolveBackend,
    stateStore,
    server,
    spawner,
    encodeReplyTo,
    http,
    now,
    log
  }: PollerDeps) {
    this.sources = sources || [];
    this.resolveBackend = resolveBackend;
    this.stateStore = stateStore;
    this.server = server;
    this.spawner = spawner || null;
    // The reply_to minter. Injected (secret-bound) by the runtime when a shared
    // replySecret is configured; otherwise the module's per-process function.
    this.encodeReplyTo = typeof encodeReplyTo === 'function' ? encodeReplyTo : defaultEncodeReplyTo;
    this.http = http;
    this.now = now || (() => new Date());
    this.log = log || (() => {});
    this._byId = new Map(this.sources.map((s) => [s.id, s]));
    this._timers = new Map();
    this._initialized = new Set();
    /** the in-flight tick per source. */
    this._active = new Map();
    /** the single COALESCED follow-up per source. */
    this._pending = new Map();
  }

  /**
   * Run a single poll for one source. Ticks for the SAME source are SERIALIZED
   * AND COALESCED:
   *  - if no tick is in flight, this one runs immediately;
   *  - if a tick is in flight and NONE is pending, exactly ONE follow-up is
   *    scheduled to run after the active one settles;
   *  - if a tick is in flight and a follow-up is ALREADY pending, this call is
   *    COALESCED onto that single pending tick.
   * Ticks for DIFFERENT sources run concurrently. Errors are isolated so one
   * failing tick doesn't poison the next.
   */
  tick(sourceId: string): Promise<void> {
    // No tick in flight → run now and record it as the active one.
    if (!this._active.has(sourceId)) {
      const run = this._runTick(sourceId)
        .catch(() => {})
        .finally(() => {
          if (this._active.get(sourceId) === run) this._active.delete(sourceId);
        });
      this._active.set(sourceId, run);
      return run;
    }

    // A tick is in flight. If one is already pending, coalesce onto it.
    const pending = this._pending.get(sourceId);
    if (pending) return pending;

    // Otherwise schedule EXACTLY ONE follow-up after the active tick settles.
    const active = this._active.get(sourceId)!;
    const next = active
      .then(
        () => {},
        () => {}
      )
      .then(() => {
        // Promote the pending tick to active before running it.
        this._pending.delete(sourceId);
        const run = this._runTick(sourceId)
          .catch(() => {})
          .finally(() => {
            if (this._active.get(sourceId) === run) this._active.delete(sourceId);
          });
        this._active.set(sourceId, run);
        return run;
      });
    this._pending.set(sourceId, next);
    return next;
  }

  /**
   * The actual single-poll body (no serialization). Use `tick()` externally.
   */
  async _runTick(sourceId: string): Promise<void> {
    const source = this._byId.get(sourceId);
    if (!source) return;

    const backend = await this.resolveBackend(source);
    if (!backend) {
      this.log(`poller: no backend for source "${sourceId}"`);
      return;
    }

    // One-time init before the first poll of this source.
    if (!this._initialized.has(sourceId)) {
      this._initialized.add(sourceId);
      if (typeof backend.init === 'function') {
        await backend.init(source);
      }
    }

    const state = this.stateStore.get(sourceId);

    const polled = await backend.poll({
      source,
      state,
      http: this.http,
      log: this.log,
      now: this.now()
    });

    const events: ChannelEvent[] = Array.isArray(polled?.events) ? polled.events : [];

    // (3) FILTER — core is the authoritative gate.
    const predicate = compileFilter(source.filter);
    const matched = events.filter((e) => predicate(e?.payload));

    // (4) DEDUP — at-most-once across overlapping windows.
    const { fresh, seen } = deriveNew(matched, {
      idOf: (e) => e.id,
      seen: state.seen || []
    });

    // (6) persist: cursor advances; seen is the union (store enforces the bound).
    // Protect this tick's window ids from FIFO eviction so a boundary id still
    // inside the cursor window can't be pruned and then re-emitted next poll
    // (finding §3). The boundary bucket is a subset of the current window, so
    // passing every matched id is a safe superset to keep.
    const nextCursor = polled?.state?.cursor ?? null;
    const keepSeen = matched.map((e) => e.id);
    await this.stateStore.set(sourceId, { cursor: nextCursor, seen, keepSeen });

    // (5) mint reply_to + (7) DISPATCH each survivor per the source's effective
    // onEvent (DESIGN §7.6): emit -> server.emit, spawn -> spawner.spawn, both ->
    // both. The SAME minted reply_to is shared between the emitted meta and the
    // spawned event. Default is 'emit' (today's behavior) so existing sources
    // never spawn.
    const action = source.onEvent || 'emit';
    const doEmit = action === 'emit' || action === 'both';
    const doSpawn = (action === 'spawn' || action === 'both') && this.spawner;

    for (const ev of fresh) {
      const reply_to = this.encodeReplyTo({
        sourceId,
        backendType: backend.type || source.backend,
        routing: ev.routing || {}
      });
      // The event carrying the minted reply_to in its meta (shared by both paths).
      const meta = { ...(ev.meta || {}), reply_to };

      if (doEmit) {
        await this.server.emit({ content: ev.content, meta });
      }

      if (doSpawn) {
        // Spawn is dispatched but NOT awaited to completion (the spawner bounds
        // concurrency + isolates errors internally), so a slow/failing launch
        // never stalls the tick or blocks sibling events.
        const spawnEvent = { ...ev, meta };
        const p = this.spawner!.spawn(source, spawnEvent) as { catch?: (fn: (err: unknown) => void) => unknown };
        if (p && typeof p.catch === 'function') {
          p.catch((err: unknown) =>
            this.log(`poller: spawn dispatch failed for "${sourceId}": ${(err as Error)?.message || err}`)
          );
        }
      }
    }
  }

  /** Start interval polling for every source. */
  start(): void {
    for (const source of this.sources) {
      const ms = Math.max(1, Number(source.pollIntervalSeconds) || 60) * 1000;
      const timer = setInterval(() => {
        this.tick(source.id).catch((err) =>
          this.log(`poller: tick("${source.id}") failed: ${(err as Error)?.message || err}`)
        );
      }, ms);
      // Don't keep the process alive solely for polling.
      if (typeof timer.unref === 'function') timer.unref();
      this._timers.set(source.id, timer);
    }
  }

  /** Stop all interval polling. */
  stop(): void {
    for (const timer of this._timers.values()) {
      clearInterval(timer);
    }
    this._timers.clear();
  }
}
