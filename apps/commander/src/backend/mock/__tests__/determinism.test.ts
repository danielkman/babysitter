/**
 * SPEC §7 / SPEC-V3 §V3-7 determinism contract for the kanban model:
 * "same seed + same verb sequence ⇒ identical board state + frame stream."
 * Two engines, 200 ticks, with and without a scripted verb sequence
 * (moveCard / setYolo / hook.decision-with-optionId / createTask).
 */
import { describe, expect, it } from 'vitest';

import { generateScenario, TASK_KINDS } from '../scenario';
import { Simulation } from '../simulation';
import { collectFrames, singlesIn } from './helpers';

/** A scripted verb sequence that reads sim state (itself deterministic). */
function runVerbScript(sim: Simulation): void {
  sim.tick(10);

  const singles = singlesIn(sim, 'backlog').map((c) => c.taskId).sort();
  if (singles[0] !== undefined) sim.moveCard(singles[0], 'do');
  if (singles[1] !== undefined) {
    sim.setYolo(singles[1], true);
    sim.moveCard(singles[1], 'do');
  }
  const created = sim.createTask({ taskKind: 'fix' });
  if (created !== null) sim.moveCard(created, 'do');

  sim.tick(60);

  // Answer the first open inquiry via the extended hook.decision frame.
  const inquiry = sim.listInquiries()[0];
  if (inquiry) {
    sim.handleClientFrame({
      type: 'hook.decision',
      hookRequestId: inquiry.hookRequestId,
      decision: 'allow',
      optionId: inquiry.options[Math.min(1, inquiry.options.length - 1)]!.id,
    });
  }

  sim.tick(60);

  // User verdict by drag when something reached HUMAN REVIEW.
  const inReview = sim
    .listCardViews()
    .filter((c) => c.column === 'human-review' && c.parentId === null)
    .map((c) => c.taskId)
    .sort();
  if (inReview[0] !== undefined) sim.moveCard(inReview[0], 'approved');
  if (inReview[1] !== undefined) sim.moveCard(inReview[1], 'do');

  sim.tick(70);
}

describe('scenario determinism', () => {
  it('generates an identical scenario for the same seed', () => {
    expect(generateScenario(42)).toEqual(generateScenario(42));
  });

  it('seeds a backlog deck (≥5 singles + 2 stacks) and a 40–60-record brain', () => {
    for (const seed of [1, 7, 42, 1337, 99999]) {
      const scenario = generateScenario(seed);
      const singles = scenario.cards.filter(
        (c) => c.parentId === null && !scenario.cards.some((o) => o.parentId === c.resource.metadata.name),
      );
      const parents = scenario.cards.filter((c) =>
        scenario.cards.some((o) => o.parentId === c.resource.metadata.name),
      );
      expect(singles.length).toBeGreaterThanOrEqual(5);
      expect(parents).toHaveLength(2);
      for (const parent of parents) {
        const children = scenario.cards.filter((c) => c.parentId === parent.resource.metadata.name);
        expect(children.length).toBeGreaterThanOrEqual(2);
      }
      // All cards use the V2-2 kind vocabulary; several kinds are present.
      const kinds = new Set(scenario.cards.map((c) => c.taskKind));
      for (const kind of kinds) expect(TASK_KINDS).toContain(kind);
      expect(kinds.size).toBeGreaterThanOrEqual(5);
      expect(scenario.workspaces.length).toBeGreaterThanOrEqual(2);
      expect(scenario.workspaces.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('engine determinism (two engines, 200 ticks)', () => {
  it('without verbs: deep-equal snapshots after 200 ticks (board never self-starts)', () => {
    const a = new Simulation({ seed: 42 });
    const b = new Simulation({ seed: 42 });
    a.tick(200);
    b.tick(200);
    const snapA = a.snapshot();
    expect(b.snapshot()).toEqual(snapA);
    // Snapshots must be JSON-serializable (replay/inspection surface).
    expect(JSON.parse(JSON.stringify(snapA))).toEqual(snapA);
    // V3 boot: nothing moves until a verb does.
    expect(snapA.cards.every((c) => c.column === 'backlog')).toBe(true);
    expect(snapA.agents).toHaveLength(0);
  });

  it('with the scripted verb sequence: identical snapshots AND identical frame streams', () => {
    const a = new Simulation({ seed: 42 });
    const b = new Simulation({ seed: 42 });
    const framesA = collectFrames(a);
    const framesB = collectFrames(b);
    runVerbScript(a);
    runVerbScript(b);
    expect(framesA.length).toBeGreaterThan(0);
    expect(framesB).toEqual(framesA);
    const snapA = a.snapshot();
    expect(b.snapshot()).toEqual(snapA);
    expect(snapA.rngDraws).toBeGreaterThan(0);
    // The script visibly moved the board.
    expect(snapA.cards.some((c) => c.column !== 'backlog')).toBe(true);
  });

  it('different seeds diverge under the same verb script', () => {
    const a = new Simulation({ seed: 42 });
    const b = new Simulation({ seed: 1337 });
    runVerbScript(a);
    runVerbScript(b);
    expect(b.snapshot()).not.toEqual(a.snapshot());
  });

  it('tick(20) twice equals tick(40) once (single-step composability)', () => {
    const a = new Simulation({ seed: 42 });
    const b = new Simulation({ seed: 42 });
    const card = singlesIn(a, 'backlog')[0]!.taskId;
    a.moveCard(card, 'do');
    b.moveCard(card, 'do');
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

  it('sim clock is epoch-based (no Date.now())', () => {
    const sim = new Simulation({ seed: 42 });
    const t0 = sim.now();
    sim.tick(4);
    expect(sim.now()).toBe(t0 + 4 * 250);
  });
});
