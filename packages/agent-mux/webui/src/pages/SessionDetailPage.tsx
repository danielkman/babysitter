import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom-v6';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useGateway } from '@a5c-ai/agent-mux-ui';
import {
  accumulateEventCost,
  buildNativeAgentFlowLane,
  buildNativeTranscript,
  buildSessionFilesFromTranscript,
  buildSessionFlowModel,
  buildSessionTimelineFromTranscript,
  type NativeSessionMessage,
  type SessionCost,
  type SessionFlowModel,
} from '@a5c-ai/agent-mux-ui/session-flow';
import type { Attachment, WorkspaceRuntimeSurface } from '@a5c-ai/agent-mux-core';

import { SessionWorkspaceShell } from '../components/sessions/session-workspace-shell.js';
import { useGatewayFetch } from '../providers/GatewayProvider.js';

function formatUsd(totalUsd: number | null): string {
  if (totalUsd == null || !Number.isFinite(totalUsd)) {
    return 'unavailable';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: totalUsd >= 1 ? 2 : 4,
    maximumFractionDigits: 4,
  }).format(totalUsd);
}

function resolveTransport(
  agent: string,
  agentRecords: Record<string, Record<string, unknown>>,
): 'persistent' | 'restart-per-turn' | 'none' {
  const advertised = agentRecords[agent]?.structuredSessionTransport;
  if (advertised === 'persistent' || advertised === 'restart-per-turn') {
    return advertised;
  }
  return 'none';
}

function readRuntime(value: unknown): WorkspaceRuntimeSurface | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as WorkspaceRuntimeSurface;
}

function readWorkspacePath(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.currentPath === 'string' && record.currentPath.length > 0) {
    return record.currentPath;
  }
  if (typeof record.workspaceDefaultCwd === 'string' && record.workspaceDefaultCwd.length > 0) {
    return record.workspaceDefaultCwd;
  }
  if (typeof record.workspaceRootPath === 'string' && record.workspaceRootPath.length > 0) {
    return record.workspaceRootPath;
  }
  return null;
}

function resolveFlowModel(args: {
  eventFlowModel: SessionFlowModel;
  nativeMessages: NativeSessionMessage[];
  sessionId: string;
  resolvedAgent: string;
  status: string;
  runCount: number;
}): SessionFlowModel {
  const nativeTranscript = buildNativeTranscript(args.sessionId, args.nativeMessages);
  const nativeFlowLane = buildNativeAgentFlowLane(
    args.sessionId,
    args.nativeMessages,
    args.resolvedAgent,
    args.status,
  );
  const transcript =
    args.status === 'active'
      ? (args.eventFlowModel.transcript.length > 0 ? args.eventFlowModel.transcript : nativeTranscript)
      : (nativeTranscript.length > 0 ? nativeTranscript : args.eventFlowModel.transcript);
  const lanes =
    args.eventFlowModel.lanes.length > 0
      ? args.eventFlowModel.lanes
      : nativeFlowLane
        ? [nativeFlowLane]
        : [];
  const timeline =
    args.eventFlowModel.timeline.length > 0
      ? args.eventFlowModel.timeline
      : buildSessionTimelineFromTranscript(transcript);
  const files =
    args.eventFlowModel.files.length > 0
      ? args.eventFlowModel.files
      : buildSessionFilesFromTranscript(transcript);
  const totalUsdCandidates = lanes
    .map((lane) => lane.totalUsd)
    .filter((value): value is number => value != null && Number.isFinite(value));

  return {
    lanes,
    transcript,
    timeline,
    files,
    summary: {
      totalRuns: Math.max(args.eventFlowModel.summary.totalRuns, args.runCount, lanes.length),
      totalSegments:
        lanes.length > 0
          ? lanes.reduce((sum, lane) => sum + lane.segmentCount, 0)
          : args.eventFlowModel.summary.totalSegments,
      totalTools:
        lanes.length > 0
          ? lanes.reduce((sum, lane) => sum + lane.toolCount, 0)
          : args.eventFlowModel.summary.totalTools,
      pendingTools:
        lanes.length > 0
          ? lanes.reduce(
              (sum, lane) =>
                sum + lane.segments.filter((segment) => segment.kind === 'tool' && segment.status === 'running').length,
              0,
            )
          : args.eventFlowModel.summary.pendingTools,
      fileCount: files.length,
      totalUsd:
        args.eventFlowModel.summary.totalUsd ??
        (totalUsdCandidates.length > 0
          ? totalUsdCandidates.reduce((sum, value) => sum + value, 0)
          : null),
    },
  };
}

