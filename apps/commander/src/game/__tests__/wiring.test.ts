/**
 * Frame→store routing tests (SPEC §6/§7, AC4/AC5/AC6/AC13): MockBackend with
 * autoStart:false + manual tick, single batched commit per tick batch, alert
 * lifecycle, dispatch/abort orders, ring buffer cap, store determinism.
 */
import { describe, expect, it } from 'vitest';

import { MockBackend } from '../../backend/mock/mockBackend';
import {
  bindBackendToStore,
  createCommanderStore,
  EVENT_RING_CAP,
  type BackendBinding,
  type CommanderState,
  type CommanderStore,
} from '../store';

interface Rig {
  backend: MockBackend;
  store: CommanderStore;
  binding: BackendBinding;
}

function makeRig(seed: number): Rig {
  const backend = new MockBackend({ seed, autoStart: false });
  const store = createCommanderStore();
  const binding = bindBackendToStore(store, backend);
  binding.flush();
  return { backend, store, binding };
}

function tickFlush(rig: Rig, n: number): void {
  rig.backend.sim.tick(n);
  rig.binding.flush();
}

/** Tick in chunks until the predicate holds (bounded — sim is deterministic). */
function tickUntil(rig: Rig, predicate: (s: CommanderState) => boolean, maxTicks = 4000): boolean {
  for (let i = 0; i < maxTicks; i += 10) {
    if (predicate(rig.store.getState())) return true;
    tickFlush(rig, 10);
  }
  return predicate(rig.store.getState());
}

/** Deterministic, comparable projection of the store (AC13). */
function snapshot(store: CommanderStore): string {
  const s = store.getState();
  return JSON.stringify({
    units: s.world.unitIds.map((id) => s.world.units[id]?.view),
    tasks: s.world.taskIds.map((id) => s.world.tasks[id]?.view),
    positions: s.world.positions,
    events: s.events,
    alerts: s.alerts,
    resources: s.meta.resources,
    simTimeMs: s.meta.simTimeMs,
    tickIndex: s.meta.tickIndex,
  });
}

describe('boot ingest', () => {
  it('populates the world from the seeded sim before any tick', () => {
    const rig = makeRig(42);
    const s = rig.store.getState();
    expect(s.world.unitIds.length).toBeGreaterThanOrEqual(10);
    expect(s.world.taskIds.length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(s.world.positions).length).toBe(s.world.unitIds.length + s.world.taskIds.length);
    expect(s.meta.resources.unitCount).toBe(s.world.unitIds.length);
    expect(s.meta.resources.tasksTotal).toBe(s.world.taskIds.length);
    for (const id of s.world.unitIds) {
      expect(s.world.units[id]?.view.state).toBe('idle');
    }
  });

  it('marks the connection on the hello frame', async () => {
    const rig = makeRig(42);
    expect(rig.store.getState().meta.connection).toBe('connecting');
    await rig.backend.connect();
    rig.binding.flush();
    expect(rig.store.getState().meta.connection).toBe('connected');
  });
});

describe('one commit per tick batch (SPEC §6)', () => {
  it('coalesces a multi-tick batch + frames into exactly one setState', async () => {
    const rig = makeRig(42);
    let commits = 0;
    const unsub = rig.store.subscribe(() => {
      commits += 1;
    });
    tickFlush(rig, 10);
    expect(commits).toBe(1);
    await Promise.resolve(); // the scheduled microtask flush must be a no-op
    expect(commits).toBe(1);
    unsub();
  });
});

