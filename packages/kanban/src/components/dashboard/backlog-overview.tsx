"use client";

import type { KanbanIssue } from "../../../../agent-mux/core/src/kanban.js";
import {
  AlertCircle,
  CheckCircle2,
  GitBranch,
  Layers,
  ListTodo,
  Workflow,
} from "lucide-react";

import { useBacklog } from "@/hooks/use-backlog";

function issueTone(issue: KanbanIssue): string {
  switch (issue.dispatch.readiness) {
    case "blocked":
      return "border-error/25 bg-error-muted text-error";
    case "needs-decomposition":
      return "border-warning/25 bg-warning-muted text-warning";
    case "dispatched":
      return "border-primary/25 bg-primary/10 text-primary";
    case "completed":
      return "border-success/25 bg-success-muted text-success";
    default:
      return "border-border bg-background text-foreground-secondary";
  }
}

export function BacklogOverview() {
  const { snapshot, summary, loading, error } = useBacklog();

  if (loading && !snapshot) {
    return (
      <section
        className="mb-6 rounded-3xl border border-border bg-card p-6 shadow-lg"
        data-testid="backlog-overview-loading"
      >
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-36 rounded bg-background-secondary" />
          <div className="h-8 w-80 rounded bg-background-secondary" />
          <div className="grid gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 rounded-2xl bg-background-secondary" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || !snapshot || !summary) {
    return (
      <section
        className="mb-6 rounded-3xl border border-error/25 bg-error-muted p-6 text-sm text-error shadow-lg"
        data-testid="backlog-overview-error"
      >
        Failed to load issue backlog model.
      </section>
    );
  }

  const primaryProject = snapshot.projects[0];
  const headlineIssues = snapshot.issues.filter((issue) => !issue.parentIssueId).slice(0, 5);
  const primaryGap = snapshot.issues.find((issue) => issue.key === "KANBAN-GAP-001");
  const decompositionReady =
    primaryGap?.decomposition.filter((item) => item.status === "done").length ?? 0;

  return (
    <section
      className="mb-6 rounded-3xl border border-border bg-card p-6 shadow-lg"
      data-testid="backlog-overview"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
            Backlog Model
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            First-class projects and issues now sit beside the run board
          </h2>
          <p className="mt-3 text-sm leading-6 text-foreground-muted">
            The kanban surface now exposes canonical project and issue entities with metadata,
            dependencies, acceptance criteria, and decomposition readiness. This backlog layer is
            separate from live runs so planning can happen before dispatch.
          </p>
        </div>
        {primaryProject ? (
          <div className="min-w-[220px] rounded-2xl border border-border bg-background p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-foreground-muted">
              Primary Project
            </div>
            <div className="mt-2 text-lg font-semibold text-foreground">{primaryProject.name}</div>
            <div className="mt-3 text-sm text-foreground-muted">
              {primaryProject.metrics.totalIssues} issues tracked
            </div>
            {primaryProject.linkedRunSummary ? (
              <div className="mt-2 text-sm text-foreground-muted">
                {primaryProject.linkedRunSummary.activeRuns} live runs linked
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm text-foreground-muted">
            <Layers className="h-4 w-4" />
            Scope
          </div>
          <div className="mt-3 text-2xl font-semibold text-foreground">{summary.issueCount}</div>
          <div className="text-sm text-foreground-muted">{summary.projectCount} project models</div>
        </div>
        <div className="rounded-2xl border border-warning/25 bg-warning-muted p-4">
          <div className="flex items-center gap-2 text-sm text-warning">
            <Workflow className="h-4 w-4" />
            Needs Decomposition
          </div>
          <div className="mt-3 text-2xl font-semibold text-warning">
            {summary.needsDecompositionCount}
          </div>
          <div className="text-sm text-warning/80">
            dispatch gates still open
          </div>
        </div>
        <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
          <div className="flex items-center gap-2 text-sm text-primary">
            <ListTodo className="h-4 w-4" />
            Ready Work
          </div>
          <div className="mt-3 text-2xl font-semibold text-primary">{summary.readyCount}</div>
          <div className="text-sm text-primary/80">{summary.inProgressCount} active items</div>
        </div>
        <div className="rounded-2xl border border-error/25 bg-error-muted p-4">
          <div className="flex items-center gap-2 text-sm text-error">
            <AlertCircle className="h-4 w-4" />
            Blocked
          </div>
          <div className="mt-3 text-2xl font-semibold text-error">{summary.blockedCount}</div>
          <div className="text-sm text-error/80">{summary.dispatchedCount} dispatched</div>
        </div>
      </div>

      {primaryGap ? (
        <div className="mt-5 rounded-2xl border border-border bg-background p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-warning/25 bg-warning-muted px-2.5 py-1 text-xs font-semibold text-warning">
              {primaryGap.key}
            </span>
            <span className="text-sm font-semibold text-foreground">{primaryGap.title}</span>
            <span className="text-sm text-foreground-muted">
              {decompositionReady}/{primaryGap.decomposition.length} decomposition items done
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {primaryGap.acceptanceCriteria.map((criterion) => (
              <span
                key={criterion.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground-secondary"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {criterion.title}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {headlineIssues.map((issue) => (
          <article
            key={issue.id}
            className={`rounded-2xl border p-4 ${issueTone(issue)}`}
            data-testid={`backlog-issue-${issue.key}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">{issue.key}</span>
              <span className="rounded-full border border-current/20 px-2 py-0.5 text-xs">
                {issue.priority}
              </span>
              <span className="rounded-full border border-current/20 px-2 py-0.5 text-xs">
                {issue.dispatch.readiness}
              </span>
            </div>
            <div className="mt-2 text-base font-semibold">{issue.title}</div>
            {issue.summary ? (
              <p className="mt-2 text-sm leading-6 opacity-90">{issue.summary}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs opacity-80">
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3.5 w-3.5" />
                {issue.dependencies.length} dependencies
              </span>
              <span className="inline-flex items-center gap-1">
                <Workflow className="h-3.5 w-3.5" />
                {issue.decomposition.length} decomposition items
              </span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {issue.acceptanceCriteria.length} acceptance checks
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
