import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it } from "vitest";

import { registerBacklogTools } from "@/mcp/tools/backlog";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function getToolHandler(server: McpServer, name: string): ToolHandler {
  const tools = (
    server as unknown as {
      _registeredTools: Record<string, { handler: ToolHandler }>;
    }
  )._registeredTools;
  const tool = tools[name];
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool.handler;
}

function parseResult(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

function createOverview(issues: Array<Record<string, unknown>>) {
  return {
    snapshot: {
      generatedAt: "2026-04-26T00:00:00.000Z",
      projects: [
        {
          id: "kanban-app",
          key: "KANBAN",
          name: "Kanban App",
          issueIds: issues.map((issue) => issue.id),
        },
      ],
      issues,
      taskTags: [],
      dispatchContextLabels: [],
    },
    board: {
      generatedAt: "2026-04-26T00:00:00.000Z",
      projects: [],
    },
    summary: {
      projectCount: 1,
      issueCount: issues.length,
      readyCount: issues.filter((issue) => issue.status === "ready").length,
      blockedCount: issues.filter((issue) => issue.status === "blocked").length,
      dispatchedCount: 0,
      completedCount: issues.filter((issue) => issue.status === "done").length,
      needsDecompositionCount: 0,
      inProgressCount: issues.filter((issue) => issue.status === "in-progress").length,
    },
  };
}

describe("kanban backlog MCP tools", () => {
  let server: McpServer;

  beforeEach(() => {
    let sequence = 1;
    const issues: Array<Record<string, unknown>> = [
      {
        id: "KANBAN-SEED-001",
        key: "KANBAN-SEED-001",
        title: "Seed issue",
        projectId: "kanban-app",
        status: "ready",
        priority: "high",
        workspaceLinks: [],
      },
    ];

    const backlogService = {
      getOverview: async () => createOverview(issues),
      createIssue: async ({ title, projectId }: { title: string; projectId?: string }) => {
        const key = `KANBAN-${String(sequence).padStart(3, "0")}`;
        sequence += 1;
        const issue = {
          id: key,
          key,
          title,
          projectId: projectId ?? "kanban-app",
          status: "backlog",
          priority: "medium",
          workspaceLinks: [],
        };
        issues.push(issue);
        return {
          overview: createOverview(issues),
          issue,
        };
      },
      moveIssue: async ({ issueId, toState }: { issueId: string; toState: string }) => {
        const issue = issues.find((candidate) => candidate.id === issueId);
        if (!issue) {
          throw new Error(`Issue ${issueId} not found.`);
        }
        issue.status = toState === "todo" ? "backlog" : toState;
        return createOverview(issues);
      },
      updateIssueDetail: async ({
        issueId,
        description,
      }: {
        issueId: string;
        description?: string;
      }) => {
        const issue = issues.find((candidate) => candidate.id === issueId);
        if (!issue) {
          throw new Error(`Issue ${issueId} not found.`);
        }
        issue.description = description;
        return createOverview(issues);
      },
      linkIssueWorkspace: async ({
        issueId,
        workspacePath,
        workspaceName,
        branchName,
        source,
      }: {
        issueId: string;
        workspacePath: string;
        workspaceName?: string;
        branchName?: string;
        source: "created-from-issue" | "linked-existing-workspace";
      }) => {
        const issue = issues.find((candidate) => candidate.id === issueId);
        if (!issue) {
          throw new Error(`Issue ${issueId} not found.`);
        }
        const links = Array.isArray(issue.workspaceLinks) ? issue.workspaceLinks : [];
        links.push({
          workspacePath,
          workspaceName,
          branchName,
          linkedAt: "2026-04-26T00:00:00.000Z",
          source,
        });
        issue.workspaceLinks = links;
        return createOverview(issues);
      },
    };

    const workspaceService = {
      listWorkspaces: async () => ({
        workspaces: [
          {
            path: "/repo/worktrees/shared",
            name: "shared",
            status: "idle",
            missing: false,
            archivedAt: null,
            cleanedAt: null,
            lastActivityAt: null,
            git: {
              root: "/repo",
              commonDir: "/repo/.git",
              trackingBranch: "origin/main",
              branch: "vk/shared",
              head: "abc123",
              ahead: 0,
              behind: 0,
              dirty: false,
              uncommittedCount: 0,
              isWorktree: true,
              isPrimary: false,
            },
            notes: { value: "", updatedAt: null },
            links: { editorHref: "vscode://file/repo/worktrees/shared" },
            sessions: { total: 0, active: 0, items: [] },
            runs: { total: 0, active: 0, items: [] },
            actions: {
              canArchive: true,
              canCleanup: false,
              canRecover: false,
              canRebaseStart: false,
              canRebaseAutoResolve: false,
              canRebaseOpenInEditor: false,
              canRebaseMarkResolved: false,
              canRebaseAbort: false,
            },
          },
        ],
        summary: {
          total: 1,
          active: 0,
          idle: 1,
          archived: 0,
          missing: 0,
        },
      }),
      provisionWorkspaceForIssue: async ({ issueKey }: { issueKey: string }) => ({
        workspacePath: `/repo/worktrees/${issueKey.toLowerCase()}`,
        workspaceName: issueKey,
        branchName: `vk/${issueKey.toLowerCase()}`,
      }),
    };

    server = new McpServer({ name: "kanban-backlog-test", version: "0.0.0" });
    registerBacklogTools(server, {
      backlogService,
      workspaceService,
    });
  });

  it("returns the seeded overview", async () => {
    const handler = getToolHandler(server, "kanban_overview");
    const result = await handler({});
    const data = parseResult(result);

    expect(result.isError).toBeUndefined();
    expect((data.summary as { projectCount: number }).projectCount).toBe(1);
    expect(Array.isArray((data.snapshot as { issues: unknown[] }).issues)).toBe(true);
  });

  it("creates an issue and returns the created issue payload", async () => {
    const handler = getToolHandler(server, "kanban_issue_create");
    const result = await handler({
      projectId: "kanban-app",
      title: "Add MCP workspace bridge",
      summary: "Expose kanban workspaces over MCP",
      priority: "high",
    });
    const data = parseResult(result);
    const createdIssue = data.issue as { key: string; title: string };

    expect(result.isError).toBeUndefined();
    expect(createdIssue.title).toBe("Add MCP workspace bridge");
    expect(createdIssue.key).toBe("KANBAN-001");
  });

  it("provisions and links a workspace to an issue", async () => {
    const createHandler = getToolHandler(server, "kanban_issue_create");
    const createResult = await createHandler({
      projectId: "kanban-app",
      title: "Create workspace from MCP",
    });
    const createData = parseResult(createResult);
    const issueId = (createData.issue as { id: string }).id;

    const handler = getToolHandler(server, "kanban_issue_workspace_create");
    const result = await handler({ issueId });
    const data = parseResult(result);
    const workspace = data.workspace as { path: string; name: string };
    const issues = (
      data.overview as {
        snapshot: { issues: Array<{ id: string; workspaceLinks?: Array<{ workspacePath: string }> }> };
      }
    ).snapshot.issues;
    const linkedIssue = issues.find((candidate) => candidate.id === issueId);

    expect(result.isError).toBeUndefined();
    expect(workspace.name).toBe("KANBAN-001");
    expect(workspace.path).toBe("/repo/worktrees/kanban-001");
    expect(linkedIssue?.workspaceLinks?.[0]?.workspacePath).toBe("/repo/worktrees/kanban-001");
  });
});
