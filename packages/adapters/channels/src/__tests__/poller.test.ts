import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Poller, MemoryStateStore } from '../index.js';

// SPEC §3 / §6 R5 poller.js.
//   AC-11: Poller calls backend.poll on the configured interval (fake timers).
//   AC-12: the cursor advances and is passed to the next poll.
//   AC-13: no double-trigger across ticks; survivors reach server.emit.
//
// The Poller is fully injectable (DESIGN §6): it is constructed with the source
// list, a backend resolver, a StateStore, a server (with .emit), and injected
// http/now. `tick(sourceId)` runs one poll deterministically without timers.

/** A fake server capturing emitted events. */
function fakeServer() {
  return {
    emitted: [],
    async emit(event) {
      this.emitted.push(event);
    }
  };
}

/** Build a Poller with a single source backed by `backend`. */
function makePoller(backend, { filter, interval = 30, stateStore } = {}) {
  const source = {
    id: 's1',
    backend: 'fake',
    pollIntervalSeconds: interval,
    auth: { token: 't' },
    config: {},
    filter
  };
  const server = fakeServer();
  const store = stateStore || new MemoryStateStore();
  const poller = new Poller({
    sources: [source],
    resolveBackend: () => backend,
    stateStore: store,
    server,
    http: async () => ({ ok: true, status: 200, body: {}, json: async () => ({}) }),
    now: () => new Date('2026-06-16T12:00:00Z'),
    log: () => {}
  });
  return { poller, server, store, source };
}

describe('Poller — tick drives backend.poll and emits survivors (AC-13)', () => {
  it('AC-13: a single tick polls the backend and emits each survivor via server.emit', async () => {
    const backend = {
      type: 'fake',
      poll: vi.fn(async () => ({
        events: [
          { id: 'e1', content: 'hello', meta: { k: 'v' }, payload: {}, routing: { x: 1 } }
        ],
        state: { cursor: 'c1', seen: ['e1'] }
      })),
      reply: async () => ({ ok: true })
    };
    const { poller, server } = makePoller(backend);

    await poller.tick('s1');

    expect(backend.poll).toHaveBeenCalledTimes(1);
    expect(server.emitted).toHaveLength(1);
    expect(server.emitted[0].content).toBe('hello');
    // The core mints reply_to onto meta before emitting.
    expect(server.emitted[0].meta.reply_to).toBeTruthy();
    expect(typeof server.emitted[0].meta.reply_to).toBe('string');
  });

  it('AC-13: the filter gate suppresses non-matching events before emit', async () => {
    const backend = {
      type: 'fake',
      poll: async () => ({
        events: [
          { id: 'keep', content: 'k', meta: {}, payload: { user: { login: 'alice' } }, routing: {} },
          { id: 'drop', content: 'd', meta: {}, payload: { user: { login: 'bob' } }, routing: {} }
        ],
        state: { cursor: 'c', seen: [] }
      }),
      reply: async () => ({ ok: true })
    };
    const filter = { field: 'user.login', op: 'eq', value: 'alice' };
    const { poller, server } = makePoller(backend, { filter });

    await poller.tick('s1');

    expect(server.emitted).toHaveLength(1);
    expect(server.emitted[0].content).toBe('k');
  });
});

