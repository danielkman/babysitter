/**
 * Selection reducer tests (SPEC §5/§6, AC2/AC3/AC8): click select / shift
 * toggle, marquee merge, control group assign/recall, recall-again camera
 * centering, Esc cascade. Uses the real seeded sim world (autoStart: false).
 * V3 note: the boot world has ZERO units (SPEC-V3 §V3-2), so the slice is
 * exercised over task-card entity ids; the F idle-cycle test was RETIRED
 * with the idle-unit command set.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { MockBackend } from '../../backend/mock/mockBackend';
import {
  applyClickSelection,
  applyMarqueeSelection,
  bindBackendToStore,
  createCommanderStore,
  sameSelectionSet,
  type BackendBinding,
  type CommanderStore,
} from '../store';

describe('pure selection helpers', () => {
  it('click select replaces the previous selection', () => {
    expect(applyClickSelection(['a', 'b'], 'c', false)).toEqual(['c']);
  });

  it('shift-click toggles membership preserving order', () => {
    expect(applyClickSelection(['a', 'b'], 'c', true)).toEqual(['a', 'b', 'c']);
    expect(applyClickSelection(['a', 'b', 'c'], 'b', true)).toEqual(['a', 'c']);
  });

  it('marquee replaces unless shift merges without duplicates', () => {
    expect(applyMarqueeSelection(['x'], ['a', 'b'], false)).toEqual(['a', 'b']);
    expect(applyMarqueeSelection(['a', 'x'], ['a', 'b'], true)).toEqual(['a', 'x', 'b']);
  });

  it('sameSelectionSet is order-insensitive', () => {
    expect(sameSelectionSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameSelectionSet(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('store selection slice over the seeded world', () => {
  let store: CommanderStore;
  let binding: BackendBinding;
  let unitIds: string[];

  beforeEach(() => {
    const backend = new MockBackend({ seed: 42, autoStart: false });
    store = createCommanderStore();
    binding = bindBackendToStore(store, backend);
    binding.flush();
    // V3 boot world: zero units; cards are the selectable entities.
    unitIds = store.getState().world.taskIds;
    expect(unitIds.length).toBeGreaterThanOrEqual(5);
  });

  it('clickSelect clears previous; shift-click adds/removes (AC2)', () => {
    const [a, b] = [unitIds[0]!, unitIds[1]!];
    store.getState().clickSelect(a, false);
    expect(store.getState().selection.ids).toEqual([a]);
    store.getState().clickSelect(b, false);
    expect(store.getState().selection.ids).toEqual([b]);
    store.getState().clickSelect(a, true);
    expect(store.getState().selection.ids).toEqual([b, a]);
    store.getState().clickSelect(b, true);
    expect(store.getState().selection.ids).toEqual([a]);
  });

  it('control groups: Ctrl+digit stores, digit recalls, recall-again centers (AC8)', () => {
    const picked = unitIds.slice(0, 3);
    store.getState().select(picked);
    store.getState().assignGroup('1');
    store.getState().clearSelection();
    expect(store.getState().selection.ids).toEqual([]);

    store.getState().recallGroup('1');
    expect([...store.getState().selection.ids].sort()).toEqual([...picked].sort());

    // Recall-again centers the camera on the group centroid.
    const before = store.getState().camera;
    store.getState().recallGroup('1');
    const after = store.getState().camera;
    const positions = picked.map((id) => store.getState().world.positions[id]!);
    const cx = positions.reduce((acc, p) => acc + p.x, 0) / positions.length;
    const cy = positions.reduce((acc, p) => acc + p.y, 0) / positions.length;
    expect(after.x).toBeCloseTo(cx, 6);
    expect(after.y).toBeCloseTo(cy, 6);
    expect(after.zoom).toBe(before.zoom);
  });

  it('recalling an empty/unknown group is a no-op', () => {
    store.getState().select([unitIds[0]!]);
    store.getState().recallGroup('7');
    expect(store.getState().selection.ids).toEqual([unitIds[0]]);
  });

  it('escape cascade: steer modal closes first and keeps the selection (HUD phase)', () => {
    store.getState().select([unitIds[0]!]);
    store.getState().openInspector(unitIds[0]!);
    store.getState().openSteer();

    store.getState().escape();
    expect(store.getState().meta.steerOpen).toBe(false);
    expect(store.getState().meta.inspectorUnitId).toBe(unitIds[0]); // untouched this pass
    expect(store.getState().selection.ids).toEqual([unitIds[0]]);

    store.getState().escape();
    expect(store.getState().meta.inspectorUnitId).toBeNull();
    expect(store.getState().selection.ids).toEqual([unitIds[0]]);
  });

  it('escape cascade: inspector → targeting → selection (SPEC §5)', () => {
    store.getState().select([unitIds[0]!]);
    store.getState().openInspector(unitIds[0]!);
    store.getState().setTargeting('dispatch');

    store.getState().escape();
    expect(store.getState().meta.inspectorUnitId).toBeNull();
    expect(store.getState().meta.targeting).toBe('dispatch'); // untouched this pass
    expect(store.getState().selection.ids).toEqual([unitIds[0]]);

    store.getState().escape();
    expect(store.getState().meta.targeting).toBeNull();
    expect(store.getState().selection.ids).toEqual([unitIds[0]]);

    store.getState().escape();
    expect(store.getState().selection.ids).toEqual([]);
  });

  // RETIRED by V3: cycleIdle (F idle-cycle) — no idle agents exist anymore.
});
