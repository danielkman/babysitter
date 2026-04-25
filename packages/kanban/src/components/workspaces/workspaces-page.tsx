"use client";

import Link from "next/link";
import type { KanbanReviewArtifact, KanbanReviewComment, KanbanReviewSummary } from "@a5c-ai/agent-mux-core";
import { AlertTriangle, Archive, FolderGit2, RefreshCw, RotateCcw, Trash2, Wrench } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ReviewPanel } from "@/components/review/review-panel";
import { cn } from "@/lib/cn";
import { useReviews } from "@/hooks/use-reviews";
import type { WorkspaceInventoryItem, WorkspaceInventoryResponse, WorkspaceSessionSnapshot } from "@/lib/workspace-lifecycle";
import { WorkspaceDetailsSidebar, type WorkspaceSidebarFeedback } from "@/components/workspaces/workspace-details-sidebar";

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No recent activity";
  }
  return new Date(value).toLocaleString();
}

function truncatePath(value: string): string {
  if (value.length <= 72) {
    return value;
  }
  return `${value.slice(0, 32)}...${value.slice(-28)}`;
}

export function getWorkspaceOwnershipLabel(
  isAuthenticated: boolean,
  sessions: WorkspaceSessionSnapshot[],
): string {
  return isAuthenticated
    ? `${sessions.length} agent-mux sessions enriching workspace ownership`
    : "Gateway disconnected: inventory falls back to local git worktrees and archived workspace metadata";
}

export async function loadInventory(sessions: WorkspaceSessionSnapshot[]): Promise<WorkspaceInventoryResponse> {
  const response = await fetch("/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessions }),
  });

  if (!response.ok) {
    throw new Error(`Workspace inventory request failed: ${response.status}`);
  }

  return (await response.json()) as WorkspaceInventoryResponse;
}

export async function runWorkspaceAction(
  action:
    | "archive"
    | "cleanup"
    | "recover"
    | "notes-save"
    | "rebase-start"
    | "rebase-auto-resolve"
    | "rebase-open-in-editor"
    | "rebase-mark-resolved"
    | "rebase-abort",
  workspacePath: string,
  sessions: WorkspaceSessionSnapshot[],
  note?: string,
): Promise<WorkspaceInventoryResponse> {
  const response = await fetch("/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, workspacePath, sessions, note }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Workspace action failed: ${response.status}`);
  }

  const payload = (await response.json()) as WorkspaceInventoryResponse;
  return payload;
}

function rebaseTone(status: NonNullable<WorkspaceInventoryItem["rebase"]>["status"]): string {
  switch (status) {
    case "ready-for-review":
    case "ready-for-merge":
      return "border-success/20 bg-success/10 text-success";
    case "rebase-needed":
      return "border-warning/20 bg-warning/10 text-warning";
    case "rebase-conflicts":
      return "border-error/20 bg-error/10 text-error";
    default:
      return "border-border text-foreground-muted";
  }
}

function rebaseLabel(status: NonNullable<WorkspaceInventoryItem["rebase"]>["status"]): string {
  return status.replace(/-/g, " ");
}

function buildReviewByPath(
  artifacts: readonly KanbanReviewArtifact[],
): ReadonlyMap<string, KanbanReviewSummary> {
  return new Map<string, KanbanReviewSummary>(
    artifacts.map((artifact: KanbanReviewArtifact) => [
      artifact.targetId,
      {
        decision: artifact.decision,
        queueState: artifact.queueState,
        commentCount: artifact.comments.length,
        openCommentCount: artifact.comments.filter((comment: KanbanReviewComment) => comment.status === "open").length,
        latestActivityAt: artifact.updatedAt,
      },
    ]),
  );
}

