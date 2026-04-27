import { NextResponse } from "next/server";

import {
  createClient,
  validateProfileData,
  type AgentName,
  type McpServerConfig,
} from "@a5c-ai/agent-mux-core";

import {
  loadSettingsSectionStorage,
  writeSettingsSectionStorage,
} from "@/lib/settings-section-storage";

export const dynamic = "force-dynamic";

const client = createClient();

interface McpServerDraft {
  name: string;
  transport: "stdio" | "sse" | "streamable-http";
  command: string;
  url: string;
  argsText: string;
  envText: string;
}

function toDraft(server: McpServerConfig): McpServerDraft {
  return {
    name: server.name,
    transport: server.transport,
    command: server.command ?? "",
    url: server.url ?? "",
    argsText: (server.args ?? []).join("\n"),
    envText: Object.entries(server.env ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  };
}

function parseEnv(envText: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of envText.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid env line "${line}". Use KEY=value.`);
    }
    env[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }
  return env;
}

function toConfig(draft: McpServerDraft): McpServerConfig {
  return {
    name: draft.name.trim(),
    transport: draft.transport,
    ...(draft.transport === "stdio" ? { command: draft.command.trim() } : {}),
    ...(draft.transport !== "stdio" ? { url: draft.url.trim() } : {}),
    ...(draft.argsText.trim()
      ? {
          args: draft.argsText
            .split("\n")
            .map((entry) => entry.trim())
            .filter(Boolean),
        }
      : {}),
    ...(draft.envText.trim() ? { env: parseEnv(draft.envText) } : {}),
  };
}

async function buildResponse() {
  const storage = await loadSettingsSectionStorage();
  return {
    agents: client.adapters.list().map((adapter) => ({
      agent: adapter.agent,
      displayName: adapter.displayName,
      servers: (storage.mcpServers[adapter.agent] ?? []).map(toDraft),
    })),
  };
}

export async function GET() {
  return NextResponse.json(await buildResponse());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  if (typeof body.agent !== "string" || !body.agent.trim()) {
    return NextResponse.json({ error: "agent is required" }, { status: 400 });
  }
  if (!Array.isArray(body.servers)) {
    return NextResponse.json({ error: "servers must be an array" }, { status: 400 });
  }

  let servers: McpServerConfig[];
  try {
    servers = body.servers.map((server) => {
      const draft = server as McpServerDraft;
      return toConfig({
        name: typeof draft.name === "string" ? draft.name : "",
        transport:
          draft.transport === "sse" || draft.transport === "streamable-http"
            ? draft.transport
            : "stdio",
        command: typeof draft.command === "string" ? draft.command : "",
        url: typeof draft.url === "string" ? draft.url : "",
        argsText: typeof draft.argsText === "string" ? draft.argsText : "",
        envText: typeof draft.envText === "string" ? draft.envText : "",
      });
    });
    validateProfileData({ mcpServers: servers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid MCP server configuration." },
      { status: 400 },
    );
  }

  const storage = await loadSettingsSectionStorage();
  storage.mcpServers[body.agent] = servers;
  await writeSettingsSectionStorage(storage);
  return NextResponse.json(await buildResponse());
}