export function SessionDetailPage(): JSX.Element {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId ?? '';
  const fetchGateway = useGatewayFetch();
  const { client, store } = useGateway();
  const agentRecords = useStore(store, (state) => state.agents.byId);
  const session = useStore(store, (state) => state.sessions.byId[sessionId] ?? null);
  const runs = useStore(
    store,
    useShallow((state) =>
      Object.values(state.runs.byId)
        .filter((run) => run.sessionId === sessionId)
        .sort((left, right) => Number(right.startedAt ?? 0) - Number(left.startedAt ?? 0)),
    ),
  );
  const eventBuffers = useStore(store, (state) => state.events.byRunId);

  const [error, setError] = useState<string | null>(null);
  const [nativeMessages, setNativeMessages] = useState<NativeSessionMessage[]>([]);

  const transportCandidates = useMemo(
    () => [
      ...(typeof session?.agent === 'string' ? [session.agent] : []),
      ...runs
        .map((run) => (typeof run.agent === 'string' ? run.agent : null))
        .filter((value): value is string => value != null),
    ],
    [runs, session?.agent],
  );
  const resolvedAgent = transportCandidates[0] ?? 'unknown';
  const status = String(session?.status ?? 'inactive');
  const transport = transportCandidates.reduce<'persistent' | 'restart-per-turn' | 'none'>(
    (current, candidate) => {
      const next = resolveTransport(candidate, agentRecords as Record<string, Record<string, unknown>>);
      if (next === 'persistent') {
        return next;
      }
      if (current === 'none' && next === 'restart-per-turn') {
        return next;
      }
      return current;
    },
    'none',
  );
  const canCompose = status !== 'active' || transport === 'persistent';
  const workspacePath =
    typeof session?.cwd === 'string' && session.cwd.length > 0
      ? session.cwd
      : readWorkspacePath(session?.workspace);
  const runtime = readRuntime(session?.runtime);

  const eventFlowModel = useMemo(() => buildSessionFlowModel(runs, eventBuffers), [eventBuffers, runs]);
  const flowModel = useMemo(
    () =>
      resolveFlowModel({
        eventFlowModel,
        nativeMessages,
        sessionId,
        resolvedAgent,
        status,
        runCount: runs.length,
      }),
    [eventFlowModel, nativeMessages, resolvedAgent, runs.length, sessionId, status],
  );
  const eventCost = useMemo(
    () => accumulateEventCost(runs.map((run) => String(run.runId ?? '')), eventBuffers),
    [eventBuffers, runs],
  );
  const sessionCost =
    session?.cost && typeof session.cost === 'object'
      ? session.cost as SessionCost
      : eventCost;

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    return client.subscribeSession(sessionId);
  }, [client, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setError(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchGateway(`/api/v1/sessions/${encodeURIComponent(sessionId)}`);
        if (!response.ok) {
          if (response.status === 404 || cancelled) {
            return;
          }
          throw new Error(`Gateway request failed: ${response.status}`);
        }
        const body = await response.json() as Record<string, unknown>;
        if (!cancelled) {
          store.getState().actions.mergeSession(sessionId, body);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchGateway, sessionId, store]);

  useEffect(() => {
    if (!sessionId) {
      setNativeMessages([]);
      return;
    }
    if (status === 'active' && eventFlowModel.transcript.length > 0) {
      return;
    }

    let cancelled = false;
    setError(null);
    setNativeMessages([]);
    void (async () => {
      try {
        const response = await fetchGateway(`/api/v1/sessions/${encodeURIComponent(sessionId)}/full`);
        if (!response.ok) {
          if (response.status === 404) {
            if (!cancelled) {
              setNativeMessages([]);
            }
            return;
          }
          throw new Error(`Gateway request failed: ${response.status}`);
        }
        const body = await response.json() as {
          title?: string;
          turnCount?: number;
          model?: string;
          cost?: SessionCost;
          cwd?: string;
          messages?: NativeSessionMessage[];
        };
        if (cancelled) {
          return;
        }
        if (Array.isArray(body.messages)) {
          setNativeMessages(body.messages);
        }
        store.getState().actions.mergeSession(sessionId, {
          title: body.title,
          turnCount: body.turnCount,
          model: body.model,
          cost: body.cost,
          cwd: body.cwd,
        });
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventFlowModel.transcript.length, fetchGateway, sessionId, status, store]);

  async function handleSubmit(input: {
    sessionId: string;
    prompt: string;
    agent?: string;
    model?: string;
    attachments?: Attachment[];
    approvalMode?: 'yolo' | 'prompt' | 'deny';
  }): Promise<void> {
    const response = await fetchGateway(`/api/v1/sessions/${encodeURIComponent(input.sessionId)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: input.prompt,
        agent: input.agent ?? resolvedAgent,
        model: input.model,
        attachments: input.attachments,
        approvalMode: input.approvalMode,
      }),
    });
    if (!response.ok) {
      throw new Error(`Gateway request failed: ${response.status}`);
    }

    const body = (await response.json()) as {
      run?: Record<string, unknown>;
      session?: Record<string, unknown>;
    };
    if (body.run && typeof body.run.runId === 'string') {
      store.getState().actions.mergeRun(body.run.runId, body.run);
    }
    if (body.session && typeof body.session.sessionId === 'string') {
      store.getState().actions.mergeSession(body.session.sessionId, body.session);
    }
  }

  return (
    <>
      {error ? (
        <div className="mx-auto w-full max-w-[1800px] px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="rounded-2xl border border-error/20 bg-error-muted px-4 py-3 text-sm text-error">
            {error}
          </div>
        </div>
      ) : null}
      <SessionWorkspaceShell
        sessionId={sessionId}
        sessionTitle={String(session?.title ?? sessionId ?? 'Missing session id')}
        sessionAgent={resolvedAgent}
        sessionStatus={status}
        totalCostLabel={formatUsd(sessionCost?.totalUsd ?? null)}
        runs={runs}
        eventBuffers={eventBuffers}
        workspacePath={workspacePath}
        runtime={runtime ?? undefined}
        sessionModel={typeof session?.model === 'string' ? session.model : null}
        flowModelOverride={flowModel}
        sessionCostOverride={sessionCost}
        conversationDisabled={!canCompose}
        conversationPlaceholder={
          status === 'active' && transport !== 'persistent'
            ? 'The live session is still running…'
            : 'Continue the session...'
        }
        conversationSubmitLabel="Continue session"
        conversationEmptyStateTitle="No transcript yet"
        conversationEmptyStateBody="The session chat stays primary here. Transcript, flow, timeline, and file attention will appear as soon as gateway activity or native session history is available."
        heroEyebrow="Realtime session"
        heroBody="This route is now chat-first. Keep the live conversation visible while execution context, run history, and runtime details stay alongside it instead of hiding behind secondary tabs."
        onSubmit={handleSubmit}
      />
    </>
  );
}