export function WorkspacesPageContent(props: {
  isAuthenticated: boolean;
  sessions: WorkspaceSessionSnapshot[];
}) {
  const [inventory, setInventory] = useState<WorkspaceInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingNotePath, setPendingNotePath] = useState<string | null>(null);
  const [feedbackByWorkspacePath, setFeedbackByWorkspacePath] = useState<Record<string, WorkspaceSidebarFeedback | null>>({});
  const [isPending, startTransition] = useTransition();
  const workspaceReviews = useReviews({ targetType: "workspace" });

  const sessionFingerprint = useMemo(
    () =>
      JSON.stringify(
        props.sessions.map((session) => ({
          sessionId: session.sessionId,
          status: session.status,
          cwd: session.cwd ?? "",
          updatedAt: session.updatedAt ?? 0,
        })),
      ),
    [props.sessions],
  );

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    void loadInventory(props.sessions)
      .then((payload) => {
        if (!cancelled) {
          setInventory(payload);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [props.sessions, sessionFingerprint]);

  const groups = useMemo(() => {
    const workspaces = inventory?.workspaces ?? [];
    return {
      active: workspaces.filter((workspace) => workspace.status === "active"),
      idle: workspaces.filter((workspace) => workspace.status === "idle"),
      archived: workspaces.filter((workspace) => workspace.status === "archived"),
      missing: workspaces.filter((workspace) => workspace.status === "missing"),
    };
  }, [inventory]);

  const summary = inventory?.summary ?? {
    total: 0,
    active: 0,
    idle: 0,
    archived: 0,
    missing: 0,
  };
  const liveReviewByPath = useMemo(
    () => buildReviewByPath(workspaceReviews.artifacts),
    [workspaceReviews.artifacts],
  );

  function refreshInventory() {
    startTransition(() => {
      setLoading(true);
      setError(null);
      void loadInventory(props.sessions)
        .then((payload) => setInventory(payload))
        .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
        .finally(() => setLoading(false));
    });
  }

  function setWorkspaceFeedback(workspacePath: string, feedback: WorkspaceSidebarFeedback | null) {
    setFeedbackByWorkspacePath((current) => ({
      ...current,
      [workspacePath]: feedback,
    }));
  }

  function openEditorForWorkspace(
    workspace: Pick<WorkspaceInventoryItem, "path" | "links">,
    href: string | null,
    successMessage: string,
  ): boolean {
    if (typeof window === "undefined") {
      return false;
    }
    if (!href) {
      setWorkspaceFeedback(workspace.path, {
        tone: "error",
        message: `Editor action failed for ${workspace.path}: no editor link is available.`,
      });
      return false;
    }

    const opened = window.open(href, "_blank", "noopener,noreferrer");
    if (!opened) {
      setWorkspaceFeedback(workspace.path, {
        tone: "error",
        message: `Editor action failed for ${workspace.path}. The link may have been blocked by the browser or the editor handler is unavailable.`,
      });
      return false;
    }

    setWorkspaceFeedback(workspace.path, { tone: "success", message: successMessage });
    return true;
  }

  function handleAction(
    action:
      | "archive"
      | "cleanup"
      | "recover"
      | "notes-save"
      | "rebase-start"
      | "rebase-auto-resolve"
      | "rebase-open-in-editor"
      | "rebase-mark-resolved"
      | "rebase-abort",
    workspace: WorkspaceInventoryItem,
  ) {
    const confirmationMessage =
      action === "cleanup"
        ? `Remove the git worktree at ${workspace.path}? This should only be used for archived, inactive workspaces.`
        : action === "archive"
          ? `Archive ${workspace.path} in the kanban workspace inventory?`
          : action === "recover"
            ? `Recover ${workspace.path} back into the active inventory?`
            : action === "rebase-abort"
              ? `Abort the current rebase workflow for ${workspace.path}?`
              : null;

    if (confirmationMessage && typeof window !== "undefined" && !window.confirm(confirmationMessage)) {
      return;
    }

    const actionKey = `${action}:${workspace.path}`;
    setPendingAction(actionKey);
    setError(null);
    setWorkspaceFeedback(workspace.path, null);

    startTransition(() => {
      void runWorkspaceAction(action, workspace.path, props.sessions)
        .then((payload) => {
          setInventory(payload);
          const nextWorkspace = payload.workspaces.find((item) => item.path === workspace.path);
          const resultMessage = (payload as WorkspaceInventoryResponse & { result?: { message?: string } }).result?.message ?? `Updated ${workspace.path}.`;
          if (action === "rebase-open-in-editor" && typeof window !== "undefined") {
            const editorHref = nextWorkspace?.rebase?.editorHref;
            if (!openEditorForWorkspace(
              {
                path: workspace.path,
                links: { editorHref: editorHref ?? nextWorkspace?.links.editorHref ?? workspace.links.editorHref },
              },
              editorHref ?? nextWorkspace?.links.editorHref ?? workspace.links.editorHref,
              resultMessage,
            )) {
              return;
            }
          }
          setWorkspaceFeedback(workspace.path, { tone: "success", message: resultMessage });
        })
        .catch((cause) => {
          const message = cause instanceof Error ? cause.message : String(cause);
          setError(message);
          setWorkspaceFeedback(workspace.path, { tone: "error", message });
        })
        .finally(() => setPendingAction(null));
    });
  }

  function handleNoteSave(workspace: WorkspaceInventoryItem, note: string) {
    setPendingNotePath(workspace.path);
    setError(null);
    setWorkspaceFeedback(workspace.path, null);

    startTransition(() => {
      void runWorkspaceAction("notes-save", workspace.path, props.sessions, note)
        .then((payload) => {
          setInventory(payload);
          const resultMessage = (payload as WorkspaceInventoryResponse & { result?: { message?: string } }).result?.message ?? `Updated notes for ${workspace.path}.`;
          setWorkspaceFeedback(workspace.path, { tone: "success", message: resultMessage });
        })
        .catch((cause) => {
          const message = cause instanceof Error ? cause.message : String(cause);
          setError(message);
          setWorkspaceFeedback(workspace.path, { tone: "error", message });
        })
        .finally(() => setPendingNotePath(null));
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-6 py-6">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-lg">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Workspace lifecycle</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Provisioning and worktree control</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground-muted">
              This surface keeps `packages/kanban` as the shell while inventory and lifecycle actions are derived from
              agent-mux session `cwd` values, Babysitter run discovery, and git worktree state.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="primary">
              <Link href="/sessions/new">Provision workspace</Link>
            </Button>
            <Button variant="outline" onClick={refreshInventory} disabled={loading || isPending}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh inventory
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <SummaryCard label="Known workspaces" value={String(summary.total)} />
          <SummaryCard label="Active" value={String(summary.active)} />
          <SummaryCard label="Idle" value={String(summary.idle)} />
          <SummaryCard label="Archived" value={String(summary.archived)} />
          <SummaryCard label="Missing" value={String(summary.missing)} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-sm text-foreground-muted">
          <span className="rounded-full border border-border px-3 py-1.5">
            {getWorkspaceOwnershipLabel(props.isAuthenticated, props.sessions)}
          </span>
          <span className="rounded-full border border-border px-3 py-1.5">
            Cleanup only unlocks for archived worktrees with no active sessions or pending runs.
          </span>
        </div>
      </section>

      {error ? (
        <section className="rounded-3xl border border-error/30 bg-error/10 p-4 text-sm text-error">
          {error}
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <WorkspaceColumn
          title="Active workspaces"
          icon={FolderGit2}
          empty="No active workspaces are currently attached to sessions or waiting runs."
          workspaces={groups.active}
          reviewByPath={liveReviewByPath}
          pendingAction={pendingAction}
          onAction={handleAction}
          onOpenInEditor={(workspace, href) =>
            openEditorForWorkspace(workspace, href, `Opened ${workspace.path} in the configured editor.`)
          }
          onSaveNote={handleNoteSave}
          pendingNotePath={pendingNotePath}
          feedbackByWorkspacePath={feedbackByWorkspacePath}
        />
        <WorkspaceColumn
          title="Idle workspaces"
          icon={Wrench}
          empty="No idle workspaces are currently tracked."
          workspaces={groups.idle}
          reviewByPath={liveReviewByPath}
          pendingAction={pendingAction}
          onAction={handleAction}
          onOpenInEditor={(workspace, href) =>
            openEditorForWorkspace(workspace, href, `Opened ${workspace.path} in the configured editor.`)
          }
          onSaveNote={handleNoteSave}
          pendingNotePath={pendingNotePath}
          feedbackByWorkspacePath={feedbackByWorkspacePath}
        />
        <WorkspaceColumn
          title="Archived workspaces"
          icon={Archive}
          empty="No archived workspaces yet."
          workspaces={groups.archived}
          reviewByPath={liveReviewByPath}
          pendingAction={pendingAction}
          onAction={handleAction}
          onOpenInEditor={(workspace, href) =>
            openEditorForWorkspace(workspace, href, `Opened ${workspace.path} in the configured editor.`)
          }
          onSaveNote={handleNoteSave}
          pendingNotePath={pendingNotePath}
          feedbackByWorkspacePath={feedbackByWorkspacePath}
        />
        <WorkspaceColumn
          title="Recovery queue"
          icon={AlertTriangle}
          empty="No cleaned or missing workspaces need recovery."
          workspaces={groups.missing}
          reviewByPath={liveReviewByPath}
          pendingAction={pendingAction}
          onAction={handleAction}
          onOpenInEditor={(workspace, href) =>
            openEditorForWorkspace(workspace, href, `Opened ${workspace.path} in the configured editor.`)
          }
          onSaveNote={handleNoteSave}
          pendingNotePath={pendingNotePath}
          feedbackByWorkspacePath={feedbackByWorkspacePath}
        />
      </div>

      <ReviewPanel
        title="Workspace diff and approval handoff"
        description="Workspace review is fed by the same shared artifact model as issue review, so lifecycle cards and diff actions stay in sync."
        empty="No workspace reviews are queued yet."
        loading={workspaceReviews.loading}
        error={workspaceReviews.error}
        artifacts={workspaceReviews.artifacts}
        queue={workspaceReviews.queue}
        summary={workspaceReviews.summary}
        pendingArtifactId={workspaceReviews.pendingArtifactId}
        onApprove={(artifactId) =>
          workspaceReviews.actOnReview({ action: "approve", artifactId }).then(() => refreshInventory())
        }
        onRequestChanges={(artifactId) =>
          workspaceReviews.actOnReview({ action: "request-changes", artifactId }).then(() => refreshInventory())
        }
        onAddComment={(input) =>
          workspaceReviews.actOnReview({ action: "add-comment", ...input }).then(() => refreshInventory())
        }
      />
    </div>
  );
}

function SummaryCard(props: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-border bg-background/70 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-foreground-muted">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{props.value}</p>
    </article>
  );
}

function WorkspaceColumn(props: {
  title: string;
  icon: typeof FolderGit2;
  empty: string;
  workspaces: WorkspaceInventoryItem[];
  reviewByPath: ReadonlyMap<
    string,
    NonNullable<WorkspaceInventoryItem["review"]>
  >;
  pendingAction: string | null;
  onAction: (
    action:
      | "archive"
      | "cleanup"
      | "recover"
      | "notes-save"
      | "rebase-start"
      | "rebase-auto-resolve"
      | "rebase-open-in-editor"
      | "rebase-mark-resolved"
      | "rebase-abort",
    workspace: WorkspaceInventoryItem,
  ) => void;
  onOpenInEditor: (workspace: WorkspaceInventoryItem, href: string | null) => void;
  onSaveNote: (workspace: WorkspaceInventoryItem, note: string) => void;
  pendingNotePath: string | null;
  feedbackByWorkspacePath: Record<string, WorkspaceSidebarFeedback | null>;
}) {
  const Icon = props.icon;

  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{props.title}</h2>
          <p className="text-sm text-foreground-muted">{props.workspaces.length} tracked</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {props.workspaces.map((workspace) => {
          const archiveKey = `archive:${workspace.path}`;
          const cleanupKey = `cleanup:${workspace.path}`;
          const recoverKey = `recover:${workspace.path}`;
          const runtimeSession =
            workspace.sessions.items.find((session) => session.status === "active" && session.runtime) ??
            workspace.sessions.items.find((session) => session.runtime);
          const review = props.reviewByPath.get(workspace.path) ?? workspace.review;

          return (
            <article key={workspace.path} className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-base">{workspace.name}</strong>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs",
                        workspace.status === "active"
                          ? "border-success/20 bg-success/10 text-success"
                          : workspace.status === "archived"
                            ? "border-warning/20 bg-warning/10 text-warning"
                            : workspace.status === "missing"
                              ? "border-error/20 bg-error/10 text-error"
                              : "border-border text-foreground-muted",
                      )}
                    >
                      {workspace.status}
                    </span>
                    {workspace.git.branch ? (
                      <span className="rounded-full border border-info/20 bg-info/10 px-2 py-0.5 text-xs text-info">
                        {workspace.git.branch}
                      </span>
                    ) : null}
                    {workspace.rebase ? (
                      <span className={cn("rounded-full border px-2 py-0.5 text-xs", rebaseTone(workspace.rebase.status))}>
                        {rebaseLabel(workspace.rebase.status)}
                      </span>
                    ) : null}
                    {review ? (
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {review.decision} · {review.openCommentCount} open
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 font-mono text-xs text-foreground-muted" title={workspace.path}>
                    {truncatePath(workspace.path)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => props.onAction("archive", workspace)}
                    disabled={!workspace.actions.canArchive || props.pendingAction === archiveKey}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => props.onAction("recover", workspace)}
                    disabled={!workspace.actions.canRecover || props.pendingAction === recoverKey}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Recover
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => props.onAction("cleanup", workspace)}
                    disabled={!workspace.actions.canCleanup || props.pendingAction === cleanupKey}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Cleanup
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MiniStat label="Sessions" value={`${workspace.sessions.active}/${workspace.sessions.total}`} />
                <MiniStat label="Runs" value={`${workspace.runs.active}/${workspace.runs.total}`} />
                <MiniStat label="Git" value={workspace.git.isPrimary ? "primary" : workspace.git.isWorktree ? "worktree" : "repo"} />
                <MiniStat label="Changes" value={workspace.git.dirty == null ? "unknown" : workspace.git.dirty ? "dirty" : "clean"} />
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-sm text-foreground-muted">
                {workspace.sessions.items.slice(0, 2).map((session) => (
                  <Link key={session.sessionId} href={`/sessions/${session.sessionId}`} className="text-primary">
                    Session {session.sessionId}
                  </Link>
                ))}
                {workspace.sessions.items.length > 2 ? <span>+{workspace.sessions.items.length - 2} more sessions</span> : null}
                {workspace.git.root ? <span>Root: {truncatePath(workspace.git.root)}</span> : null}
              </div>

              <p className="mt-3 text-xs text-foreground-muted">
                Last activity: {formatTimestamp(workspace.lastActivityAt)}
                {workspace.archivedAt ? ` · archived ${formatTimestamp(workspace.archivedAt)}` : ""}
                {workspace.cleanedAt ? ` · cleaned ${formatTimestamp(workspace.cleanedAt)}` : ""}
              </p>

              <div className="mt-5">
                <WorkspaceDetailsSidebar
                  workspace={workspace}
                  runtime={runtimeSession?.runtime}
                  sessionId={runtimeSession?.sessionId}
                  pendingAction={props.pendingAction}
                  notesSaving={props.pendingNotePath === workspace.path}
                  feedback={props.feedbackByWorkspacePath[workspace.path] ?? null}
                  onAction={props.onAction}
                  onOpenInEditor={props.onOpenInEditor}
                  onSaveNote={props.onSaveNote}
                />
              </div>
            </article>
          );
        })}

        {props.workspaces.length === 0 ? <p className="text-sm text-foreground-muted">{props.empty}</p> : null}
      </div>
    </section>
  );
}

function MiniStat(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-foreground-muted">{props.label}</p>
      <p className="mt-1 text-sm font-medium">{props.value}</p>
    </div>
  );
}
