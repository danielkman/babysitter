/**
 * SPEC §7 command effects: commands sent via send() MUST visibly affect the
 * sim — dispatch assigns a unit to a task and advances state; hook.decision
 * allow resumes / deny blocks; abort idles the unit.
 */
import { describe, expect, it } from 'vitest';

import type { ServerFrame } from '../../../contracts/gateway-protocol';
import { MockBackend } from '../mockBackend';
import type { SimHookView, SimUnitView } from '../simulation';
import { Simulation } from '../simulation';

function firstIdleUnit(sim: Simulation): SimUnitView {
  const unit = sim.listUnitViews().find((u) => u.state === 'idle');
  if (!unit) throw new Error('no idle unit at boot');
  return unit;
}

function firstQueuedTaskId(sim: Simulation): string {
  const task = sim.listTaskViews().find((t) => t.state === 'queued');
  if (!task) throw new Error('no queued task at boot');
  return task.taskId;
}

function unitView(sim: Simulation, unitId: string): SimUnitView {
  const unit = sim.listUnitViews().find((u) => u.unitId === unitId);
  if (!unit) throw new Error(`unit not found: ${unitId}`);
  return unit;
}

/** Tick (bounded) until a pending approval hook exists; returns it. */
function tickUntilHook(sim: Simulation, maxTicks = 3000): SimHookView {
  for (let i = 0; i < maxTicks; i += 1) {
    const hook = sim.listPendingHooks()[0];
    if (hook) return hook;
    sim.tick(1);
  }
  throw new Error(`no hook.request surfaced within ${maxTicks} ticks`);
}

describe('command effects on the simulation', () => {
  it('session.start with task ref dispatches the unit onto the task', () => {
    const sim = new Simulation({ seed: 42 });
    const idle = firstIdleUnit(sim);
    const taskId = firstQueuedTaskId(sim);

    sim.handleClientFrame({
      type: 'session.start',
      agent: idle.agent,
      sessionId: idle.unitId,
      prompt: `Capture objective task:${taskId}`,
    });

    const unit = unitView(sim, idle.unitId);
    expect(unit.state).toBe('dispatching');
    expect(unit.taskId).toBe(taskId);
    expect(unit.runId).not.toBeNull();

    const task = sim.listTaskViews().find((t) => t.taskId === taskId);
    expect(task?.state).toBe('assigned');
    expect(task?.assigneeIds).toContain(idle.unitId);

    const run = sim.listRuns().find((r) => r.runId === unit.runId);
    expect(run?.status).toBe('running');
    expect(run?.sessionId).toBe(idle.unitId);

    // The unit leaves `dispatching` for `thinking` after its travel time.
    sim.tick(5);
    expect(unitView(sim, idle.unitId).state).not.toBe('idle');
  });

  it('session.start without sessionId clones a brand-new unit', () => {
    const sim = new Simulation({ seed: 42 });
    const before = sim.listUnitViews().length;
    sim.handleClientFrame({
      type: 'session.start',
      agent: 'codex',
      prompt: 'Reinforce the line',
    });
    const units = sim.listUnitViews();
    expect(units.length).toBe(before + 1);
    const recruit = units[units.length - 1];
    expect(recruit?.agent).toBe('codex');
    expect(recruit?.state).toBe('dispatching');
  });

  it('session.start on a busy unit emits a session_busy error frame', () => {
    const sim = new Simulation({ seed: 42 });
    const frames: ServerFrame[] = [];
    sim.onFrame((frame) => frames.push(frame));
    const idle = firstIdleUnit(sim);
    sim.handleClientFrame({
      type: 'session.start',
      agent: idle.agent,
      sessionId: idle.unitId,
      prompt: 'go',
    });
    sim.handleClientFrame({
      type: 'session.start',
      agent: idle.agent,
      sessionId: idle.unitId,
      prompt: 'go again',
    });
    const error = frames.find((f) => f.type === 'error');
    expect(error).toBeDefined();
    expect(error?.type === 'error' && error.code).toBe('session_busy');
  });

  it('hook.decision allow resumes the unit (gated tool proceeds)', () => {
    const sim = new Simulation({ seed: 42 });
    const frames: ServerFrame[] = [];
    sim.onFrame((frame) => frames.push(frame));

    const hook = tickUntilHook(sim);
    expect(unitView(sim, hook.unitId).state).toBe('awaiting_approval');

    sim.handleClientFrame({
      type: 'hook.decision',
      hookRequestId: hook.hookRequestId,
      decision: 'allow',
    });

    expect(unitView(sim, hook.unitId).state).toBe('tool_running');
    expect(sim.listPendingHooks().map((h) => h.hookRequestId)).not.toContain(hook.hookRequestId);

    const resolved = frames.find(
      (f) => f.type === 'hook.resolved' && f.hookRequestId === hook.hookRequestId,
    );
    expect(resolved).toBeDefined();
    expect(resolved?.type === 'hook.resolved' && resolved.decision).toBe('allow');
  });

  it('hook.decision deny blocks the unit', () => {
    const sim = new Simulation({ seed: 1337 });
    const frames: ServerFrame[] = [];
    sim.onFrame((frame) => frames.push(frame));

    const hook = tickUntilHook(sim);
    sim.handleClientFrame({
      type: 'hook.decision',
      hookRequestId: hook.hookRequestId,
      decision: 'deny',
      reason: 'not on my watch',
    });

    expect(unitView(sim, hook.unitId).state).toBe('blocked');
    const resolved = frames.find(
      (f) => f.type === 'hook.resolved' && f.hookRequestId === hook.hookRequestId,
    );
    expect(resolved?.type === 'hook.resolved' && resolved.decision).toBe('deny');

    // Steering a blocked unit resumes it.
    sim.handleClientFrame({
      type: 'session.message',
      sessionId: hook.unitId,
      prompt: 'try a different approach, soldier',
    });
    expect(unitView(sim, hook.unitId).state).toBe('thinking');
  });

  it('abort (/abort stop-intent) idles the unit and aborts the run', () => {
    const sim = new Simulation({ seed: 42 });
    const idle = firstIdleUnit(sim);
    const taskId = firstQueuedTaskId(sim);
    sim.handleClientFrame({
      type: 'session.start',
      agent: idle.agent,
      sessionId: idle.unitId,
      prompt: `task:${taskId}`,
    });
    const runId = unitView(sim, idle.unitId).runId;
    expect(runId).not.toBeNull();
    sim.tick(6);

    sim.handleClientFrame({
      type: 'session.message',
      sessionId: idle.unitId,
      prompt: '/abort',
    });

    const unit = unitView(sim, idle.unitId);
    expect(unit.state).toBe('idle');
    expect(unit.runId).toBeNull();
    expect(unit.taskId).toBeNull();

    const run = sim.listRuns().find((r) => r.runId === runId);
    expect(run?.status).toBe('aborted');
    expect(run?.exitReason).toBe('aborted');

    // The objective returns to the queue (sole assignee gone).
    const task = sim.listTaskViews().find((t) => t.taskId === taskId);
    expect(task?.assigneeIds).not.toContain(idle.unitId);
    expect(task?.state).toBe('queued');
  });

  it('unknown hookRequestId / session / task produce error frames, not crashes', () => {
    const sim = new Simulation({ seed: 42 });
    const frames: ServerFrame[] = [];
    sim.onFrame((frame) => frames.push(frame));
    sim.handleClientFrame({ type: 'hook.decision', hookRequestId: 'nope', decision: 'allow' });
    sim.handleClientFrame({ type: 'session.message', sessionId: 'ghost', prompt: 'hello?' });
    const idle = firstIdleUnit(sim);
    sim.handleClientFrame({
      type: 'session.start',
      agent: idle.agent,
      sessionId: idle.unitId,
      prompt: 'task:does-not-exist',
    });
    const codes = frames.filter((f) => f.type === 'error').map((f) => (f.type === 'error' ? f.code : ''));
    expect(codes).toContain('hook_not_found');
    expect(codes).toContain('session_not_found');
    expect(codes).toContain('task_not_found');
    // The unknown-task dispatch must NOT have started a run.
    expect(unitView(sim, idle.unitId).state).toBe('idle');
  });
});

