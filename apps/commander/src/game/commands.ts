/**
 * Command execution + hotkey mode arbiter (SPEC §5/§8).
 *
 * The command card is a 3x4 grid; hotkeys Q/W/E/R/A/S/D/F/Z/X/C/V map
 * positionally onto its cells (row-major, SPEC §5). Several of those letters
 * collide with other keyboard duties:
 *   - W/A/S/D also pan the camera (SPEC §5),
 *   - F also cycles idle units (SPEC §5).
 *
 * `hotkeyPrecedence` is the pure arbiter: with a non-empty selection, command
 * cells win the colliding letters (camera pan remains available via arrow
 * keys always); with an empty selection the colliding letters keep their
 * camera/idle-cycle roles while the non-colliding letters still reach the
 * global command set (keyboard-only flow, SPEC §14). Esc and digits are
 * handled before any of this and never reach the arbiter.
 *
 * `executeIntent` is the single intent→effect switch shared by the command
 * card (mouse) and the hotkey path (keyboard) — every command does something
 * visible via the sim or the store (SPEC §8).
 */

import {
  buildCommandContext,
  getAlertForUnits,
  getIdleUnitIds,
  getLatestAlert,
  getSelectedEntities,
} from './selectors';
import type { CommanderState, CommanderStore, Orders } from './store';
import {
  COMMAND_HOTKEYS,
  mockMicroagent,
  type CommandHotkey,
} from '../microagent/mock/commandGen';
import type { CommandIntent, CommandSpec } from '../microagent/types';

export { COMMAND_HOTKEYS };
export type { CommandHotkey };

export const GRID_CELLS = COMMAND_HOTKEYS.length;

const HOTKEY_SET = new Set<string>(COMMAND_HOTKEYS);

/** Letters that double as camera pan keys (SPEC §5: WASD pan). */
const PAN_LETTERS = new Set<CommandHotkey>(['W', 'A', 'S', 'D']);

/** Letter that doubles as the idle-cycle key (SPEC §5: F). */
const IDLE_CYCLE_LETTER: CommandHotkey = 'F';

export type HotkeyDomain = 'command' | 'camera-pan' | 'idle-cycle';

/** `KeyQ` → `'Q'` for letters in the command hotkey set; null otherwise. */
export function hotkeyFromCode(code: string): CommandHotkey | null {
  const match = /^Key([A-Z])$/.exec(code);
  const letter = match?.[1];
  if (letter !== undefined && HOTKEY_SET.has(letter)) return letter as CommandHotkey;
  return null;
}

/**
 * Mode arbiter (pure): ordered list of domains to try for a hotkey letter.
 * Falls through to the next domain when the earlier one does not claim the
 * key (e.g. F with a selection whose card has no 8th cell still cycles idle).
 */
export function hotkeyPrecedence(
  letter: CommandHotkey,
  selectionNonEmpty: boolean,
): HotkeyDomain[] {
  const pans = PAN_LETTERS.has(letter);
  const cycles = letter === IDLE_CYCLE_LETTER;
  if (selectionNonEmpty) {
    if (pans) return ['command', 'camera-pan'];
    if (cycles) return ['command', 'idle-cycle'];
    return ['command'];
  }
  if (pans) return ['camera-pan'];
  if (cycles) return ['idle-cycle'];
  return ['command'];
}

/** Store slices the command card derivation depends on. */
export type CommandStateSlices = Pick<CommanderState, 'world' | 'selection' | 'alerts' | 'meta'>;

/** Current microagent command set for the live store state (≤12, SPEC §8). */
export function getCommandSpecs(state: CommandStateSlices): CommandSpec[] {
  return mockMicroagent.generateCommands(buildCommandContext(state)).slice(0, GRID_CELLS);
}

/** Find the command cell bound to `letter` in the current command set. */
export function findCommandByHotkey(
  state: CommandStateSlices,
  letter: CommandHotkey,
): CommandSpec | undefined {
  return getCommandSpecs(state).find((spec) => spec.hotkey === letter);
}

/**
 * Execute a command intent against the store/sim. Shared by the command card
 * buttons and the hotkey path so both behave byte-identically (SPEC §8).
 */
export function executeIntent(intent: CommandIntent, store: CommanderStore, orders: Orders): void {
  const state = store.getState();
  const { units, tasks } = getSelectedEntities(state);
  const unitIds = units.map((u) => u.id);

  switch (intent.kind) {
    case 'dispatch-mode':
      state.setTargeting('dispatch');
      return;
    case 'rally-mode':
      state.setTargeting('rally');
      return;
    case 'clone': {
      const first = units[0];
      if (first !== undefined) orders.clone(first.view.agent, first.view.workspaceId);
      return;
    }
    case 'retire':
      state.pushEvent(
        `Retire order acknowledged — ${unitIds.length} unit(s) will decommission at the next maintenance window`,
        'info',
        unitIds[0],
      );
      return;
    case 'steer':
      state.openSteer();
      return;
    case 'pause-unit':
      state.pushEvent('Pause queued — units hold after the current step (adapter lacks hard pause)', 'warn');
      return;
    case 'inspect': {
      const first = unitIds[0];
      if (first !== undefined) state.openInspector(first);
      return;
    }
    case 'abort':
      orders.abort(unitIds);
      return;
    case 'approve':
    case 'deny': {
      const alert = getAlertForUnits(state, unitIds) ?? getLatestAlert(state);
      if (alert !== undefined) orders.decide(alert.hookRequestId, intent.kind === 'approve' ? 'allow' : 'deny');
      return;
    }
    case 'assign-best-idle': {
      const task = tasks[0];
      const idle = getIdleUnitIds(state)[0];
      if (task !== undefined && idle !== undefined) orders.dispatchToTask([idle], task.id);
      return;
    }
    case 'prioritize': {
      const task = tasks[0];
      if (task !== undefined) {
        state.pushEvent(`Objective prioritized — ${task.view.title}`, 'info', task.id);
      }
      return;
    }
    case 'cancel-task': {
      const task = tasks[0];
      if (task !== undefined) {
        orders.abort(task.view.assigneeIds);
        state.pushEvent(`Objective cancelled — recalling ${task.view.title} assignees`, 'warn', task.id);
      }
      return;
    }
    case 'select-all-idle':
      state.select(getIdleUnitIds(state));
      return;
    case 'jump-to-alert':
      state.jumpToLatestAlert();
      return;
    case 'toggle-sim':
      orders.toggleSim();
      return;
  }
}

/**
 * Try to activate the command bound to `letter`.
 * Returns true when a cell claims the key (even a disabled cell — the key is
 * visibly bound, so it must not fall through to camera pan), false when the
 * current card has no such cell.
 */
export function executeCommandHotkey(
  letter: CommandHotkey,
  store: CommanderStore,
  orders: Orders,
): boolean {
  const spec = findCommandByHotkey(store.getState(), letter);
  if (spec === undefined) return false;
  if (spec.enabled) executeIntent(spec.intent, store, orders);
  return true;
}
