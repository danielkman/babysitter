"use client";

import type { KanbanBacklogSnapshot } from "../../../agent-mux/core/src/kanban.js";

import { useSmartPolling } from "./use-smart-polling";

export interface BacklogOverviewSummary {
  projectCount: number;
  issueCount: number;
  readyCount: number;
  blockedCount: number;
  dispatchedCount: number;
  completedCount: number;
  needsDecompositionCount: number;
  inProgressCount: number;
}

export interface BacklogOverviewResponse {
  snapshot: KanbanBacklogSnapshot;
  summary: BacklogOverviewSummary;
}

export function useBacklog(interval = 15000) {
  const { data, loading, error, refresh } = useSmartPolling<BacklogOverviewResponse>(
    "/api/backlog",
    {
      interval,
      sseFilter: (event) => event.type === "update" || event.type === "new-run",
    },
  );

  return {
    snapshot: data?.snapshot,
    summary: data?.summary,
    loading,
    error,
    refresh,
  };
}
