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

describe('operator verbs (SPEC §8: Retire / Pause / Prioritize)', () => {
  it('retireUnit removes an idle unit from the world and emits unit_retired', () => {
    const sim = new Simulation({ seed: 42 });
    const frames: ServerFrame[] = [];
    sim.onFrame((frame) => frames.push(frame));
    const idle = firstIdleUnit(sim);
    const before = sim.listUnitViews().length;

    expect(sim.retireUnit(idle.unitId)).toBe(true);

    expect(sim.listUnitViews().length).toBe(before - 1);
    expect(sim.listUnitViews().find((u) => u.unitId === idle.unitId)).toBeUndefined();
    const retired = frames.find(
      (f) => f.type === 'run.event' && f.event['type'] === 'unit_retired',
    );
    expect(retired).toBeDefined();
    expect(retired?.type === 'run.event' && retired.event['unitId']).toBe(idle.unitId);

    // Subsequent ticks must not crash on the missing unit.
    sim.tick(20);
  });

  it('retireUnit refuses a busy unit with a unit_busy error frame', () => {
    const sim = new Simulation({ seed: 42 });
    const frames: ServerFrame[] = [];
    sim.onFrame((frame) => frames.push(frame));
    const idle = firstIdleUnit(sim);
    const taskId = firstQueuedTaskId(sim);
    sim.handleClientFrame({
      type: 'session.start',
      agent: idle.agent,
      sessionId: idle.unitId,
      prompt: `task:${taskId}`,
    });

    expect(sim.retireUnit(idle.unitId)).toBe(false);

    expect(sim.listUnitViews().find((u) => u.unitId === idle.unitId)).toBeDefined();
    const error = frames.find((f) => f.type === 'error' && f.code === 'unit_busy');
    expect(error).toBeDefined();
  });

  it('pauseUnit freezes a working unit across ticks; resumeUnit releases it', () => {
    const sim = new Simulation({ seed: 42 });
    const idle = firstIdleUnit(sim);
    const taskId = firstQueuedTaskId(sim);
    sim.handleClientFrame({
      type: 'session.start',
      agent: idle.agent,
      sessionId: idle.unitId,
      prompt: `task:${taskId}`,
    });
    // Reach a working state, then hold.
    for (let i = 0; i < 200; i += 1) {
      const view = unitView(sim, idle.unitId);
      if (view.state === 'thinking' || view.state === 'tool_running') break;
      sim.tick(1);
    }
    const before = unitView(sim, idle.unitId);
    expect(['thinking', 'tool_running']).toContain(before.state);

    expect(sim.pauseUnit(idle.unitId)).toBe(true);
    sim.tick(60);

    const frozen = unitView(sim, idle.unitId);
    expect(frozen.paused).toBe(true);
    expect(frozen.state).toBe(before.state);
    expect(frozen.tokenUsage).toEqual(before.tokenUsage);
    expect(frozen.turnIndex).toBe(before.turnIndex);

    expect(sim.resumeUnit(idle.unitId)).toBe(true);
    expect(unitView(sim, idle.unitId).paused).toBe(false);
    // Released: bounded ticks must produce observable progress again.
    let progressed = false;
    for (let i = 0; i < 400 && !progressed; i += 1) {
      sim.tick(1);
      const now = unitView(sim, idle.unitId);
      progressed =
        now.state !== frozen.state ||
        now.turnIndex !== frozen.turnIndex ||
        now.tokenUsage.outputTokens !== frozen.tokenUsage.outputTokens ||
        now.tokenUsage.thinkingTokens !== frozen.tokenUsage.thinkingTokens;
    }
    expect(progressed).toBe(true);
  });

  it('pauseUnit refuses idle units and double-holds; abort clears the hold', () => {
    const sim = new Simulation({ seed: 42 });
    const idle = firstIdleUnit(sim);
    expect(sim.pauseUnit(idle.unitId)).toBe(false);

    const taskId = firstQueuedTaskId(sim);
    sim.handleClientFrame({
      type: 'session.start',
      agent: idle.agent,
      sessionId: idle.unitId,
      prompt: `task:${taskId}`,
    });
    expect(sim.pauseUnit(idle.unitId)).toBe(true);
    expect(sim.pauseUnit(idle.unitId)).toBe(false);

    sim.handleClientFrame({ type: 'session.message', sessionId: idle.unitId, prompt: '/abort' });
    const view = unitView(sim, idle.unitId);
    expect(view.state).toBe('idle');
    expect(view.paused).toBe(false);
  });

  it('steering a held unit releases the hold', () => {
    const sim = new Simulation({ seed: 42 });
    const idle = firstIdleUnit(sim);
    sim.handleClientFrame({
      type: 'session.start',
      agent: idle.agent,
      sessionId: idle.unitId,
      prompt: 'go',
    });
    sim.pauseUnit(idle.unitId);
    expect(unitView(sim, idle.unitId).paused).toBe(true);
    sim.handleClientFrame({
      type: 'session.message',
      sessionId: idle.unitId,
      prompt: 'change of plans, soldier',
    });
    expect(unitView(sim, idle.unitId).paused).toBe(false);
  });

  it('prioritizeTask bumps view.priority and idle auto-dispatch prefers it', () => {
    const sim = new Simulation({ seed: 42 });
    const tasks = sim.listTaskViews().filter((t) => t.state === 'queued');
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    const target = tasks[tasks.length - 1]!;

    expect(sim.prioritizeTask(target.taskId)).toBe(true);
    const view = sim.listTaskViews().find((t) => t.taskId === target.taskId);
    expect(view?.priority).toBeGreaterThan(0);

    // The FIRST auto-dispatch after prioritization must target it.
    let dispatchedTo: string | null = null;
    for (let i = 0; i < 3000 && dispatchedTo === null; i += 1) {
      sim.tick(1);
      const mover = sim.listUnitViews().find((u) => u.taskId !== null);
      if (mover) dispatchedTo = mover.taskId;
    }
    expect(dispatchedTo).toBe(target.taskId);
  });

  it('re-prioritizing another task outranks the previous priority', () => {
    const sim = new Simulation({ seed: 7 });
    const queued = sim.listTaskViews().filter((t) => t.state === 'queued');
    expect(queued.length).toBeGreaterThanOrEqual(2);
    const first = queued[0]!;
    const second = queued[1]!;
    sim.prioritizeTask(first.taskId);
    sim.prioritizeTask(second.taskId);
    const views = sim.listTaskViews();
    const p1 = views.find((t) => t.taskId === first.taskId)?.priority ?? 0;
    const p2 = views.find((t) => t.taskId === second.taskId)?.priority ?? 0;
    expect(p2).toBeGreaterThan(p1);
  });

  it('prioritizeTask on unknown task emits task_not_found, not a crash', () => {
    const sim = new Simulation({ seed: 42 });
    const frames: ServerFrame[] = [];
    sim.onFrame((frame) => frames.push(frame));
    expect(sim.prioritizeTask('no-such-task')).toBe(false);
    expect(frames.some((f) => f.type === 'error' && f.code === 'task_not_found')).toBe(true);
  });

  it('determinism: same seed + same operator-verb sequence ⇒ identical snapshots and frames', () => {
    const script = (sim: Simulation, frames: ServerFrame[]): void => {
      sim.onFrame((frame) => frames.push(frame));
      sim.tick(5);
      const queued = sim.listTaskViews().find((t) => t.state === 'queued');
      if (queued) sim.prioritizeTask(queued.taskId);
      const idle = sim.listUnitViews().filter((u) => u.state === 'idle');
      const retiree = idle[0];
      if (retiree) sim.retireUnit(retiree.unitId);
      const recruit = idle[1];
      if (recruit && queued) {
        sim.handleClientFrame({
          type: 'session.start',
          agent: recruit.agent,
          sessionId: recruit.unitId,
          prompt: `task:${queued.taskId}`,
        });
      }
      sim.tick(30);
      if (recruit) {
        sim.pauseUnit(recruit.unitId);
        sim.tick(25);
        sim.resumeUnit(recruit.unitId);
      }
      sim.tick(60);
    };

    const a = new Simulation({ seed: 1337 });
    const b = new Simulation({ seed: 1337 });
    const framesA: ServerFrame[] = [];
    const framesB: ServerFrame[] = [];
    script(a, framesA);
    script(b, framesB);
    expect(b.snapshot()).toEqual(a.snapshot());
    expect(framesB).toEqual(framesA);
    expect(framesA.length).toBeGreaterThan(0);
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
