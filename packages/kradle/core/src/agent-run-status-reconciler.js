// AgentDispatchRun status reconciler.
//
// Nothing in the scratch/live environment populates AgentDispatchRun.status,
// so real runs collapse into the board backlog lane (unknown phase → backlog).
// This module derives a run's board-facing status from its lifecycle so the
// WarRoom board lanes reflect reality:
//
//   queued/pending        -> phase Pending,          boardColumn backlog,      progress 0
//   running               -> phase Running,          boardColumn do,           progress 0.5
//   waiting-for-approval   -> phase AwaitingApproval,  boardColumn human-review, progress 0.5
//   succeeded/completed   -> phase Completed,         boardColumn approved,     progress 1
//   failed/cancelled      -> phase Failed/Cancelled,  boardColumn backlog,      progress 0
//
// `deriveRunStatus` is a PURE function (spec, status, events) -> the derived
// triple. `reconcileRunStatus` applies it to a run resource non-destructively
// (never overwrites a phase the run already carries; only fills the derived
// board fields), so it is safe to run repeatedly and is backward-compatible
// with runs whose phase a real controller already set.

export const AGENT_RUN_STATUS_RECONCILER_BOUNDARY = {
  role: 'agent-run-status-reconciler',
  scope: 'Derive AgentDispatchRun.status.{phase,boardColumn,progress} from the run lifecycle so board lanes reflect reality',
  owns: ['run lifecycle → board column derivation', 'run progress derivation'],
  delegatesTo: [],
  mustNotOwn: ['kubectl execution', 'HTTP routes', 'UI rendering']
};

/** Board columns the controller derives (a subset of the Commander board). */
export const RUN_BOARD_COLUMNS = Object.freeze({
  BACKLOG: 'backlog',
  DO: 'do',
  HUMAN_REVIEW: 'human-review',
  APPROVED: 'approved'
});

/**
 * Canonical run phase (capitalized, the value the live BFF emits) keyed by every
 * casing/synonym the lifecycle surfaces. Forward-compatible: an unknown phase
 * passes through unchanged.
 */
const PHASE_CANONICAL = {
  pending: 'Pending',
  Pending: 'Pending',
  queued: 'Queued',
  Queued: 'Queued',
  running: 'Running',
  Running: 'Running',
  'waiting-for-approval': 'AwaitingApproval',
  AwaitingApproval: 'AwaitingApproval',
  succeeded: 'Completed',
  Succeeded: 'Completed',
  completed: 'Completed',
  Completed: 'Completed',
  failed: 'Failed',
  Failed: 'Failed',
  cancelled: 'Cancelled',
  Cancelled: 'Cancelled'
};

/** Derived board column + progress per canonical phase. */
const PHASE_BOARD = {
  Pending: { boardColumn: RUN_BOARD_COLUMNS.BACKLOG, progress: 0 },
  Queued: { boardColumn: RUN_BOARD_COLUMNS.BACKLOG, progress: 0 },
  Running: { boardColumn: RUN_BOARD_COLUMNS.DO, progress: 0.5 },
  AwaitingApproval: { boardColumn: RUN_BOARD_COLUMNS.HUMAN_REVIEW, progress: 0.5 },
  Completed: { boardColumn: RUN_BOARD_COLUMNS.APPROVED, progress: 1 },
  Failed: { boardColumn: RUN_BOARD_COLUMNS.BACKLOG, progress: 0 },
  Cancelled: { boardColumn: RUN_BOARD_COLUMNS.BACKLOG, progress: 0 }
};

/**
 * Resolve the run's lifecycle phase from (in priority order): an explicit
 * `status.phase`; a terminal event in `events`; the spec's declared lifecycle
 * intent (`spec.lifecyclePhase`); else `Pending` (created, not executing).
 *
 * @param {object} spec
 * @param {object} status
 * @param {Array<{type?: string, phase?: string}>} events
 * @returns {string} canonical run phase
 */
function resolvePhase(spec = {}, status = {}, events = []) {
  if (status.phase) return PHASE_CANONICAL[status.phase] ?? status.phase;

  // Newest terminal/lifecycle event wins.
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i] || {};
    if (event.phase) return PHASE_CANONICAL[event.phase] ?? event.phase;
    switch (event.type) {
      case 'completion':
      case 'run-complete':
        return 'Completed';
      case 'error':
      case 'failure':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      case 'approval-required':
        return 'AwaitingApproval';
      case 'started':
      case 'session-event':
        return 'Running';
      default:
        break;
    }
  }

  if (spec.lifecyclePhase) return PHASE_CANONICAL[spec.lifecyclePhase] ?? spec.lifecyclePhase;
  return 'Pending';
}

/**
 * PURE: derive a run's board-facing status from its lifecycle.
 *
 * @param {object} spec - AgentDispatchRun.spec
 * @param {object} [status] - AgentDispatchRun.status (an existing phase is authoritative)
 * @param {Array} [events] - ordered lifecycle/SSE events (oldest → newest)
 * @returns {{ phase: string, boardColumn: string, progress: number }}
 */
export function deriveRunStatus(spec = {}, status = {}, events = []) {
  const phase = resolvePhase(spec, status, events);
  const board = PHASE_BOARD[phase] ?? { boardColumn: RUN_BOARD_COLUMNS.BACKLOG, progress: 0 };
  return { phase, boardColumn: board.boardColumn, progress: board.progress };
}

/**
 * Reconcile a single AgentDispatchRun resource's status in place (and return it).
 *
 * Backward-compatible + idempotent: an existing `status.phase` is preserved
 * (only the derived board fields are filled), and `spec.boardColumn` /
 * `spec.progress` overrides (when explicitly set) win over the derivation.
 *
 * @param {object} run - AgentDispatchRun resource (mutated in place)
 * @param {{ events?: Array }} [options]
 * @returns {object} the same run resource
 */
export function reconcileRunStatus(run, options = {}) {
  if (!run || typeof run !== 'object') return run;
  const spec = run.spec || {};
  run.status = run.status || {};
  const derived = deriveRunStatus(spec, run.status, options.events || []);

  if (!run.status.phase) run.status.phase = derived.phase;
  // Honor explicit spec overrides; otherwise derive.
  run.status.boardColumn = spec.boardColumn ?? run.status.boardColumn ?? derived.boardColumn;
  run.status.progress = typeof spec.progress === 'number'
    ? spec.progress
    : (typeof run.status.progress === 'number' ? run.status.progress : derived.progress);
  return run;
}

/**
 * Controller-shaped hook so the run-status reconciler can be wired into the
 * controller set alongside the other agent controllers. `reconcile` accepts a
 * resources map (snapshot.resources) and reconciles every AgentDispatchRun's
 * board status in place, returning the reconciled runs.
 *
 * @param {object} [options]
 * @returns {{ role: string, reconcile: (resources?: object, opts?: object) => object[] }}
 */
export function createAgentRunStatusReconciler(options = {}) {
  return {
    role: 'agent-run-status-reconciler',
    boundary: AGENT_RUN_STATUS_RECONCILER_BOUNDARY,
    deriveRunStatus,
    reconcileRunStatus,
    reconcile(resources = {}, opts = {}) {
      const runs = Array.isArray(resources.AgentDispatchRun) ? resources.AgentDispatchRun : [];
      return runs.map((run) => reconcileRunStatus(run, { events: opts.eventsByRun?.[run.metadata?.name] || [] }));
    }
  };
}
