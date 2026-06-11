/**
 * Derived selectors over the game store (SPEC §6/§8).
 *
 * IMPORTANT React note: these are PLAIN derivation helpers, meant to be called
 * with already-subscribed slices (e.g. inside render after `useStore(store,
 * (s) => s.world)`). They are NOT to be passed directly to `useStore` —
 * fresh-object selectors break `getSnapshot` caching in zustand v5.
 */

import type {
  AlertEntry,
  CommanderState,
  TaskEntity,
  UnitEntity,
} from './store';
import type {
  BoardColumn,
  CardContextSummary,
  CommandContext,
  SelectionSummary,
} from '../microagent/types';
import { getActiveBoardLens, type BoardLens } from './boardLens';

export const WORKING_STATES = new Set(['dispatching', 'thinking', 'tool_running', 'blocked']);

export function getUnitList(state: Pick<CommanderState, 'world'>): UnitEntity[] {
  const out: UnitEntity[] = [];
  for (const id of state.world.unitIds) {
    const unit = state.world.units[id];
    if (unit !== undefined) out.push(unit);
  }
  return out;
}

export function getTaskList(state: Pick<CommanderState, 'world'>): TaskEntity[] {
  const out: TaskEntity[] = [];
  for (const id of state.world.taskIds) {
    const task = state.world.tasks[id];
    if (task !== undefined) out.push(task);
  }
  return out;
}

export interface SelectedEntities {
  units: UnitEntity[];
  tasks: TaskEntity[];
}

export function getSelectedEntities(
  state: Pick<CommanderState, 'world' | 'selection'>,
): SelectedEntities {
  const units: UnitEntity[] = [];
  const tasks: TaskEntity[] = [];
  for (const id of state.selection.ids) {
    const unit = state.world.units[id];
    if (unit !== undefined) {
      units.push(unit);
      continue;
    }
    const task = state.world.tasks[id];
    if (task !== undefined) tasks.push(task);
  }
  return { units, tasks };
}

export function getIdleUnitIds(state: Pick<CommanderState, 'world'>): string[] {
  return state.world.unitIds.filter((id) => state.world.units[id]?.view.state === 'idle');
}

export function getLatestAlert(state: Pick<CommanderState, 'alerts'>): AlertEntry | undefined {
  return state.alerts[state.alerts.length - 1];
}

/** Alert pending for one of the given units (first match wins). */
export function getAlertForUnits(
  state: Pick<CommanderState, 'alerts'>,
  unitIds: readonly string[],
): AlertEntry | undefined {
  return state.alerts.find((alert) => unitIds.includes(alert.unitId));
}

/** v1 task-state → board-column fallback (lens-less contexts, e.g. unit tests). */
const COLUMN_BY_TASK_STATE: Record<string, BoardColumn> = {
  queued: 'backlog',
  assigned: 'do',
  in_progress: 'do',
  review: 'ai-review',
  done: 'approved',
  failed: 'backlog',
};

/**
 * Board-context summaries for the cards in scope of the selection (§V2-2/§V3-7):
 * the selected cards plus the cards attended by selected agents. Uses the
 * registered board lens for full fidelity (column, yolo, merged, dirt,
 * inquiries, roles, run stage); falls back to a best-effort projection of the
 * v1 task views when no lens is registered.
 */
export function buildCardSummaries(
  state: Pick<CommanderState, 'world' | 'selection' | 'alerts'>,
  lens: BoardLens | null,
): CardContextSummary[] {
  const { units, tasks } = getSelectedEntities(state);
  const taskIds: string[] = [];
  for (const task of tasks) taskIds.push(task.id);
  for (const unit of units) {
    const taskId = unit.view.taskId;
    if (taskId !== null && !taskIds.includes(taskId)) taskIds.push(taskId);
  }
  if (taskIds.length === 0) return [];

  if (lens !== null) {
    const cardsById = new Map(lens.listCardViews().map((c) => [c.taskId, c]));
    const agents = lens.listActiveAgentViews();
    return taskIds.flatMap((taskId) => {
      const card = cardsById.get(taskId);
      if (card === undefined) return [];
      const observation = lens.getRunObservation(taskId);
      const summary: CardContextSummary = {
        taskId,
        taskKind: card.taskKind,
        column: card.column,
        runStage: observation?.phases.find((p) => p.status === 'current')?.label ?? null,
        inquiryPending: card.hasPendingInquiry,
        workspaceDirty: card.dirtyFileCount > 0,
        yolo: card.yolo,
        merged: card.merged,
        agentRoles: agents.filter((a) => a.taskId === taskId).map((a) => a.role),
      };
      return [summary];
    });
  }

  // Lens-less fallback: project the v1 compat views.
  return taskIds.flatMap((taskId) => {
    const task = state.world.tasks[taskId];
    if (task === undefined) return [];
    const assignees = new Set(task.view.assigneeIds);
    const summary: CardContextSummary = {
      taskId,
      taskKind: task.view.taskKind,
      column: COLUMN_BY_TASK_STATE[task.view.state] ?? 'backlog',
      runStage: null,
      inquiryPending: state.alerts.some((a) => assignees.has(a.unitId)),
      workspaceDirty: false,
      yolo: false,
      merged: false,
      agentRoles: task.view.assigneeIds.map(() => 'worker' as const),
    };
    return [summary];
  });
}

/** Build the §8 microagent CommandContext from store slices (+ board lens). */
export function buildCommandContext(
  state: Pick<CommanderState, 'world' | 'selection' | 'alerts' | 'meta'>,
  lens: BoardLens | null = getActiveBoardLens(),
): CommandContext {
  const { units, tasks } = getSelectedEntities(state);
  const kinds: Array<'unit' | 'task'> = [];
  if (units.length > 0) kinds.push('unit');
  if (tasks.length > 0) kinds.push('task');
  const selection: SelectionSummary = {
    count: units.length + tasks.length,
    kinds,
    states: [...new Set(units.map((u) => u.view.state))],
    adapters: [...new Set(units.map((u) => u.view.agent))],
    taskStates: [...new Set(tasks.map((t) => t.view.state))],
    pausedUnits: units.filter((u) => u.view.paused).length,
  };
  return {
    selection,
    alerts: state.alerts.map((a) => ({
      hookRequestId: a.hookRequestId,
      unitId: a.unitId,
      kind: a.kind,
    })),
    fleet: {
      totalUnits: state.meta.resources.unitCount,
      idleUnits: state.meta.resources.idleCount,
      busyUnits: state.meta.resources.busyCount,
      pendingAlerts: state.meta.resources.alertCount,
      simPaused: state.meta.paused,
    },
    cards: buildCardSummaries(state, lens),
  };
}

// ---------------------------------------------------------------------------
// HUD formatting (mono accent for numbers, SPEC §10)
// ---------------------------------------------------------------------------

/** Sim clock as elapsed `T+MM:SS` (or `T+H:MM:SS`). Deterministic. */
export function formatClock(simTimeMs: number, simStartMs: number): string {
  const elapsed = Math.max(0, simTimeMs - simStartMs);
  const totalSeconds = Math.floor(elapsed / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `T+${hours}:${mm}:${ss}` : `T+${mm}:${ss}`;
}

/** Plain integer rendering (no locale separators — deterministic). */
export function formatInt(value: number): string {
  return String(Math.round(value));
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
