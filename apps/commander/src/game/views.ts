/**
 * Read-only sim view access for the panel surfaces (SPEC-V2 §V2-5/§V2-7,
 * SPEC-V3 §V3-4, SPEC-V4 §V4-6/§V4-9): the Inspector Process/Workspace/
 * Memory tabs, the Human Review panel and the Runs overlay read workspace +
 * run-observation + runs-registry + memory-I/O views straight from the sim
 * on every render; re-renders are driven by the per-tick store commit
 * (`meta.tickIndex`), so reads stay deterministic per seed + verb sequence.
 */

import type {
  SimMemoryIOView,
  SimProcessTemplateView,
  SimRunObservationView,
  SimRunView,
  SimStackView,
  SimWorkspaceView,
} from '../backend/mock/simulation';

export interface SimViews {
  getWorkspaceView(taskId: string): SimWorkspaceView | null;
  getRunObservation(taskId: string): SimRunObservationView | null;
  /** §V4-5 agent-stack roster (4 seeded + custom foundry-forged stacks). */
  listStacks(): SimStackView[];
  /** §V4-6 runs registry: every card attempt, newest first. */
  listRuns(): SimRunView[];
  /** §V4-6 per-taskKind phase pipeline templates (`commander/<kind>@vN`). */
  listProcessTemplates(): SimProcessTemplateView[];
  /** §V4-9 read/written memory ledgers for an agent unitId OR card taskId. */
  getMemoryIO(ref: string): SimMemoryIOView;
}
