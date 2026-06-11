/**
 * Command hotkey tests (SPEC §5/§8, HUD phase): the mode arbiter precedence
 * (command vs camera-pan vs idle-cycle), positional hotkey assignment on the
 * 3x4 grid, hotkey→command lookup over the live store, and execution wiring
 * (Q primes dispatch targeting for an idle selection; the global Q selects
 * all idle units; disabled cells swallow their key without side effects).
 */
import { describe, expect, it } from 'vitest';

import { MockBackend } from '../../backend/mock/mockBackend';
import {
  executeCommandHotkey,
  executeIntent,
  findCommandByHotkey,
  hotkeyFromCode,
  hotkeyPrecedence,
} from '../commands';
import { generateCommands } from '../../microagent/mock/commandGen';
import {
  bindBackendToStore,
  createCommanderStore,
  type BackendBinding,
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

describe('hotkeyFromCode', () => {
  it('maps KeyX codes inside the grid and rejects everything else', () => {
    expect(hotkeyFromCode('KeyQ')).toBe('Q');
    expect(hotkeyFromCode('KeyV')).toBe('V');
    expect(hotkeyFromCode('KeyG')).toBeNull(); // not a grid letter
    expect(hotkeyFromCode('Digit1')).toBeNull();
    expect(hotkeyFromCode('Escape')).toBeNull();
  });
});

describe('mode arbiter precedence (SPEC §5 collisions)', () => {
  it('W/A/S/D: command wins with a selection; camera pan otherwise', () => {
    for (const letter of ['W', 'A', 'S', 'D'] as const) {
      expect(hotkeyPrecedence(letter, true)).toEqual(['command', 'camera-pan']);
      expect(hotkeyPrecedence(letter, false)).toEqual(['camera-pan']);
    }
  });

  it('F: command wins with a selection; idle-cycle otherwise', () => {
    expect(hotkeyPrecedence('F', true)).toEqual(['command', 'idle-cycle']);
    expect(hotkeyPrecedence('F', false)).toEqual(['idle-cycle']);
  });

  it('non-colliding letters always reach the command card', () => {
    for (const letter of ['Q', 'E', 'R', 'Z', 'X', 'C', 'V'] as const) {
      expect(hotkeyPrecedence(letter, true)).toEqual(['command']);
      expect(hotkeyPrecedence(letter, false)).toEqual(['command']);
    }
  });
});

describe('positional hotkeys on the 3x4 grid', () => {
  it('cell i answers to COMMAND_HOTKEYS[i] (idle set → Q/W/E/R)', () => {
    const specs = generateCommands({
      selection: {
        count: 1,
        kinds: ['unit'],
        states: ['idle'],
        adapters: ['pi'],
        taskStates: [],
        pausedUnits: 0,
      },
      alerts: [],
      fleet: { totalUnits: 10, idleUnits: 4, busyUnits: 6, pendingAlerts: 0, simPaused: false },
    });
    expect(specs.map((s) => s.hotkey)).toEqual(['Q', 'W', 'E', 'R']);
  });
});

describe('hotkey execution over the live store', () => {
  it('empty selection: Q activates Select All Idle', () => {
    const rig = makeRig(42);
    const state = rig.store.getState();
    expect(state.selection.ids).toEqual([]);
    expect(findCommandByHotkey(state, 'Q')?.id).toBe('select-all-idle');

    const claimed = executeCommandHotkey('Q', rig.store, rig.binding.orders);
    expect(claimed).toBe(true);
    const after = rig.store.getState();
    const idleIds = after.world.unitIds.filter((id) => after.world.units[id]?.view.state === 'idle');
    expect(after.selection.ids.slice().sort()).toEqual(idleIds.slice().sort());
  });

  it('idle unit selected: Q primes dispatch targeting; W claims rally over camera pan', () => {
    const rig = makeRig(42);
    const unitId = rig.store.getState().world.unitIds[0]!;
    rig.store.getState().clickSelect(unitId, false);

    const state = rig.store.getState();
    expect(findCommandByHotkey(state, 'Q')?.id).toBe('dispatch');
    expect(findCommandByHotkey(state, 'W')?.id).toBe('rally');

    expect(executeCommandHotkey('Q', rig.store, rig.binding.orders)).toBe(true);
    expect(rig.store.getState().meta.targeting).toBe('dispatch');

    expect(executeCommandHotkey('W', rig.store, rig.binding.orders)).toBe(true);
    expect(rig.store.getState().meta.targeting).toBe('rally');
  });

  it('unbound letters fall through (F with a 4-command card)', () => {
    const rig = makeRig(42);
    rig.store.getState().clickSelect(rig.store.getState().world.unitIds[0]!, false);
    expect(findCommandByHotkey(rig.store.getState(), 'F')).toBeUndefined();
    expect(executeCommandHotkey('F', rig.store, rig.binding.orders)).toBe(false);
  });

  it('disabled cells swallow the key without side effects', () => {
    const rig = makeRig(42);
    const state = rig.store.getState();
    // Empty selection, no pending alerts at boot → Jump to Alert is disabled.
    const spec = findCommandByHotkey(state, 'W');
    expect(spec?.id).toBe('jump-to-alert');
    expect(spec?.enabled).toBe(false);

    const cameraBefore = rig.store.getState().camera;
    expect(executeCommandHotkey('W', rig.store, rig.binding.orders)).toBe(true);
    expect(rig.store.getState().camera).toEqual(cameraBefore);
    expect(rig.store.getState().selection.ids).toEqual([]);
  });

  it('executeIntent toggle-sim pauses and resumes the simulation', () => {
    const rig = makeRig(42);
    expect(rig.backend.sim.paused).toBe(false);
    executeIntent({ kind: 'toggle-sim' }, rig.store, rig.binding.orders);
    expect(rig.backend.sim.paused).toBe(true);
    expect(rig.store.getState().meta.paused).toBe(true);
    executeIntent({ kind: 'toggle-sim' }, rig.store, rig.binding.orders);
    expect(rig.backend.sim.paused).toBe(false);
  });
});
