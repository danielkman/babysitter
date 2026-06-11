/**
 * Transcript stream tests (SPEC §7/§14, AC11 — HUD phase): consecutive
 * text_delta/thinking_delta frames collapse into a single growing transcript
 * entry per turn (and NEVER spam the ticker), and tool entries carry
 * name + duration metadata for the Inspector.
 */
import { describe, expect, it } from 'vitest';

import { MockBackend } from '../../backend/mock/mockBackend';
import type { RunEventFrame } from '../../contracts/gateway-protocol';
import {
  bindBackendToStore,
  createCommanderStore,
  type CommanderStore,
  type TickCommitInput,
} from '../store';

interface Rig {
  backend: MockBackend;
  store: CommanderStore;
}

function makeRig(seed: number): Rig {
  const backend = new MockBackend({ seed, autoStart: false });
  const store = createCommanderStore();
  bindBackendToStore(store, backend).flush();
  return { backend, store };
}

function runEvent(
  runId: string,
  sessionId: string,
  event: Record<string, unknown>,
): RunEventFrame {
  return { type: 'run.event', runId, seq: 0, source: 'mock', event: { sessionId, runId, ...event } };
}

function commit(rig: Rig, frames: RunEventFrame[], tickIndex: number): void {
  const input: TickCommitInput = {
    frames,
    units: rig.backend.sim.listUnitViews(),
    tasks: rig.backend.sim.listTaskViews(),
    hooks: rig.backend.sim.listPendingHooks(),
    nowMs: tickIndex * 250,
    tickIndex,
    paused: true,
  };
  rig.store.getState().commitTick(input);
}

describe('text_delta collapse (SPEC §14 noise control)', () => {
  it('folds consecutive deltas into one growing entry and keeps them out of the ticker', () => {
    const rig = makeRig(42);
    const unitId = rig.store.getState().world.unitIds[0]!;
    const eventsBefore = rig.store.getState().events.length;

    commit(
      rig,
      [
        runEvent('run-t', unitId, { type: 'text_delta', timestamp: 1, delta: 'a', accumulated: 'a' }),
        runEvent('run-t', unitId, { type: 'text_delta', timestamp: 2, delta: 'b', accumulated: 'ab' }),
        runEvent('run-t', unitId, { type: 'text_delta', timestamp: 3, delta: 'c', accumulated: 'abc' }),
      ],
      1,
    );

    const unit = rig.store.getState().world.units[unitId]!;
    const textEntries = unit.transcript.filter((t) => t.kind === 'text');
    expect(textEntries).toHaveLength(1);
    expect(textEntries[0]?.text).toBe('abc');
    // The ticker never sees raw deltas.
    expect(rig.store.getState().events.length).toBe(eventsBefore);
  });

  it('alternating kinds break the fold; same-kind runs never sit adjacent', () => {
    const rig = makeRig(42);
    const unitId = rig.store.getState().world.unitIds[0]!;

    commit(
      rig,
      [
        runEvent('run-t', unitId, { type: 'thinking_delta', timestamp: 1, delta: 'h', accumulated: 'h' }),
        runEvent('run-t', unitId, { type: 'thinking_delta', timestamp: 2, delta: 'm', accumulated: 'hm' }),
        runEvent('run-t', unitId, { type: 'text_delta', timestamp: 3, delta: 'x', accumulated: 'x' }),
        runEvent('run-t', unitId, { type: 'text_delta', timestamp: 4, delta: 'y', accumulated: 'xy' }),
        runEvent('run-t', unitId, { type: 'thinking_delta', timestamp: 5, delta: 'z', accumulated: 'z' }),
      ],
      1,
    );

    const transcript = rig.store.getState().world.units[unitId]!.transcript;
    expect(transcript.map((t) => [t.kind, t.text])).toEqual([
      ['thinking', 'hm'],
      ['text', 'xy'],
      ['thinking', 'z'],
    ]);
    for (let i = 1; i < transcript.length; i += 1) {
      const prev = transcript[i - 1]!;
      const curr = transcript[i]!;
      if (curr.kind === 'text' || curr.kind === 'thinking') {
        expect(prev.kind).not.toBe(curr.kind);
      }
    }
  });

  it('the collapse invariant holds over real sim traffic', () => {
    const backend = new MockBackend({ seed: 42, autoStart: false });
    const store = createCommanderStore();
    const binding = bindBackendToStore(store, backend);
    binding.flush();
    const s0 = store.getState();
    binding.orders.dispatchToTask([s0.world.unitIds[0]!], s0.world.taskIds[0]!);
    for (let i = 0; i < 30; i += 1) {
      backend.sim.tick(10);
      binding.flush();
    }
    let sawDelta = false;
    for (const id of store.getState().world.unitIds) {
      const transcript = store.getState().world.units[id]!.transcript;
      for (let i = 0; i < transcript.length; i += 1) {
        const entry = transcript[i]!;
        if (entry.kind !== 'text' && entry.kind !== 'thinking') continue;
        sawDelta = true;
        if (i > 0) expect(transcript[i - 1]!.kind).not.toBe(entry.kind);
      }
    }
    expect(sawDelta).toBe(true);
  });
});

describe('tool transcript metadata (Inspector name + duration)', () => {
  it('tool_call_start/tool_result entries carry toolName, durationMs and status', () => {
    const rig = makeRig(42);
    const unitId = rig.store.getState().world.unitIds[0]!;

    commit(
      rig,
      [
        runEvent('run-t', unitId, { type: 'tool_call_start', timestamp: 1, toolName: 'bash' }),
        runEvent('run-t', unitId, { type: 'tool_result', timestamp: 2, toolName: 'bash', durationMs: 420 }),
      ],
      1,
    );

    const tools = rig.store
      .getState()
      .world.units[unitId]!.transcript.filter((t) => t.kind === 'tool');
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ toolName: 'bash', toolStatus: 'running' });
    expect(tools[1]).toMatchObject({ toolName: 'bash', toolStatus: 'done', durationMs: 420 });
  });
});
