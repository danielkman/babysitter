import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { KanbanWorkflowState } from "@a5c-ai/agent-mux-core/kanban";

import type {
  BacklogOverview,
  CreateBacklogIssueInput,
  CreateBacklogIssueResult,
  LinkIssueWorkspaceInput,
  UpdateIssueDetailInput,
} from "@/lib/services/backlog-query-service";
import { BacklogQueryService } from "@/lib/services/backlog-query-service";
import type {
  WorkspaceInventoryResponse,
  WorkspaceProvisionResult,
} from "@/lib/workspace-lifecycle";
import { WorkspaceLifecycleService } from "@/lib/workspace-lifecycle";
import { toolError, toolResult } from "@/mcp/util/errors";

type BacklogServiceLike = Pick<
  BacklogQueryService,
  "getOverview" | "createIssue" | "moveIssue" | "updateIssueDetail" | "linkIssueWorkspace"
>;

type WorkspaceServiceLike = Pick<
  WorkspaceLifecycleService,
  "listWorkspaces" | "provisionWorkspaceForIssue"
>;

export interface KanbanBacklogToolDeps {
  backlogService?: BacklogServiceLike;
  workspaceService?: WorkspaceServiceLike;
}

const workflowStateSchema = z.enum(["todo", "in-progress", "review", "done"]);
const issueStatusSchema = z.enum([
  "backlog",
  "ready",
  "in-progress",
  "blocked",
  "review",
  "done",
]);
const issuePrioritySchema = z.enum(["critical", "high", "medium", "low"]);

function defaultDeps(): Required<KanbanBacklogToolDeps> {
  return {
    backlogService: new BacklogQueryService(),
    workspaceService: new WorkspaceLifecycleService(),
  };
}

function findIssue(overview: BacklogOverview, issueId: string) {
  return overview.snapshot.issues.find((candidate) => candidate.id === issueId);
}

function findWorkspace(inventory: WorkspaceInventoryResponse, workspacePath: string) {
  return inventory.workspaces.find((candidate) => candidate.path === workspacePath);
}

function toCreateIssueInput(args: {
  projectId?: string;
  parentIssueId?: string;
  title: string;
  summary?: string;
  description?: string;
  status?: "backlog" | "ready" | "in-progress" | "blocked" | "review" | "done";
  priority?: "critical" | "high" | "medium" | "low";
  labelIds?: string[];
  assigneeIds?: string[];
}): CreateBacklogIssueInput {
  return {
    projectId: args.projectId,
    parentIssueId: args.parentIssueId,
    title: args.title,
    summary: args.summary,
    description: args.description,
    status: args.status,
    priority: args.priority,
    labelIds: args.labelIds,
    assigneeIds: args.assigneeIds,
  };
}

function toIssueDetailInput(args: {
  issueId: string;
  expectedUpdatedAt?: string;
  description?: string;
  priority?: "critical" | "high" | "medium" | "low";
  assigneeIds?: string[];
  labelIds?: string[];
}): UpdateIssueDetailInput {
  return {
    issueId: args.issueId,
    expectedUpdatedAt: args.expectedUpdatedAt,
    description: args.description,
    priority: args.priority,
    assigneeIds: args.assigneeIds,
    labelIds: args.labelIds,
  };
}

function toWorkspaceLinkInput(args: {
  issueId: string;
  workspacePath: string;
  workspaceName?: string;
  branchName?: string;
  source: "created-from-issue" | "linked-existing-workspace";
}): LinkIssueWorkspaceInput {
  return {
    issueId: args.issueId,
    workspacePath: args.workspacePath,
    workspaceName: args.workspaceName,
    branchName: args.branchName,
    source: args.source,
  };
}

function workspaceResultFromProvision(provisioned: WorkspaceProvisionResult) {
  return {
    path: provisioned.workspacePath,
    name: provisioned.workspaceName,
    branchName: provisioned.branchName,
  };
}

