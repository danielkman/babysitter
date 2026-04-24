import { describe, expect, it, vi } from "vitest";

import { BacklogQueryService } from "../backlog-query-service";

describe("BacklogQueryService", () => {
  it("returns a seeded backlog summary and links matching run summaries", async () => {
    const service = new BacklogQueryService({
      listProjects: vi.fn().mockResolvedValue({
        recentCompletionWindowMs: 14400000,
        projects: [
          {
            projectName: "kanban",
            totalRuns: 4,
            activeRuns: 2,
            completedRuns: 1,
            failedRuns: 1,
            staleRuns: 0,
            totalTasks: 12,
            completedTasksAggregate: 8,
            latestUpdate: "2026-04-24T00:00:00.000Z",
            pendingBreakpoints: 0,
            breakpointRuns: [],
          },
        ],
      }),
    } as never);

    const overview = await service.getOverview();

    expect(overview.summary.projectCount).toBe(1);
    expect(overview.summary.issueCount).toBeGreaterThanOrEqual(7);
    expect(overview.summary.needsDecompositionCount).toBeGreaterThanOrEqual(1);
    expect(overview.snapshot.projects[0]?.linkedRunSummary?.activeRuns).toBe(2);
    expect(
      overview.snapshot.issues.find((issue) => issue.key === "KANBAN-GAP-001")?.childIssueIds,
    ).toHaveLength(4);
  });
});
