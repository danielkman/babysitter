import { describe, expect, it } from "vitest";

import { createKanbanMcpServer } from "@/mcp/server";

describe("createKanbanMcpServer", () => {
  it("registers the expected kanban and workspace tools", () => {
    const server = createKanbanMcpServer();
    const registeredTools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;

    expect(Object.keys(registeredTools).sort()).toEqual([
      "kanban_issue_create",
      "kanban_issue_move",
      "kanban_issue_update",
      "kanban_issue_workspace_create",
      "kanban_issue_workspace_link",
      "kanban_overview",
      "kanban_workspace_action",
      "kanban_workspaces_list",
    ]);
  });
});
