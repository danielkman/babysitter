"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { WorkspaceRuntimeSurface } from "@a5c-ai/agent-mux-core";
import { AlertCircle, ArrowUpDown, ExternalLink, FileText, GitBranch, Loader2, Terminal, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { WorkspaceInventoryItem } from "@/lib/workspace-lifecycle";

type WorkspaceSidebarAction =
  | "rebase-start"
  | "rebase-auto-resolve"
  | "rebase-open-in-editor"
  | "rebase-mark-resolved"
  | "rebase-abort";

export interface WorkspaceSidebarFeedback {
  tone: "success" | "error";
  message: string;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "Unavailable";
  }
  return new Date(value).toLocaleString();
}

function formatRuntimeTimestamp(value: number | undefined): string {
  if (!value || !Number.isFinite(value)) {
    return "Unavailable";
  }
  return new Date(value).toLocaleString();
}

function statusTone(status: "success" | "warning" | "error" | "neutral"): string {
  if (status === "success") {
    return "border-success/20 bg-success/10 text-success";
  }
  if (status === "warning") {
    return "border-warning/20 bg-warning/10 text-warning";
  }
  if (status === "error") {
    return "border-error/20 bg-error/10 text-error";
  }
  return "border-border text-foreground-muted";
}

function latestCommand(runtime: WorkspaceRuntimeSurface | undefined) {
  if (!runtime) {
    return null;
  }
  return [...runtime.terminal.commands].sort((left, right) => right.startedAt - left.startedAt)[0] ?? null;
}

