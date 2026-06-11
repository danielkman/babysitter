/**
 * Read-only sim view access for the panel surfaces (SPEC-V2 §V2-5/§V2-7,
 * SPEC-V3 §V3-4): the Inspector Process/Workspace tabs and the Human Review
 * panel read workspace + run-observation views straight from the sim on
 * every render; re-renders are driven by the per-tick store commit
 * (`meta.tickIndex`), so reads stay deterministic per seed + verb sequence.
 */

import type { SimRunObservationView, SimWorkspaceView } from '../backend/mock/simulation';

export interface SimViews {
  getWorkspaceView(taskId: string): SimWorkspaceView | null;
  getRunObservation(taskId: string): SimRunObservationView | null;
}
