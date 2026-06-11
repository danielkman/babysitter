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
 * Agents the current selection acts on: the selected units plus every agent
 * attending a selected card (SPEC-V3: cards are the primary selection).
 */
function actingAgentIds(state: CommandStateSlices): string[] {
  const { units, tasks } = getSelectedEntities(state);
  const ids = units.map((u) => u.id);
  for (const task of tasks) {
    for (const unitId of task.view.assigneeIds) {
      if (!ids.includes(unitId)) ids.push(unitId);
    }
  }
  return ids;
}

/** Hold/release toggle over a set of active agents (Pause / Hold Merge). */
function toggleHolds(state: CommandStateSlices, orders: Orders, agentIds: readonly string[]): void {
  const active = agentIds
    .map((id) => state.world.units[id])
    .filter((u): u is NonNullable<typeof u> => u !== undefined && u.view.runId !== null);
  if (active.length === 0) return;
  if (active.every((u) => u.view.paused)) {
    orders.resumeUnits(active.map((u) => u.id));
  } else {
    orders.pauseUnits(active.filter((u) => !u.view.paused).map((u) => u.id));
  }
}

/**
 * Execute a command intent against the store/sim. Shared by the command card
 * buttons and the hotkey path so both behave byte-identically (SPEC §8).
 * Every intent routes to a REAL sim verb (`moveCard`/`setYolo`/`createTask`/
 * steer via `session.message`/`hook.decision`) or a visible store mutation —
 * never a UI-only success (SPEC-V2 §V2-2).
 */
export function executeIntent(intent: CommandIntent, store: CommanderStore, orders: Orders): void {
  const state = store.getState();
  const { tasks } = getSelectedEntities(state);
  const agentIds = actingAgentIds(state);

  switch (intent.kind) {
    case 'steer':
      state.openSteer();
      return;
    case 'pause-unit':
      // Toggle semantics: if every acting agent is already held, release the
      // holds; otherwise hold the ones still running.
      toggleHolds(state, orders, agentIds);
      return;
    case 'inspect':
    case 'open-diff': {
      // Inspector for the first acting agent (open-diff lands on its
      // Workspace tab once the board phase deep-links tabs); agent-less
      // cards (human-review/merged) center + ping so the click is visible.
      const first = agentIds[0];
      if (first !== undefined) {
        state.openInspector(first);
        return;
      }
      const task = tasks[0];
      if (task !== undefined) {
        state.centerOnEntity(task.id);
        state.addPing(task.id, 'info');
      }
      return;
    }
    case 'abort':
      // `/abort` via session.message: the sim bounces the card to backlog
      // and despawns its agents (SPEC-V3 §V3-2).
      orders.abort(agentIds);
      return;
    case 'approve':
    case 'deny': {
      const alert = getAlertForUnits(state, agentIds) ?? getLatestAlert(state);
      if (alert !== undefined) orders.decide(alert.hookRequestId, intent.kind === 'approve' ? 'allow' : 'deny');
      return;
    }
    case 'task-action': {
      // Kind-specific verb (§V2-2): relay the prompt to the attending agents
      // as a REAL steer (session.message → the agent replans, transcript +
      // turn events stream) and log the order on the ticker.
      if (agentIds.length === 0) return;
      orders.steer(agentIds, intent.prompt);
      const target = tasks[0]?.view.title ?? `${agentIds.length} agent(s)`;
      state.pushEvent(`Order relayed — ${intent.prompt} (${target})`, 'info', tasks[0]?.id);
      return;
    }
    case 'move-card': {
      // User board move via the sim verb (§V3-1) — same path as drag & drop.
      for (const task of tasks) {
        orders.moveCard(task.id, intent.column);
      }
      return;
    }
    case 'set-yolo': {
      for (const task of tasks) {
        orders.setYolo(task.id, intent.on);
      }
      return;
    }
    case 'prioritize': {
      const task = tasks[0];
      if (task !== undefined) orders.prioritize(task.id);
      return;
    }
    case 'commission-task':
      // Sim verb `createTask` (§V2-6): a new card lands in the backlog.
      // The board phase routes this through the Foundry dialog for kind/title
      // input; the command card commissions the default kind directly.
      orders.createTask({ taskKind: 'implement' });
      return;
    case 'open-review': {
      const task = tasks[0];
      if (task !== undefined) {
        state.openReview(task.id);
        state.centerOnEntity(task.id);
      }
      return;
    }
    case 'hold-merge':
      toggleHolds(state, orders, agentIds);
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