describe('dispatch order routing (AC4)', () => {
  it('session.start with task:<id> assigns the unit, moves it, logs the order', () => {
    const rig = makeRig(42);
    const s0 = rig.store.getState();
    const unitId = s0.world.unitIds[0]!;
    const taskId = s0.world.taskIds[0]!;
    const stagingPos = s0.world.positions[unitId]!;

    rig.binding.orders.dispatchToTask([unitId], taskId);

    const s1 = rig.store.getState();
    expect(s1.world.units[unitId]?.view.state).toBe('dispatching');
    expect(s1.world.units[unitId]?.view.taskId).toBe(taskId);
    expect(s1.world.tasks[taskId]?.view.assigneeIds).toContain(unitId);
    expect(s1.world.tasks[taskId]?.view.state).toBe('assigned');

    // Optimistic motion: position retargets toward the task orbit.
    const newPos = s1.world.positions[unitId]!;
    const taskPos = s1.world.positions[taskId]!;
    expect(newPos).not.toEqual(stagingPos);
    const dist = Math.hypot(newPos.x - taskPos.x, newPos.y - taskPos.y);
    expect(dist).toBeLessThanOrEqual(90);

    // Ticker logs the order with the unit as entity (AC4/AC10).
    const entry = s1.events.find((e) => /dispatch|assign|order/i.test(e.text));
    expect(entry).toBeDefined();
    expect(entry?.entityId).toBe(unitId);
  });
});

describe('abort routing (AC5)', () => {
  it('returns the unit to idle and logs the abort', () => {
    const rig = makeRig(42);
    const unitId = rig.store.getState().world.unitIds[0]!;
    const taskId = rig.store.getState().world.taskIds[0]!;
    rig.binding.orders.dispatchToTask([unitId], taskId);
    const working = tickUntil(rig, (s) => {
      const st = s.world.units[unitId]?.view.state;
      return st === 'thinking' || st === 'tool_running';
    });
    expect(working).toBe(true);

    rig.binding.orders.abort([unitId]);
    const s = rig.store.getState();
    expect(s.world.units[unitId]?.view.state).toBe('idle');
    expect(s.world.units[unitId]?.view.runId).toBeNull();
    expect(s.events.some((e) => /abort/i.test(e.text))).toBe(true);
  });
});

describe('operator verbs routing (SPEC §8: Retire / Pause / Prioritize)', () => {
  it('orders.retire despawns the idle unit, drops a fade ping and logs the ticker', () => {
    const rig = makeRig(42);
    const s0 = rig.store.getState();
    const unitId = s0.world.unitIds[0]!;
    const title = s0.world.units[unitId]?.view.title ?? '';
    const before = s0.world.unitIds.length;

    rig.binding.orders.retire([unitId]);

    const s1 = rig.store.getState();
    expect(s1.world.units[unitId]).toBeUndefined();
    expect(s1.world.unitIds.length).toBe(before - 1);
    expect(s1.meta.resources.unitCount).toBe(before - 1);
    expect(s1.meta.pings.length).toBeGreaterThan(0);
    const entry = s1.events.find((e) => /retired/i.test(e.text));
    expect(entry).toBeDefined();
    expect(entry?.text).toContain(title);
  });

  it('orders.retire on a busy selection warns instead of despawning', () => {
    const rig = makeRig(42);
    const unitId = rig.store.getState().world.unitIds[0]!;
    const taskId = rig.store.getState().world.taskIds[0]!;
    rig.binding.orders.dispatchToTask([unitId], taskId);

    rig.binding.orders.retire([unitId]);

    const s = rig.store.getState();
    expect(s.world.units[unitId]).toBeDefined();
    expect(s.events.some((e) => /retire ignored/i.test(e.text))).toBe(true);
  });

  it('orders.pauseUnits holds the run (view.paused), resumeUnits releases it', () => {
    const rig = makeRig(42);
    const unitId = rig.store.getState().world.unitIds[0]!;
    const taskId = rig.store.getState().world.taskIds[0]!;
    rig.binding.orders.dispatchToTask([unitId], taskId);
    const working = tickUntil(rig, (s) => {
      const st = s.world.units[unitId]?.view.state;
      return st === 'thinking' || st === 'tool_running';
    });
    expect(working).toBe(true);

    rig.binding.orders.pauseUnits([unitId]);
    let s = rig.store.getState();
    expect(s.world.units[unitId]?.view.paused).toBe(true);
    expect(s.events.some((e) => /paused by operator/i.test(e.text))).toBe(true);

    const stateBefore = s.world.units[unitId]?.view.state;
    tickFlush(rig, 40);
    s = rig.store.getState();
    expect(s.world.units[unitId]?.view.state).toBe(stateBefore);

    rig.binding.orders.resumeUnits([unitId]);
    s = rig.store.getState();
    expect(s.world.units[unitId]?.view.paused).toBe(false);
    expect(s.events.some((e) => /back online/i.test(e.text))).toBe(true);
  });

  it('orders.prioritize bumps the task priority and logs the ticker', () => {
    const rig = makeRig(42);
    const taskId = rig.store.getState().world.taskIds[0]!;

    rig.binding.orders.prioritize(taskId);

    const s = rig.store.getState();
    expect(s.world.tasks[taskId]?.view.priority).toBeGreaterThan(0);
    const entry = s.events.find((e) => /priority/i.test(e.text));
    expect(entry).toBeDefined();
    expect(entry?.entityId).toBe(taskId);
  });
});

