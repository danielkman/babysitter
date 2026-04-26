import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerBacklogTools, type KanbanBacklogToolDeps } from "@/mcp/tools/backlog";
import { registerWorkspaceTools, type KanbanWorkspaceToolDeps } from "@/mcp/tools/workspaces";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require("../../package.json") as { version: string };

export interface KanbanMcpServerDeps extends KanbanBacklogToolDeps, KanbanWorkspaceToolDeps {}

export function createKanbanMcpServer(deps?: KanbanMcpServerDeps): McpServer {
  const server = new McpServer({
    name: "kanban",
    version: pkg.version,
  });

  registerBacklogTools(server, deps);
  registerWorkspaceTools(server, deps);

  return server;
}
