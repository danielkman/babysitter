/**
 * SPEC §7 determinism contract:
 * "Same seed + same command sequence => identical state (unit-tested)."
 */
import { describe, expect, it } from 'vitest';

import type { ServerFrame } from '../../../contracts/gateway-protocol';
import { generateScenario } from '../scenario';
import { Simulation } from '../simulation';

function collectFrames(sim: Simulation): ServerFrame[] {
  const frames: ServerFrame[] = [];
  sim.onFrame((frame) => frames.push(frame));
  return frames;
}

/** A scripted command sequence that reads sim state (itself deterministic). */
function runCommandScript(sim: Simulation): void {
  sim.tick(10);

  const idle = sim.listUnitViews().find((unit) => unit.state === 'idle');
  const queued = sim.listTaskViews().find((task) => task.state === 'queued');
  if (idle && queued) {
    sim.handleClientFrame({
      type: 'session.start',
      agent: idle.agent,
      sessionId: idle.unitId,
      prompt: `Capture objective task:${queued.taskId}`,
    });
  }

  sim.tick(60);

  const hook = sim.listPendingHooks()[0];
  if (hook) {
    sim.handleClientFrame({
      type: 'hook.decision',
      hookRequestId: hook.hookRequestId,
      decision: 'allow',
    });
  }

  sim.tick(40);

  const working = sim
    .listUnitViews()
    .find((unit) => unit.state === 'thinking' || unit.state === 'tool_running');
  if (working) {
    sim.handleClientFrame({
      type: 'session.message',
      sessionId: working.unitId,
      prompt: '/abort',
    });
  }

  sim.tick(90);
}

describe('simulation determinism', () => {
  it('generates an identical scenario for the same seed', () => {
    expect(generateScenario(42)).toEqual(generateScenario(42));
  });

  it('seeds 10-16 units across >=4 adapters and 6-10 tasks across 2-3 workspaces', () => {
    for (const seed of [1, 7, 42, 1337, 99999]) {
      const scenario = generateScenario(seed);
      expect(scenario.units.length).toBeGreaterThanOrEqual(10);
      expect(scenario.units.length).toBeLessThanOrEqual(16);
      expect(new Set(scenario.units.map((unit) => unit.agent)).size).toBeGreaterThanOrEqual(4);
      expect(scenario.tasks.length).toBeGreaterThanOrEqual(6);
      expect(scenario.tasks.length).toBeLessThanOrEqual(10);
      expect(scenario.workspaces.length).toBeGreaterThanOrEqual(2);
      expect(scenario.workspaces.length).toBeLessThanOrEqual(3);
    }
  });

  it('two engines with the same seed produce deep-equal snapshots after 200 ticks', () => {
    const a = new Simulation({ seed: 42 });
    const b = new Simulation({ seed: 42 });
    a.tick(200);
    b.tick(200);
    const snapA = a.snapshot();
    const snapB = b.snapshot();
    expect(snapB).toEqual(snapA);
    // Snapshots must be JSON-serializable (replay/inspection surface).
    expect(JSON.parse(JSON.stringify(snapA))).toEqual(snapA);
    expect(snapA.rngDraws).toBeGreaterThan(0);
  });

  it('two engines with the same seed emit identical frame streams', () => {
    const a = new Simulation({ seed: 7 });
    const b = new Simulation({ seed: 7 });
    const framesA = collectFrames(a);
    const framesB = collectFrames(b);
    a.tick(150);
    b.tick(150);
    expect(framesA.length).toBeGreaterThan(0);
    expect(framesB).toEqual(framesA);
  });

  it('same seed + same command sequence => identical state', () => {
    const a = new Simulation({ seed: 42 });
    const b = new Simulation({ seed: 42 });
    runCommandScript(a);
    runCommandScript(b);
    expect(b.snapshot()).toEqual(a.snapshot());
  });

  it('different seeds diverge', () => {
    const a = new Simulation({ seed: 42 });
    const b = new Simulation({ seed: 1337 });
    a.tick(50);
    b.tick(50);
    expect(b.snapshot()).not.toEqual(a.snapshot());
  });

  it('tick(20) twice equals tick(40) once (single-step composability)', () => {
    const a = new Simulation({ seed: 42 });
    const b = new Simulation({ seed: 42 });
    a.tick(20);
    a.tick(20);
    b.tick(40);
    expect(b.snapshot()).toEqual(a.snapshot());
  });

  it('pause blocks auto-ticking but manual tick() still advances', () => {
    const sim = new Simulation({ seed: 42 });
    expect(sim.paused).toBe(false);
    sim.pause();
    expect(sim.paused).toBe(true);
    const before = sim.tickIndex;
    sim.tick(5);
    expect(sim.tickIndex).toBe(before + 5);
    sim.resume();
    expect(sim.paused).toBe(false);
  });
});
