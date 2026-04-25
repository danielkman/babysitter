import { describe, expect, it, vi } from "vitest";

import { render, screen, setupUser } from "@/test/test-utils";

import { ReviewPanel } from "../review-panel";

const artifact = {
  id: "review-issue-kanban-gap-004",
  targetType: "issue" as const,
  targetId: "KANBAN-GAP-004",
  targetLabel: "KANBAN-GAP-004",
  title: "Review diff workflow primitives",
  summary: "Shared queue and diff surface.",
  branch: "vk/kanban-gap-004",
  decision: "pending" as const,
  queueState: "queued" as const,
  updatedAt: "2026-04-24T12:00:00.000Z",
  integration: {
    provider: "github" as const,
    status: "missing-scopes" as const,
    linkState: "partially-linked" as const,
    guidance: "Reconnect GitHub with pull request write scope before approving from review.",
    missingScopes: ["pull_requests:write"],
    prerequisites: [],
    actions: {
      canCreatePullRequest: false,
      canManagePullRequest: false,
      canApproveFromReview: false,
      reason: "GitHub scopes are incomplete for review actions.",
    },
  },
  linkedPullRequest: {
    provider: "github" as const,
    status: "in-review" as const,
    linkState: "partially-linked" as const,
    title: "Add linked PR parity indicators",
    number: 612,
    reviewStatus: "pending" as const,
    mergeStatus: "blocked" as const,
    publishStatus: "not-ready" as const,
    ciGates: [
      { id: "ci-build", name: "Build", required: true, status: "passing" as const },
      { id: "ci-tests", name: "Tests", required: true, status: "pending" as const },
    ],
    integrationStatus: "missing-scopes" as const,
    guidance: "The PR is linked but review actions are disabled until scopes are restored.",
  },
  diff: [
    {
      id: "file-1",
      path: "packages/agent-mux/core/src/kanban.ts",
      additions: 3,
      deletions: 0,
      hunks: [
        {
          id: "hunk-1",
          header: "@@ review primitives @@",
          lines: [
            { kind: "context" as const, content: " export type KanbanIssue = {" },
            {
              kind: "add" as const,
              content: "+  readonly review?: KanbanReviewSummary;",
              newLineNumber: 42,
            },
          ],
        },
      ],
    },
  ],
  comments: [
    {
      id: "comment-1",
      author: { kind: "agent" as const, name: "codex-reviewer" },
      body: "Map this back to the shared review summary.",
      createdAt: "2026-04-24T12:01:00.000Z",
      status: "open" as const,
      anchor: {
        fileId: "file-1",
        filePath: "packages/agent-mux/core/src/kanban.ts",
        hunkId: "hunk-1",
        side: "head" as const,
        line: 42,
      },
      feedbackSource: {
        kind: "agent-feedback" as const,
        label: "Mapped from codex review feedback",
      },
    },
  ],
};

describe("ReviewPanel", () => {
  it("renders linked PR state and disables review actions when integration scopes are missing", async () => {
    const onApprove = vi.fn();
    const onRequestChanges = vi.fn();
    const onAddComment = vi.fn();
    const user = setupUser();

    render(
      <ReviewPanel
        title="Issue diff and feedback loop"
        description="Shared review surface."
        empty="No reviews."
        loading={false}
        artifacts={[artifact]}
        queue={[
          {
            artifactId: artifact.id,
            targetType: artifact.targetType,
            targetId: artifact.targetId,
            targetLabel: artifact.targetLabel,
            title: artifact.title,
            decision: artifact.decision,
            queueState: artifact.queueState,
            commentCount: 1,
            openCommentCount: 1,
            updatedAt: artifact.updatedAt,
          },
        ]}
        summary={{
          total: 1,
          issueCount: 1,
          workspaceCount: 0,
          pendingCount: 1,
          changesRequestedCount: 0,
          approvedCount: 0,
          openCommentCount: 1,
        }}
        onApprove={onApprove}
        onRequestChanges={onRequestChanges}
        onAddComment={onAddComment}
      />,
    );

    expect(screen.getByText("Mapped from codex review feedback")).toBeInTheDocument();

    expect(screen.getByText(/GitHub PR #612/)).toBeInTheDocument();
    expect(screen.getByText("partially linked")).toBeInTheDocument();
    expect(screen.getByText("Review pending")).toBeInTheDocument();
    expect(screen.getByText("Merge blocked")).toBeInTheDocument();
    expect(screen.getByText("Build: passing")).toBeInTheDocument();
    expect(screen.getByText("GitHub scopes are incomplete for review actions.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request changes/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /approve/i })).toBeDisabled();

    await user.click(screen.getAllByRole("button", { name: /comment/i })[1]!);
    await user.type(screen.getByLabelText(/inline review comment/i), "Queue this follow-up for the dashboard badge.");
    await user.click(screen.getByRole("button", { name: /save comment/i }));

    expect(onAddComment).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: artifact.id,
        body: "Queue this follow-up for the dashboard badge.",
        feedbackSource: expect.objectContaining({
          kind: "agent-feedback",
        }),
      }),
    );
  });
});
