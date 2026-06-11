/**
 * Frame-shape tests: every frame the sim emits must structurally match the
 * mirrored gateway protocol v1 types (type discriminators present, run.event
 * carries a numeric per-run seq, hook.request carries deadlineTs, ...).
 */
import { describe, expect, it } from 'vitest';

import type { RunEventFrame, ServerFrame } from '../../../contracts/gateway-protocol';
import { Simulation } from '../simulation';

const SERVER_FRAME_TYPES = new Set([
  'hello',
  'error',
  'pong',
  'run.event',
  'hook.request',
  'hook.resolved',
  'pairing.consumed',
]);

/** Adapter event discriminants the sim is allowed to put inside run.event. */
const ADAPTER_EVENT_TYPES = new Set([
  'session_start',
  'session_resume',
  'session_end',
  'turn_start',
  'turn_end',
  'message_start',
  'text_delta',
  'message_stop',
  'thinking_start',
  'thinking_delta',
  'thinking_stop',
  'tool_call_start',
  'tool_input_delta',
  'tool_call_ready',
  'tool_result',
  'tool_error',
  'cost',
  'token_usage',
  'approval_request',
  'approval_granted',
  'approval_denied',
  'aborted',
  'paused',
  'resumed',
  'context_limit_warning',
  'error',
  // Sim-local task lifecycle payloads riding the open run.event envelope:
  'task_assigned',
  'task_progress',
  'task_completed',
  'task_failed',
]);

function collect(sim: Simulation): ServerFrame[] {
  const frames: ServerFrame[] = [];
  sim.onFrame((frame) => frames.push(frame));
  return frames;
}

describe('emitted frame shapes', () => {
  it('only emits known ServerFrame discriminators', () => {
    const sim = new Simulation({ seed: 42 });
    const frames = collect(sim);
    sim.tick(400);
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(SERVER_FRAME_TYPES.has(frame.type)).toBe(true);
    }
  });

  it('run.event frames carry runId, increasing seq, source, and a BaseEvent-shaped payload', () => {
    const sim = new Simulation({ seed: 42 });
    const frames = collect(sim);
    sim.tick(400);

    const runEvents = frames.filter((f): f is RunEventFrame => f.type === 'run.event');
    expect(runEvents.length).toBeGreaterThan(0);

    const lastSeqByRun = new Map<string, number>();
    for (const frame of runEvents) {
      expect(typeof frame.runId).toBe('string');
      expect(frame.runId.length).toBeGreaterThan(0);
      expect(Number.isInteger(frame.seq)).toBe(true);
      expect(typeof frame.source).toBe('string');
      expect(frame.event).toBeTypeOf('object');

      const event = frame.event;
      expect(typeof event['type']).toBe('string');
      expect(ADAPTER_EVENT_TYPES.has(event['type'] as string)).toBe(true);
      expect(typeof event['runId']).toBe('string');
      expect(typeof event['agent']).toBe('string');
      expect(typeof event['timestamp']).toBe('number');

      // seq must be strictly increasing per run.
      const last = lastSeqByRun.get(frame.runId);
      if (last !== undefined) {
        expect(frame.seq).toBeGreaterThan(last);
      }
      lastSeqByRun.set(frame.runId, frame.seq);
    }
  });

  it('emits the SPEC-named adapter events over a long run', () => {
    const sim = new Simulation({ seed: 42 });
    const frames = collect(sim);
    sim.tick(1200);
    const seen = new Set(
      frames
        .filter((f): f is RunEventFrame => f.type === 'run.event')
        .map((f) => f.event['type'] as string),
    );
    for (const required of [
      'session_start',
      'turn_start',
      'text_delta',
      'tool_call_start',
      'tool_result',
      'turn_end',
      'session_end',
      'token_usage',
    ]) {
      expect(seen.has(required), `missing run.event payload type: ${required}`).toBe(true);
    }
  });

  it('hook.request frames match the protocol and reference live runs', () => {
    const sim = new Simulation({ seed: 42 });
    const frames = collect(sim);
    let hookFrame: ServerFrame | undefined;
    for (let i = 0; i < 3000 && !hookFrame; i += 1) {
      sim.tick(1);
      hookFrame = frames.find((f) => f.type === 'hook.request');
    }
    expect(hookFrame).toBeDefined();
    if (!hookFrame || hookFrame.type !== 'hook.request') throw new Error('unreachable');

    expect(typeof hookFrame.hookRequestId).toBe('string');
    expect(hookFrame.hookRequestId.length).toBeGreaterThan(0);
    expect(typeof hookFrame.runId).toBe('string');
    expect(hookFrame.hookKind).toBe('approval');
    expect(hookFrame.payload).toBeTypeOf('object');
    expect(typeof hookFrame.payload['action']).toBe('string');
    expect(typeof hookFrame.payload['detail']).toBe('string');
    expect(typeof hookFrame.deadlineTs).toBe('number');
    expect(hookFrame.deadlineTs).toBeGreaterThan(0);

    const run = sim.listRuns().find((r) => r.runId === hookFrame?.runId);
    expect(run).toBeDefined();
  });

  it('auth -> hello handshake and ping -> pong heartbeat', () => {
    const sim = new Simulation({ seed: 42 });
    const frames = collect(sim);
    sim.handleClientFrame({ type: 'auth', token: 'mock-token' });
    sim.handleClientFrame({ type: 'ping' });

    const hello = frames.find((f) => f.type === 'hello');
    expect(hello).toBeDefined();
    if (hello && hello.type === 'hello') {
      expect(hello.protocolVersions).toEqual(['1']);
      expect(typeof hello.serverVersion).toBe('string');
      expect(typeof hello.serverTime).toBe('string');
      expect(Number.isNaN(Date.parse(hello.serverTime))).toBe(false);
    }
    expect(frames.some((f) => f.type === 'pong')).toBe(true);
  });

  it('token usage and cost accumulate over sim time (top-bar resource feed)', () => {
    const sim = new Simulation({ seed: 42 });
    sim.tick(300);
    const sessions = sim.listSessions();
    const totalTokens = sessions.reduce(
      (sum, s) => sum + (s.cost ? s.cost.inputTokens + s.cost.outputTokens : 0),
      0,
    );
    const totalUsd = sessions.reduce((sum, s) => sum + (s.cost ? s.cost.totalUsd : 0), 0);
    expect(totalTokens).toBeGreaterThan(0);
    expect(totalUsd).toBeGreaterThan(0);

    sim.tick(300);
    const later = sim.listSessions();
    const laterTokens = later.reduce(
      (sum, s) => sum + (s.cost ? s.cost.inputTokens + s.cost.outputTokens : 0),
      0,
    );
    expect(laterTokens).toBeGreaterThan(totalTokens);
  });
});
