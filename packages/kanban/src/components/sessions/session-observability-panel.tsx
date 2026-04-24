"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Tabs, type TabItem } from "@a5c-ai/compendium";
import { buildSessionFlowModel } from "@a5c-ai/agent-mux-ui/session-flow";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Hand, TerminalSquare } from "lucide-react";

import { buildRunArtifactShortcuts } from "@/lib/babysitter-overlays";

interface EventBuffer {
  events: Array<Record<string, unknown>>;
}

function formatFlowTime(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return "unknown";
  }
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SessionObservabilityPanel(props: {
  sessionId: string;
  runs: Array<Record<string, unknown>>;
  eventBuffers: Record<string, EventBuffer | undefined>;
}) {
  const [viewMode, setViewMode] = useState<"flow" | "timeline" | "transcript" | "files">("flow");
  const flowModel = useMemo(
    () => buildSessionFlowModel(props.runs, props.eventBuffers),
    [props.eventBuffers, props.runs],
  );
  const shortcuts = buildRunArtifactShortcuts(props.runs);

  const tabItems: TabItem[] = [
    {
      value: "flow",
      label: "Flow",
      badge: flowModel.lanes.length,
      body: (
        <div className="grid gap-4">
          {flowModel.lanes.map((lane) => (
            <article key={lane.runId} className="rounded-2xl border border-border bg-background/65 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{lane.agent}</div>
                  <div className="text-xs text-foreground-muted">
                    {lane.startedAt > 0 ? `${formatFlowTime(lane.startedAt)} · ` : ""}
                    {lane.runId}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-foreground-muted">
                  <span className="rounded-full border border-border px-2 py-0.5">{lane.status}</span>
                  <span className="rounded-full border border-border px-2 py-0.5">{lane.segmentCount} phases</span>
                  <span className="rounded-full border border-border px-2 py-0.5">{lane.toolCount} tools</span>
                </div>
              </div>
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {lane.segments.map((segment) => (
                  <article
                    key={segment.id}
                    className="min-w-44 rounded-2xl border border-border bg-card p-4"
                    style={{ flexGrow: segment.weight }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{segment.title}</span>
                      {segment.secondaryLabel ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-muted">
                          {segment.secondaryLabel}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-foreground-secondary">{segment.detail}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-foreground-muted">
                      <span>{segment.kind}</span>
                      <span>{segment.status}</span>
                      {segment.filePaths.length > 0 ? <span>{segment.filePaths.length} files</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          ))}
          {flowModel.lanes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-foreground-muted">
              No structured execution flow is available for this session yet.
            </div>
          ) : null}
        </div>
      ),
    },
    {
      value: "timeline",
      label: "Timeline",
      badge: flowModel.timeline.length,
      body: (
        <div className="grid gap-3">
          {flowModel.timeline.map((item) => (
            <article key={item.id} className="rounded-2xl border border-border bg-background/65 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{item.title}</div>
                  <div className="text-xs text-foreground-muted">
                    {item.timestamp != null ? `${formatFlowTime(item.timestamp)} · ` : ""}
                    {item.runId}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-foreground-muted">
                  <span>{item.kind}</span>
                  <span>{item.status}</span>
                </div>
              </div>
              <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground-secondary">
                {item.detail}
              </pre>
            </article>
          ))}
          {flowModel.timeline.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-foreground-muted">
              No timeline events are available for this session yet.
            </div>
          ) : null}
        </div>
      ),
    },
    {
      value: "transcript",
      label: "Transcript",
      badge: flowModel.transcript.length,
      body: (
        <div className="grid gap-3">
          {flowModel.transcript.map((node) => (
            <article key={node.id} className="rounded-2xl border border-border bg-background/65 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-foreground-muted">
                  {node.kind}
                </span>
                <span className="text-sm font-semibold text-foreground">{node.label}</span>
                <Link href={`/runs/${node.runId}`} className="text-xs text-primary">
                  {node.runId}
                </Link>
              </div>
              <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground-secondary">
                {node.text}
              </pre>
            </article>
          ))}
          {flowModel.transcript.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-foreground-muted">
              No transcript turns are available for this session yet.
            </div>
          ) : null}
        </div>
      ),
    },
    {
      value: "files",
      label: "Files",
      badge: flowModel.files.length,
      body: (
        <div className="grid gap-3">
          {flowModel.files.map((file) => (
            <article key={file.path} className="rounded-2xl border border-border bg-background/65 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm text-foreground">{file.path}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground-muted">
                  {file.touches} touches
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-foreground-muted">
                <span>{file.reads} reads</span>
                <span>{file.writes} writes</span>
                <span>{file.runIds.length} runs</span>
                {file.tools.length > 0 ? <span>{file.tools.length} tools</span> : null}
              </div>
            </article>
          ))}
          {flowModel.files.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-foreground-muted">
              File attention will appear here once the session touches the workspace.
            </div>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Realtime execution</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Agent flow reconstructed on the gateway stack</h2>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            Flow lanes, transcript turns, tool work, and file attention are projected from the same live event buffers so session review stays aligned with kanban execution.
          </p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted">
          Session {props.sessionId}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-foreground-muted">
        <span className="rounded-full border border-border px-3 py-1">{flowModel.summary.totalRuns} runs</span>
        <span className="rounded-full border border-border px-3 py-1">{flowModel.summary.totalSegments} segments</span>
        <span className="rounded-full border border-border px-3 py-1">{flowModel.summary.totalTools} tools</span>
        <span className="rounded-full border border-border px-3 py-1">{flowModel.summary.fileCount} files</span>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <div>
          <Tabs value={viewMode} onChange={(value) => setViewMode(value as typeof viewMode)} items={tabItems} />
        </div>

        <aside className="space-y-4">
          <article className="rounded-2xl border border-border bg-background/70 p-4">
            <div className="flex items-center gap-2">
              <TerminalSquare className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Artifact shortcuts</h3>
            </div>
            <div className="mt-4 space-y-3">
              {shortcuts.map((item) => (
                <div key={item.runId} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/runs/${item.runId}`} className="font-mono text-sm text-primary">
                      {item.runId}
                    </Link>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground-muted">
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-foreground">{item.processId}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-foreground-muted">
                    <span>{item.logTaskCount} log tasks</span>
                    <span>{item.resultTaskCount} result payloads</span>
                    {item.failedTaskCount > 0 ? <span>{item.failedTaskCount} failed tasks</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {item.breakpointEffectId ? (
                      <Link
                        href={`/runs/${item.runId}?effectId=${encodeURIComponent(item.breakpointEffectId)}`}
                        className="inline-flex items-center gap-1 text-primary"
                      >
                        <Hand className="h-3 w-3" />
                        Review breakpoint
                      </Link>
                    ) : null}
                    {item.errorEffectId ? (
                      <Link
                        href={`/runs/${item.runId}?effectId=${encodeURIComponent(item.errorEffectId)}`}
                        className="inline-flex items-center gap-1 text-primary"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Open failed task
                      </Link>
                    ) : null}
                    <Link href={`/runs/${item.runId}`} className="inline-flex items-center gap-1 text-primary">
                      <ArrowUpRight className="h-3 w-3" />
                      Open run detail
                    </Link>
                  </div>
                </div>
              ))}
              {shortcuts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-foreground-muted">
                  Run artifacts will appear here once the session emits execution data.
                </div>
              ) : null}
            </div>
          </article>

          <article className="rounded-2xl border border-border bg-background/70 p-4 text-sm text-foreground-muted">
            <div className="inline-flex items-center gap-2 text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Kanban now shows the same reconstructed realtime execution story as agent-mux instead of a reduced overlay summary.
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