describe('MockBackend over the simulation', () => {
  it('implements the CommanderBackend list surface from the seeded world', async () => {
    const backend = new MockBackend({ seed: 42, autoStart: false });
    await backend.connect();
    try {
      const agents = await backend.listAgents();
      expect(agents.length).toBeGreaterThanOrEqual(4);
      expect(agents.map((a) => a.agent)).toEqual(
        expect.arrayContaining(['claude-code', 'codex', 'gemini-cli', 'pi']),
      );

      const sessions = await backend.listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(10);
      expect(sessions.length).toBeLessThanOrEqual(16);

      const tasks = await backend.listTasks();
      expect(tasks.length).toBeGreaterThanOrEqual(6);
      expect(tasks.length).toBeLessThanOrEqual(10);
      for (const task of tasks) {
        expect(task.apiVersion).toBe('kradle.a5c.ai/v1alpha1');
        expect(task.kind).toBe('AgentDispatchRun');
        expect(task.status.phase).toBe('Pending');
      }

      expect(await backend.listRuns()).toEqual([]);
    } finally {
      backend.disconnect();
    }
  });

  it('send()/onFrame() round-trips protocol frames (ping -> pong)', async () => {
    const backend = new MockBackend({ seed: 42, autoStart: false });
    const frames: ServerFrame[] = [];
    const unsubscribe = backend.onFrame((frame) => frames.push(frame));
    await backend.connect(); // emits hello
    backend.send({ type: 'ping' });
    expect(frames.some((f) => f.type === 'hello')).toBe(true);
    expect(frames.some((f) => f.type === 'pong')).toBe(true);
    unsubscribe();
    backend.send({ type: 'ping' });
    expect(frames.filter((f) => f.type === 'pong')).toHaveLength(1);
    backend.disconnect();
  });

  it('dispatch via backend.send() visibly affects sim state', async () => {
    const backend = new MockBackend({ seed: 42, autoStart: false });
    await backend.connect();
    try {
      const sim = backend.sim;
      const idle = firstIdleUnit(sim);
      const taskId = firstQueuedTaskId(sim);
      backend.send({
        type: 'session.start',
        agent: idle.agent,
        sessionId: idle.unitId,
        prompt: `task:${taskId}`,
      });
      expect(unitView(sim, idle.unitId).state).toBe('dispatching');
      const runs = await backend.listRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe('running');
    } finally {
      backend.disconnect();
    }
  });
});
