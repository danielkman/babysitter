/**
 * Board lens (SPEC-V3 §V3-7): the command-context builder needs board facts
 * the v1 store views do not carry (column, yolo, merged, dirty files, pending
 * inquiries, agent roles, run stage). The lens is a read-only structural
 * window onto the sim's V3 view surface; `bindBackendToStore` registers the
 * live sim, tests may register fakes. The board phase replaces this with
 * store-committed card views; the structural types are already UI-agnostic.
 */

import type { BoardAgentRole, BoardColumn } from '../microagent/types';

export interface BoardLensCard {
  taskId: string;
  taskKind: string;
  column: BoardColumn;
  yolo: boolean;
  merged: boolean;
  dirtyFileCount: number;
  hasPendingInquiry: boolean;
}

export interface BoardLensAgent {
  unitId: string;
  taskId: string;
  role: BoardAgentRole;
}

export interface BoardLensRunObservation {
  phases: Array<{ label: string; status: 'done' | 'current' | 'pending' }>;
}

/** Structurally satisfied by `Simulation` (listCardViews etc. return supersets). */
export interface BoardLens {
  listCardViews(): BoardLensCard[];
  listActiveAgentViews(): BoardLensAgent[];
  getRunObservation(taskId: string): BoardLensRunObservation | null;
}

let activeLens: BoardLens | null = null;

/** Register the live board lens (called by `bindBackendToStore`). */
export function setActiveBoardLens(lens: BoardLens | null): void {
  activeLens = lens;
}

export function getActiveBoardLens(): BoardLens | null {
  return activeLens;
}