describe('Poller — cursor + state persistence across ticks (AC-12, AC-13)', () => {
  it('AC-12: the state returned by poll persists and the cursor is passed to the next poll', async () => {
    const seenCursors = [];
    const backend = {
      type: 'fake',
      poll: vi.fn(async (ctx) => {
        seenCursors.push(ctx.state.cursor);
        const n = seenCursors.length;
        return {
          events: [{ id: `e${n}`, content: `c${n}`, meta: {}, payload: {}, routing: {} }],
          state: { cursor: `cursor-${n}`, seen: [`e${n}`] }
        };
      }),
      reply: async () => ({ ok: true })
    };
    const { poller, store } = makePoller(backend);

    await poller.tick('s1');
    await poller.tick('s1');

    // First poll saw a null cursor; second poll saw the cursor persisted by the first.
    expect(seenCursors[0]).toBeNull();
    expect(seenCursors[1]).toBe('cursor-1');
    // StateStore reflects the latest cursor.
    expect(store.get('s1').cursor).toBe('cursor-2');
  });

  it('AC-13: an event id already in seen is not emitted again on the next tick', async () => {
    // The backend keeps returning the SAME event; dedup via persisted seen-set
    // must guarantee at-most-once.
    const backend = {
      type: 'fake',
      poll: async (ctx) => {
        const seen = ctx.state.seen || [];
        return {
          events: [{ id: 'dup', content: 'same', meta: {}, payload: {}, routing: {} }],
          // backend returns the union so the framework persists it
          state: { cursor: 'c', seen: Array.from(new Set([...seen, 'dup'])) }
        };
      },
      reply: async () => ({ ok: true })
    };
    const { poller, server } = makePoller(backend);

    await poller.tick('s1');
    await poller.tick('s1');

    expect(server.emitted).toHaveLength(1);
  });
});