export function registerBacklogTools(server: McpServer, deps?: KanbanBacklogToolDeps): void {
  const resolved = { ...defaultDeps(), ...deps };

  server.tool(
    "kanban_overview",
    "Return the current kanban backlog, board snapshot, and summary counts",
    {},
    async () => {
      try {
        const overview = await resolved.backlogService.getOverview();
        return toolResult(overview);
      } catch (error) {
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.tool(
    "kanban_issue_create",
    "Create a new kanban issue or sub-issue",
    {
      projectId: z.string().optional().describe("Project ID that owns the new issue"),
      parentIssueId: z.string().optional().describe("Optional parent issue ID when creating a sub-issue"),
      title: z.string().describe("Issue title"),
      summary: z.string().optional().describe("Short summary shown on cards"),
      description: z.string().optional().describe("Long-form issue description"),
      status: issueStatusSchema.optional().describe("Initial issue status"),
      priority: issuePrioritySchema.optional().describe("Initial issue priority"),
      labelIds: z.array(z.string()).optional().describe("Label IDs to attach"),
      assigneeIds: z.array(z.string()).optional().describe("Assignee IDs to attach"),
    },
    async (args) => {
      try {
        const created: CreateBacklogIssueResult = await resolved.backlogService.createIssue(
          toCreateIssueInput(args),
        );
        return toolResult(created);
      } catch (error) {
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.tool(
    "kanban_issue_move",
    "Move a kanban issue across workflow states using board policy evaluation",
    {
      issueId: z.string().describe("Issue ID to move"),
      toState: workflowStateSchema.describe("Workflow state to move the issue into"),
    },
    async (args: { issueId: string; toState: KanbanWorkflowState }) => {
      try {
        const overview = await resolved.backlogService.moveIssue(args);
        return toolResult(overview);
      } catch (error) {
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.tool(
    "kanban_issue_update",
    "Update editable issue detail fields such as description, priority, assignees, or labels",
    {
      issueId: z.string().describe("Issue ID to update"),
      expectedUpdatedAt: z.string().optional().describe("Optimistic concurrency token from the current issue.updatedAt"),
      description: z.string().optional().describe("Next issue description"),
      priority: issuePrioritySchema.optional().describe("Next issue priority"),
      assigneeIds: z.array(z.string()).optional().describe("Next assignee IDs"),
      labelIds: z.array(z.string()).optional().describe("Next project label IDs"),
    },
    async (args) => {
      try {
        const overview = await resolved.backlogService.updateIssueDetail(toIssueDetailInput(args));
        return toolResult(overview);
      } catch (error) {
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.tool(
    "kanban_issue_workspace_create",
    "Provision a workspace for an issue and link that workspace back to the kanban issue",
    {
      issueId: z.string().describe("Issue ID that should own the new workspace"),
    },
    async (args: { issueId: string }) => {
      try {
        const current = await resolved.backlogService.getOverview();
        const issue = findIssue(current, args.issueId);
        if (!issue) {
          return toolError(`Issue ${args.issueId} not found.`);
        }

        const provisioned = await resolved.workspaceService.provisionWorkspaceForIssue({
          issueKey: issue.key,
          issueTitle: issue.title,
        });
        const overview = await resolved.backlogService.linkIssueWorkspace(
          toWorkspaceLinkInput({
            issueId: issue.id,
            workspacePath: provisioned.workspacePath,
            workspaceName: provisioned.workspaceName,
            branchName: provisioned.branchName,
            source: "created-from-issue",
          }),
        );

        return toolResult({
          workspace: workspaceResultFromProvision(provisioned),
          overview,
        });
      } catch (error) {
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.tool(
    "kanban_issue_workspace_link",
    "Link an existing managed workspace to a kanban issue",
    {
      issueId: z.string().describe("Issue ID that should own the workspace"),
      workspacePath: z.string().describe("Managed workspace path to link"),
    },
    async (args: { issueId: string; workspacePath: string }) => {
      try {
        const inventory = await resolved.workspaceService.listWorkspaces();
        const workspace = findWorkspace(inventory, args.workspacePath);
        if (!workspace) {
          return toolError(`Workspace ${args.workspacePath} not found.`);
        }
        if (workspace.missing) {
          return toolError(`Workspace ${args.workspacePath} is missing. Recover it before linking.`);
        }

        const overview = await resolved.backlogService.linkIssueWorkspace(
          toWorkspaceLinkInput({
            issueId: args.issueId,
            workspacePath: workspace.path,
            workspaceName: workspace.name,
            branchName: workspace.git.branch ?? undefined,
            source: "linked-existing-workspace",
          }),
        );

        return toolResult({
          workspace: {
            path: workspace.path,
            name: workspace.name,
            branchName: workspace.git.branch ?? null,
          },
          overview,
        });
      } catch (error) {
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  );
}
