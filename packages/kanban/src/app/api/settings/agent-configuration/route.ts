import { NextResponse } from "next/server";

import type { AgentName } from "@a5c-ai/agent-mux-core";

import {
  loadSettingsSectionStorage,
  writeSettingsSectionStorage,
} from "@/lib/settings-section-storage";

export const dynamic = "force-dynamic";

async function loadAgentMuxCore() {
  return await import("@a5c-ai/agent-mux-core");
}

async function buildResponse() {
  const { createClient } = await loadAgentMuxCore();
  const client = createClient();
  const storage = await loadSettingsSectionStorage();
  return {
    agents: client.adapters.list().map((adapter) => {
      const stored = storage.agentConfiguration[adapter.agent] ?? {};
      const defaultModel = client.models.defaultModel(adapter.agent as AgentName)?.modelId ?? "";
      return {
        agent: adapter.agent,
        displayName: adapter.displayName,
        configuredModel: stored.model ?? "",
        configuredProvider: stored.provider ?? "",
        approvalMode: stored.approvalMode ?? "prompt",
        maxTokens: stored.maxTokens == null ? "" : String(stored.maxTokens),
        availableModels: client.models.catalog(adapter.agent as AgentName).map((model) => ({
          modelId: model.modelId,
          provider: model.provider,
          isDefault: model.isDefault,
          deprecated: model.deprecated,
          successorModelId: model.successorModelId,
        })),
        defaultModel,
      };
    }),
  };
}

export async function GET() {
  return NextResponse.json(await buildResponse());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const { createClient, validateProfileData } = await loadAgentMuxCore();
  const client = createClient();
  if (typeof body.agent !== "string" || !body.agent.trim()) {
    return NextResponse.json({ error: "agent is required" }, { status: 400 });
  }

  const approvalMode =
    body.approvalMode === "yolo" || body.approvalMode === "deny" ? body.approvalMode : "prompt";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  const maxTokensRaw = typeof body.maxTokens === "string" ? body.maxTokens.trim() : "";

  try {
    validateProfileData({
      approvalMode,
      ...(maxTokensRaw ? { maxTokens: Number.parseInt(maxTokensRaw, 10) } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid configuration." },
      { status: 400 },
    );
  }

  if (model) {
    const result = client.models.validate(body.agent as AgentName, model);
    if (!result.valid) {
      return NextResponse.json(
        {
          error:
            result.suggestions && result.suggestions.length > 0
              ? `${result.message}. Suggestions: ${result.suggestions.join(", ")}`
              : result.message,
        },
        { status: 400 },
      );
    }
  }

  const storage = await loadSettingsSectionStorage();
  storage.agentConfiguration[body.agent] = {
    model: model || undefined,
    provider: provider || undefined,
    approvalMode,
    ...(maxTokensRaw ? { maxTokens: Number.parseInt(maxTokensRaw, 10) } : {}),
  };
  await writeSettingsSectionStorage(storage);

  return NextResponse.json(await buildResponse());
}
