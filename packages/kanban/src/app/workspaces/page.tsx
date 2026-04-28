"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Attachment, WorkspaceRuntimeSurface } from "@a5c-ai/agent-mux-core";

import { RequireGatewayAuth } from "@/components/agent-mux/require-gateway-auth";
import { WorkspacesPageContent } from "@/components/workspaces/workspaces-page";
import { useGatewayFetch } from "@/components/agent-mux/gateway-provider";
import { useConnection, useGateway } from "@/lib/agent-mux-ui";

function readRuntime(value: unknown): WorkspaceRuntimeSurface | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as WorkspaceRuntimeSurface;
}

export default function WorkspacesPage() {
  return (
    <RequireGatewayAuth>
      <WorkspacesContent />
    </RequireGatewayAuth>
  );
}

function WorkspacesContent() {
  const searchParams = useSearchParams();
  const selectedWorkspacePath = searchParams.get("workspace");
  const fetchGateway = useGatewayFetch();
  const connection = useConnection();
  const { store } = useGateway();
  const sessions = useStore(store, useShallow((state) => Object.values(state.sessions.byId)));
  const runs = useStore(store, useShallow((state) => Object.values(state.runs.byId)));
  const eventBuffers = useStore(store, (state) => state.events.byRunId);

  const workspaceSessions = useMemo(
    () =>
      sessions.flatMap((session) => {
        const sessionId = typeof session.sessionId === "string" ? session.sessionId : "";
        const agent = typeof session.agent === "string" ? session.agent : "";
        const status = session.status === "active" ? "active" : "inactive";
        if (!sessionId || !agent) {
          return [];
        }

        return [
          {
            sessionId,
            agent,
            status,
            cwd: typeof session.cwd === "string" ? session.cwd : undefined,
            title: typeof session.title === "string" ? session.title : undefined,
            updatedAt: typeof session.updatedAt === "number" ? session.updatedAt : undefined,
            activeRunId: typeof session.activeRunId === "string" ? session.activeRunId : null,
            latestRunId: typeof session.latestRunId === "string" ? session.latestRunId : null,
            runtime: readRuntime(session.runtime),
          },
        ];
      }),
    [sessions],
  );

  async function handleSendPrompt(input: {
    sessionId: string;
    prompt: string;
    agent?: string;
    model?: string;
    attachments?: Attachment[];
    approvalMode?: "yolo" | "prompt" | "deny";
  }) {
    const response = await fetchGateway(`/api/v1/sessions/${input.sessionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: input.prompt,
        agent: input.agent,
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

    if (body.run?.runId) {
      store.getState().actions.mergeRun(String(body.run.runId), body.run);
    }
    if (body.session?.sessionId) {
      store.getState().actions.mergeSession(String(body.session.sessionId), body.session);
    }
  }

  return (
    <WorkspacesPageContent
      isAuthenticated
      connectionStatus={connection.status}
      connectionError={connection.error ?? null}
      sessions={workspaceSessions}
      selectedWorkspacePath={selectedWorkspacePath}
      allRuns={runs as Array<Record<string, unknown>>}
      eventBuffers={eventBuffers}
      onSendPrompt={handleSendPrompt}
    />
  );
}
