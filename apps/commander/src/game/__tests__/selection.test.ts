/**
 * Selection reducer tests (SPEC §5/§6, AC2/AC3/AC8): click select / shift
 * toggle, marquee merge, control group assign/recall, recall-again camera
 * centering, Esc cascade. Uses the real seeded sim world (autoStart: false).
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
    unitIds = store.getState().world.unitIds;
    expect(unitIds.length).toBeGreaterThanOrEqual(10);
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

  it('cycleIdle walks idle units and centers the camera (SPEC §5 F key)', () => {
    store.getState().cycleIdle();
    const first = store.getState().selection.ids;
    expect(first).toHaveLength(1);
    store.getState().cycleIdle();
    const second = store.getState().selection.ids;
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first[0]);
    const pos = store.getState().world.positions[second[0]!]!;
    expect(store.getState().camera.x).toBeCloseTo(pos.x, 6);
    expect(store.getState().camera.y).toBeCloseTo(pos.y, 6);
  });
});