describe('alert lifecycle (AC6)', () => {
  it('hook.request fills the alerts slice + ping; decision clears it', () => {
    const rig = makeRig(42);
    const fired = tickUntil(rig, (s) => s.alerts.length > 0, 6000);
    expect(fired).toBe(true);

    const s = rig.store.getState();
    const alert = s.alerts[0]!;
    expect(alert.hookRequestId).toMatch(/^hook-/);
    expect(alert.runId).toMatch(/^run-/);
    expect(s.world.units[alert.unitId]?.view.state).toBe('awaiting_approval');
    expect(typeof alert.kind).toBe('string');
    expect(alert.deadlineTs).toBeGreaterThan(0);
    expect(s.meta.resources.alertCount).toBe(s.alerts.length);
    expect(s.meta.pings.some((p) => p.id === `ping-${alert.hookRequestId}`)).toBe(true);

    rig.binding.orders.decide(alert.hookRequestId, 'allow');
    const after = rig.store.getState();
    expect(after.alerts.find((a) => a.hookRequestId === alert.hookRequestId)).toBeUndefined();
    expect(after.world.units[alert.unitId]?.view.state).not.toBe('awaiting_approval');
  });
});

describe('events ring buffer (SPEC §6)', () => {
  it(`caps the ticker at ${EVENT_RING_CAP} entries`, () => {
    const rig = makeRig(42);
    for (let i = 0; i < 40; i += 1) {
      tickFlush(rig, 100);
    }
    const s = rig.store.getState();
    expect(s.events.length).toBeLessThanOrEqual(EVENT_RING_CAP);
    expect(s.events.length).toBeGreaterThan(100); // it actually streamed
  });
});

describe('store determinism (AC13)', () => {
  it('same seed + same tick batches ⇒ identical store snapshots', () => {
    const a = makeRig(42);
    const b = makeRig(42);
    tickFlush(a, 20);
    tickFlush(b, 20);
    expect(snapshot(a.store)).toBe(snapshot(b.store));

    tickFlush(a, 20);
    tickFlush(b, 20);
    expect(snapshot(a.store)).toBe(snapshot(b.store));
  });

  it('same seed + same command sequence ⇒ identical store snapshots', () => {
    const a = makeRig(7);
    const b = makeRig(7);
    for (const rig of [a, b]) {
      const unitId = rig.store.getState().world.unitIds[2]!;
      const taskId = rig.store.getState().world.taskIds[1]!;
      rig.binding.orders.dispatchToTask([unitId], taskId);
      tickFlush(rig, 35);
      rig.binding.orders.abort([unitId]);
      tickFlush(rig, 15);
    }
    expect(snapshot(a.store)).toBe(snapshot(b.store));
  });

  it('different seeds diverge (sanity)', () => {
    const a = makeRig(42);
    const b = makeRig(43);
    tickFlush(a, 20);
    tickFlush(b, 20);
    expect(snapshot(a.store)).not.toBe(snapshot(b.store));
  });
});