describe('Poller — boundary ids are not pruned by a small seen bound (finding §3)', () => {
  it('a same-timestamp boundary id survives a small maxSeenPerSource and is NOT re-emitted', async () => {
    // maxSeenPerSource = 2, but poll 1 emits THREE same-timestamp items. A naive
    // count-based FIFO would evict the oldest (e1); the inclusive next poll would
    // then re-emit it. With boundary protection, e1 is retained and deduped.
    const store = new MemoryStateStore({ maxSeenPerSource: 2 });
    let call = 0;
    const backend = {
      type: 'fake',
      poll: async () => {
        call += 1;
        const base = [
          { id: 'e1', content: '1', meta: {}, payload: {}, routing: {} },
          { id: 'e2', content: '2', meta: {}, payload: {}, routing: {} },
          { id: 'e3', content: '3', meta: {}, payload: {}, routing: {} }
        ];
        // Poll 2 re-returns the SAME three (overlap) plus a new e4.
        const events = call === 1 ? base : [...base, { id: 'e4', content: '4', meta: {}, payload: {}, routing: {} }];
        return { events, state: { cursor: 'T', seen: [] } };
      },
      reply: async () => ({ ok: true })
    };
    const { poller, server } = makePoller(backend, { stateStore: store });

    await poller.tick('s1'); // emits e1,e2,e3
    await poller.tick('s1'); // must emit ONLY e4 (e1 not re-emitted)

    const ids = server.emitted.map((e) => e.content);
    expect(ids).toEqual(['1', '2', '3', '4']);
    // No duplicate of any earlier id.
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Poller — ticks for the same source are serialized (finding §8)', () => {
  it('two overlapping ticks do not lose state (the second sees the first\'s cursor)', async () => {
    const store = new MemoryStateStore();
    const seenCursors = [];
    let resolveFirst;
    const firstGate = new Promise((r) => {
      resolveFirst = r;
    });
    let call = 0;
    const backend = {
      type: 'fake',
      poll: async (ctx) => {
        call += 1;
        seenCursors.push(ctx.state.cursor);
        const n = call;
        if (n === 1) {
          // Hold the first tick open so the second tick is fired while it runs.
          await firstGate;
        }
        return {
          events: [{ id: `e${n}`, content: `c${n}`, meta: {}, payload: {}, routing: {} }],
          state: { cursor: `cursor-${n}`, seen: [`e${n}`] }
        };
      },
      reply: async () => ({ ok: true })
    };
    const { poller, server } = makePoller(backend, { stateStore: store });

    // Fire two ticks back-to-back WITHOUT awaiting the first.
    const t1 = poller.tick('s1');
    const t2 = poller.tick('s1');
    // Let the second tick attempt to start (it must be queued behind the first).
    await new Promise((r) => setTimeout(r, 10));
    // The first is still blocked, so the backend has been entered exactly once.
    expect(call).toBe(1);
    resolveFirst();
    await Promise.all([t1, t2]);

    // Serialization proof: the second tick observed the cursor the FIRST persisted,
    // not the stale null both would have read under a race.
    expect(seenCursors[0]).toBeNull();
    expect(seenCursors[1]).toBe('cursor-1');
    expect(store.get('s1').cursor).toBe('cursor-2');
    expect(server.emitted.map((e) => e.content)).toEqual(['c1', 'c2']);
  });
});

describe('Poller — slow polls coalesce, backlog stays bounded (finding §16)', () => {
  it('many tick() fires while a poll is slow do NOT queue unboundedly (coalesced to 2, not 1-per-fire)', async () => {
    const store = new MemoryStateStore();
    let entered = 0;
    let resolveFirst;
    const firstGate = new Promise((r) => {
      resolveFirst = r;
    });
    const backend = {
      type: 'fake',
      poll: async (ctx) => {
        entered += 1;
        const n = entered;
        // The FIRST poll is slow: hold it open while a burst of ticks fires.
        if (n === 1) await firstGate;
        return {
          events: [{ id: `e${n}`, content: `c${n}`, meta: {}, payload: {}, routing: {} }],
          state: { cursor: `cursor-${n}`, seen: [`e${n}`] }
        };
      },
      reply: async () => ({ ok: true })
    };
    const { poller, server } = makePoller(backend, { stateStore: store });

    // Fire the first tick (it blocks inside poll), then a BURST of 50 more while
    // the first is still in flight. A naive unconditional chain would enqueue all
    // 50; coalescing keeps at most ONE pending behind the active one.
    const first = poller.tick('s1');
    const burst = [];
    for (let i = 0; i < 50; i += 1) burst.push(poller.tick('s1'));
    // Let the burst settle into the scheduler (still blocked on firstGate).
    await new Promise((r) => setTimeout(r, 10));

    // Only the first poll has been ENTERED so far (the rest are coalesced/pending).
    expect(entered).toBe(1);

    // Release the slow first poll; drain everything.
    resolveFirst();
    await Promise.all([first, ...burst]);

    // The whole burst collapsed to a SINGLE coalesced follow-up poll: 2 total,
    // NOT 51 (one-per-fire). This proves the backlog is bounded.
    expect(entered).toBe(2);
    // And the coalesced follow-up still observed the cursor the first persisted
    // (no-lost-update preserved despite coalescing).
    expect(server.emitted.map((e) => e.content)).toEqual(['c1', 'c2']);
    expect(store.get('s1').cursor).toBe('cursor-2');
  });
});

describe('Poller — interval scheduling with fake timers (AC-11)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-11: start() polls each source on its configured interval', async () => {
    const backend = {
      type: 'fake',
      poll: vi.fn(async () => ({ events: [], state: { cursor: 'c', seen: [] } })),
      reply: async () => ({ ok: true })
    };
    const { poller } = makePoller(backend, { interval: 30 });

    poller.start();
    // Advance three 30s intervals; expect ~3 polls (exact count tolerant of an
    // optional immediate kickoff).
    await vi.advanceTimersByTimeAsync(90_000);
    poller.stop();

    expect(backend.poll.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('AC-11: there is NO premature first poll, and the count is EXACT per interval (finding §15)', async () => {
    const backend = {
      type: 'fake',
      poll: vi.fn(async () => ({ events: [], state: { cursor: 'c', seen: [] } })),
      reply: async () => ({ ok: true })
    };
    const { poller } = makePoller(backend, { interval: 30 });

    poller.start();
    // No poll happens before the first interval elapses.
    await vi.advanceTimersByTimeAsync(29_000);
    expect(backend.poll.mock.calls.length).toBe(0);

    // Exactly one poll at 30s.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(backend.poll.mock.calls.length).toBe(1);

    // Exactly N polls after N intervals (30s each).
    await vi.advanceTimersByTimeAsync(90_000); // +3 intervals -> total 4
    expect(backend.poll.mock.calls.length).toBe(4);

    poller.stop();
  });

  it('AC-11: stop() halts further polling', async () => {
    const backend = {
      type: 'fake',
      poll: vi.fn(async () => ({ events: [], state: { cursor: 'c', seen: [] } })),
      reply: async () => ({ ok: true })
    };
    const { poller } = makePoller(backend, { interval: 30 });

    poller.start();
    await vi.advanceTimersByTimeAsync(60_000);
    const countAtStop = backend.poll.mock.calls.length;
    poller.stop();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(backend.poll.mock.calls.length).toBe(countAtStop);
  });
});

// SPEC §10 AC-22 / DESIGN §7.6 — the poller routes each survivor per the
// source's effective `onEvent`: emit -> server.emit, spawn -> spawner.spawn,
// both -> both. The Poller gains an INJECTED `spawner` ({ spawn(source,event) }).
// The spawn promise is dispatched (not awaited to completion), so we record the
// call synchronously and flush a microtask turn before asserting.

/** A fake spawner recording every spawn(source, event) call. */
function fakeSpawner() {
  return {
    calls: [],
    spawn(source, event) {
      this.calls.push({ source, event });
      return Promise.resolve({ ok: true, handle: { id: 'h' } });
    }
  };
}

/** Build a Poller whose single source has a given onEvent, with a fake spawner. */
function makeRoutedPoller(onEvent) {
  const backend = {
    type: 'fake',
    poll: async () => ({
      events: [
        { id: 'ev1', content: 'routed', meta: { k: 'v' }, payload: {}, routing: { r: 1 } }
      ],
      state: { cursor: 'c', seen: [] }
    }),
    reply: async () => ({ ok: true })
  };
  const source = {
    id: 's1',
    backend: 'fake',
    pollIntervalSeconds: 30,
    auth: { token: 't' },
    config: {},
    onEvent
  };
  const server = fakeServer();
  const spawner = fakeSpawner();
  const poller = new Poller({
    sources: [source],
    resolveBackend: () => backend,
    stateStore: new MemoryStateStore(),
    server,
    spawner,
    http: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    now: () => new Date('2026-06-16T12:00:00Z'),
    log: () => {}
  });
  return { poller, server, spawner, source };
}

/** Flush pending microtasks so a void-dispatched spawn promise records its call. */
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Poller — action routing per onEvent (AC-22)', () => {
  it('AC-22: onEvent "emit" emits and NEVER spawns', async () => {
    const { poller, server, spawner } = makeRoutedPoller('emit');
    await poller.tick('s1');
    await flush();

    expect(server.emitted).toHaveLength(1);
    expect(server.emitted[0].content).toBe('routed');
    expect(spawner.calls).toHaveLength(0);
  });

  it('AC-22: onEvent "spawn" spawns and NEVER emits', async () => {
    const { poller, server, spawner } = makeRoutedPoller('spawn');
    await poller.tick('s1');
    await flush();

    expect(server.emitted).toHaveLength(0);
    expect(spawner.calls).toHaveLength(1);
    // The spawner is called with (source, event) — the SAME source and the event
    // carrying the minted reply_to in its meta.
    expect(spawner.calls[0].source.id).toBe('s1');
    expect(spawner.calls[0].event.id).toBe('ev1');
    expect(spawner.calls[0].event.content).toBe('routed');
    expect(spawner.calls[0].event.meta.reply_to).toBeTruthy();
  });

  it('AC-22: onEvent "both" emits AND spawns the same survivor (shared reply_to)', async () => {
    const { poller, server, spawner } = makeRoutedPoller('both');
    await poller.tick('s1');
    await flush();

    expect(server.emitted).toHaveLength(1);
    expect(spawner.calls).toHaveLength(1);
    // The emitted meta and the spawned event carry the SAME reply_to token.
    const emittedToken = server.emitted[0].meta.reply_to;
    const spawnedToken = spawner.calls[0].event.meta.reply_to;
    expect(emittedToken).toBeTruthy();
    expect(spawnedToken).toBe(emittedToken);
  });

  it('AC-22: a default source (no onEvent) emits and does not spawn even when a spawner is present', async () => {
    // Build a routed poller but strip onEvent off the source to prove the default.
    const { poller, server, spawner, source } = makeRoutedPoller('emit');
    delete source.onEvent;
    await poller.tick('s1');
    await flush();

    expect(server.emitted).toHaveLength(1);
    expect(spawner.calls).toHaveLength(0);
  });
});