export function WorkspaceDetailsSidebar(props: {
  workspace: WorkspaceInventoryItem;
  runtime?: WorkspaceRuntimeSurface;
  sessionId?: string;
  pendingAction: string | null;
  notesSaving: boolean;
  feedback?: WorkspaceSidebarFeedback | null;
  onAction: (action: WorkspaceSidebarAction, workspace: WorkspaceInventoryItem) => void;
  onOpenInEditor: (workspace: WorkspaceInventoryItem, href: string | null) => void;
  onSaveNote: (workspace: WorkspaceInventoryItem, note: string) => void;
}) {
  const [draftNote, setDraftNote] = useState(props.workspace.notes.value);
  const lastCommand = useMemo(() => latestCommand(props.runtime), [props.runtime]);
  const previewUrl = props.runtime?.preview.primaryUrl ?? props.runtime?.devServer.primaryUrl ?? null;
  const repoName = props.workspace.git.root?.split("/").filter(Boolean).at(-1) ?? "Unavailable";
  const gitMetadataMissing = !props.workspace.git.root || !props.workspace.git.branch;
  const changeCount = props.workspace.git.uncommittedCount;
  const syncSummary =
    props.workspace.git.ahead == null || props.workspace.git.behind == null
      ? "No upstream tracking"
      : `${props.workspace.git.ahead} ahead / ${props.workspace.git.behind} behind`;

  useEffect(() => {
    setDraftNote(props.workspace.notes.value);
  }, [props.workspace.notes.value, props.workspace.path]);

  const actionKey = (action: WorkspaceSidebarAction) => `${action}:${props.workspace.path}`;
  const quickActionBusy = props.pendingAction != null;

  return (
    <aside className="rounded-[28px] border border-border bg-card p-4 shadow-lg" aria-label={`Workspace details for ${props.workspace.name}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Operational cockpit</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">Details sidebar</h2>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground-muted">
          {props.workspace.status}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        <SidebarSection title="Git summary" icon={GitBranch}>
          {gitMetadataMissing ? (
            <SectionState
              tone="error"
              title="Repository metadata unavailable"
              body="The workspace path exists, but git root or branch metadata could not be resolved."
            />
          ) : (
            <div className="grid gap-3">
              <ValueRow label="Repository" value={repoName} mono={false} />
              <ValueRow label="Branch" value={props.workspace.git.branch ?? "Unavailable"} mono />
              <ValueRow label="Tracking" value={props.workspace.git.trackingBranch ?? "Unavailable"} mono />
              <ValueRow label="Sync" value={syncSummary} />
              <ValueRow
                label="Uncommitted"
                value={
                  changeCount == null
                    ? "Unavailable"
                    : changeCount === 0
                      ? "0 changes"
                      : `${changeCount} change${changeCount === 1 ? "" : "s"}`
                }
              />
            </div>
          )}
        </SidebarSection>

        <SidebarSection title="Terminal" icon={Terminal}>
          {!props.runtime ? (
            <SectionState
              tone="error"
              title="Runtime disconnected"
              body="No active agent-mux runtime is publishing shell state for this workspace."
            />
          ) : !lastCommand ? (
            <div className="space-y-3">
              <SectionState
                tone="neutral"
                title="No terminal activity yet"
                body="Use the shell affordance below while the runtime waits for its first captured command."
              />
              <pre className="overflow-x-auto rounded-2xl border border-border bg-background/80 px-3 py-2 text-xs text-foreground-muted">
                {`cd ${props.workspace.path}\ngit status --short`}
              </pre>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] uppercase",
                    statusTone(lastCommand.status === "completed" ? "success" : lastCommand.status === "failed" ? "error" : "warning"),
                  )}
                >
                  {lastCommand.status}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-muted">
                  {lastCommand.source}
                </span>
                {lastCommand.toolName ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-muted">
                    {lastCommand.toolName}
                  </span>
                ) : null}
              </div>
              <pre className="overflow-x-auto rounded-2xl border border-border bg-slate-950 px-3 py-2 text-xs text-slate-100">
                {lastCommand.command}
              </pre>
              <p className="text-xs text-foreground-muted">
                Captured {formatRuntimeTimestamp(lastCommand.startedAt)}
                {lastCommand.exitCode != null ? ` · exit ${lastCommand.exitCode}` : ""}
              </p>
              {lastCommand.logs.length > 0 ? (
                <div className="rounded-2xl border border-border bg-background/80 px-3 py-2 text-xs text-foreground-muted">
                  {lastCommand.logs.slice(-2).map((line: { timestamp: number; stream: string; text: string }, index: number) => (
                    <p key={`${line.timestamp}:${index}`} className="break-words">
                      <span className="font-mono">{line.stream}</span>: {line.text}
                    </p>
                  ))}
                </div>
              ) : (
                <SectionState tone="neutral" title="No command output yet" body="The runtime captured the command but has not attached log lines." />
              )}
            </div>
          )}
        </SidebarSection>

        <SidebarSection title="Notes" icon={FileText}>
          <div className="space-y-3">
            {props.workspace.notes.value.trim().length === 0 ? (
              <SectionState
                tone="neutral"
                title="No workspace notes yet"
                body="Capture operator context, next steps, or handoff details for this worktree."
              />
            ) : (
              <p className="text-xs text-foreground-muted">Last updated {formatTimestamp(props.workspace.notes.updatedAt)}</p>
            )}
            <textarea
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
              className="min-h-28 w-full rounded-2xl border border-border bg-background/80 px-3 py-2 text-sm outline-none transition focus:border-primary/50"
              placeholder="Add workspace notes, follow-up context, or handoff details."
              aria-label={`Notes for ${props.workspace.name}`}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={props.notesSaving} onClick={() => props.onSaveNote(props.workspace, draftNote)}>
                {props.notesSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save note
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={props.notesSaving || draftNote.length === 0} onClick={() => props.onSaveNote(props.workspace, "")}>
                Clear
              </Button>
            </div>
          </div>
        </SidebarSection>

        <SidebarSection title="Quick actions" icon={Wrench}>
          <div className="space-y-3">
            {props.workspace.rebase ? (
              <div className="rounded-2xl border border-border bg-card/80 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-muted">Rebase workflow</p>
                <h4 className="mt-1 text-sm font-semibold">
                  {props.workspace.rebase.status === "rebase-needed"
                    ? "Rebase required before this workspace can move forward"
                    : props.workspace.rebase.status === "rebase-conflicts"
                      ? "Resolve conflicts before returning to review or merge"
                      : `Ready for ${props.workspace.rebase.readyFor}`}
                </h4>
                <p className="mt-1 text-xs text-foreground-muted">
                  Attempt {props.workspace.rebase.attemptCount} · target `{props.workspace.rebase.targetBranch ?? "main"}`
                </p>
                {props.workspace.rebase.followUpInstructions.length > 0 ? (
                  <div className="mt-3 grid gap-2 text-xs text-foreground-muted">
                    {props.workspace.rebase.followUpInstructions.map((instruction: string) => (
                      <div key={instruction} className="rounded-xl border border-border bg-background/70 px-3 py-2">
                        {instruction}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() =>
                  props.workspace.actions.canRebaseOpenInEditor
                    ? props.onAction("rebase-open-in-editor", props.workspace)
                    : props.onOpenInEditor(props.workspace, props.workspace.links.editorHref)
                }
                disabled={quickActionBusy || !props.workspace.links.editorHref}
              >
                Open in editor
              </Button>
              {props.sessionId ? (
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href={`/sessions/${props.sessionId}`}>View session</Link>
                </Button>
              ) : null}
              {previewUrl ? (
                <Button asChild type="button" size="sm" variant="outline">
                  <a href={previewUrl} target="_blank" rel="noreferrer">
                    Open preview
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" disabled>
                  Open preview
                </Button>
              )}
            </div>

            {props.workspace.rebase ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {props.workspace.actions.canRebaseStart ? (
                  <ActionButton
                    disabled={props.pendingAction === actionKey("rebase-start")}
                    onClick={() => props.onAction("rebase-start", props.workspace)}
                  >
                    Retry rebase
                  </ActionButton>
                ) : null}
                {props.workspace.actions.canRebaseAutoResolve ? (
                  <ActionButton
                    disabled={props.pendingAction === actionKey("rebase-auto-resolve")}
                    onClick={() => props.onAction("rebase-auto-resolve", props.workspace)}
                  >
                    Auto-resolve
                  </ActionButton>
                ) : null}
                {props.workspace.actions.canRebaseMarkResolved ? (
                  <ActionButton
                    disabled={props.pendingAction === actionKey("rebase-mark-resolved")}
                    onClick={() => props.onAction("rebase-mark-resolved", props.workspace)}
                  >
                    Mark resolved
                  </ActionButton>
                ) : null}
                {props.workspace.actions.canRebaseAbort ? (
                  <ActionButton
                    disabled={props.pendingAction === actionKey("rebase-abort")}
                    onClick={() => props.onAction("rebase-abort", props.workspace)}
                  >
                    Abort rebase
                  </ActionButton>
                ) : null}
              </div>
            ) : null}

            {props.feedback ? (
              <SectionState tone={props.feedback.tone} title={props.feedback.tone === "error" ? "Action failed" : "Action updated"} body={props.feedback.message} />
            ) : (
              <p className="text-xs text-foreground-muted">
                Preview, editor, and rebase helpers stay visible together so the workspace card remains the operational handoff surface.
              </p>
            )}
          </div>
        </SidebarSection>
      </div>
    </aside>
  );
}

function SidebarSection(props: { title: string; icon: typeof GitBranch; children: unknown }) {
  const Icon = props.icon;
  return (
    <section className="rounded-2xl border border-border bg-background/60 p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground-muted">
        <Icon className="h-4 w-4" />
        <h3>{props.title}</h3>
      </div>
      {props.children as any}
    </section>
  );
}

function ValueRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card/80 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-foreground-muted">{props.label}</p>
      <p className={cn("mt-1 text-sm font-medium", props.mono ? "break-all font-mono text-xs" : "")}>{props.value}</p>
    </div>
  );
}

function SectionState(props: { tone: "success" | "error" | "neutral"; title: string; body: string }) {
  return (
    <div className={cn("rounded-2xl border px-3 py-2", statusTone(props.tone === "success" ? "success" : props.tone === "error" ? "error" : "neutral"))}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {props.tone === "error" ? <AlertCircle className="h-4 w-4" /> : props.tone === "success" ? <ArrowUpDown className="h-4 w-4" /> : null}
        <span>{props.title}</span>
      </div>
      <p className="mt-1 text-xs">{props.body}</p>
    </div>
  );
}

function ActionButton(props: { disabled?: boolean; onClick: () => void; children: unknown }) {
  return (
    <Button type="button" size="sm" variant="ghost" disabled={props.disabled} onClick={props.onClick} className="justify-start">
      {props.children as any}
    </Button>
  );
}
