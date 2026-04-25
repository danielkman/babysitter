import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/test/test-utils";

import { getWorkspaceOwnershipLabel, loadInventory, runWorkspaceAction, WorkspacesPageContent } from "../workspaces-page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href?: string; children?: unknown; [key: string]: unknown }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-reviews", () => ({
  useReviews: () => ({
    loading: false,
    error: undefined,
    artifacts: [],
    queue: [],
    summary: { pendingCount: 0, changesRequestedCount: 0 },
    pendingArtifactId: null,
    actOnReview: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("workspaces-page helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("describes session-backed ownership when the gateway is connected", () => {
    expect(
      getWorkspaceOwnershipLabel(true, [
        { sessionId: "session-1", agent: "codex", status: "active", cwd: "/repo/worktrees/task" },
      ]),
    ).toBe("1 agent-mux sessions enriching workspace ownership");
  });

  it("falls back to local inventory copy when the gateway is disconnected", () => {
    expect(getWorkspaceOwnershipLabel(false, [])).toBe(
      "Gateway disconnected: inventory falls back to local git worktrees and archived workspace metadata",
    );
  });

  it("loads workspace inventory through the workspace API", async () => {
    const payload = {
      summary: { total: 1, active: 1, idle: 0, archived: 0, missing: 0 },
      workspaces: [],
    };
    const runtime = {
      updatedAt: 1,
      workspacePath: "/repo/worktrees/task",
      preview: {
        status: "ready",
        primaryUrl: "http://127.0.0.1:3000",
        urls: ["http://127.0.0.1:3000"],
        deviceProfiles: [],
      },
      terminal: {
        status: "idle",
        commands: [],
      },
      devServer: {
        status: "running",
        primaryUrl: "http://127.0.0.1:3000",
        urls: ["http://127.0.0.1:3000"],
        logs: [],
      },
    };

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      loadInventory([
        { sessionId: "session-1", agent: "codex", status: "active", cwd: "/repo/worktrees/task", runtime },
      ]),
    ).resolves.toEqual(payload);

    expect(fetch).toHaveBeenCalledWith(
      "/api/workspaces",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          sessions: [{ sessionId: "session-1", agent: "codex", status: "active", cwd: "/repo/worktrees/task", runtime }],
        }),
      }),
    );
  });

  it("posts lifecycle actions back to the workspace API", async () => {
    const payload = {
      summary: { total: 1, active: 0, idle: 0, archived: 1, missing: 0 },
      workspaces: [],
      result: { ok: true },
    };

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(runWorkspaceAction("archive", "/repo/worktrees/task", [])).resolves.toEqual(payload);

    expect(fetch).toHaveBeenCalledWith(
      "/api/workspaces",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "archive",
          workspacePath: "/repo/worktrees/task",
          sessions: [],
        }),
      }),
    );
  });

  it("renders rebase conflict workflow actions and generated instructions", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("open", vi.fn());

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({
        summary: { total: 1, active: 1, idle: 0, archived: 0, missing: 0 },
        workspaces: [
          {
            path: "/repo/worktrees/task",
            name: "task",
            status: "active",
            missing: false,
            archivedAt: null,
            cleanedAt: null,
            lastActivityAt: "2026-04-24T12:00:00.000Z",
            git: {
              root: "/repo/main",
              commonDir: "/repo/main/.git",
              branch: "vk/task",
              head: "abc123",
              dirty: true,
              isWorktree: true,
              isPrimary: false,
            },
            sessions: { total: 1, active: 1, items: [] },
            runs: { total: 1, active: 1, items: [] },
            rebase: {
              status: "rebase-conflicts",
              attemptCount: 1,
              unresolvedFiles: ["packages/kanban/src/lib/workspace-lifecycle.ts"],
              resolvedFiles: ["packages/kanban/src/components/workspaces/workspaces-page.tsx"],
              followUpInstructions: [
                "Unresolved files: packages/kanban/src/lib/workspace-lifecycle.ts.",
                "Open in editor for manual fixes, then use Mark resolved to return the workspace to review or merge readiness.",
              ],
              manualResolutionSuggested: true,
              readyFor: "merge",
              editorHref: "vscode://file/repo/worktrees/task",
            },
            actions: {
              canArchive: true,
              canCleanup: false,
              canRecover: false,
              canRebaseStart: false,
              canRebaseAutoResolve: true,
              canRebaseOpenInEditor: true,
              canRebaseMarkResolved: true,
              canRebaseAbort: true,
            },
          },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<WorkspacesPageContent isAuthenticated sessions={[]} />);

    await waitFor(() => {
      expect(screen.getByText("Resolve conflicts before returning to review or merge")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Auto-resolve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open in editor" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mark resolved" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Abort" })).toBeEnabled();
    expect(screen.getByText(/Open in editor for manual fixes/)).toBeInTheDocument();
  });

  it("renders post-resolution readiness state from persisted rebase data", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({
        summary: { total: 1, active: 0, idle: 1, archived: 0, missing: 0 },
        workspaces: [
          {
            path: "/repo/worktrees/task",
            name: "task",
            status: "idle",
            missing: false,
            archivedAt: null,
            cleanedAt: null,
            lastActivityAt: "2026-04-24T12:00:00.000Z",
            git: {
              root: "/repo/main",
              commonDir: "/repo/main/.git",
              branch: "vk/task",
              head: "abc123",
              dirty: false,
              isWorktree: true,
              isPrimary: false,
            },
            sessions: { total: 0, active: 0, items: [] },
            runs: { total: 0, active: 0, items: [] },
            rebase: {
              status: "ready-for-merge",
              attemptCount: 2,
              unresolvedFiles: [],
              resolvedFiles: ["packages/kanban/src/lib/workspace-lifecycle.ts"],
              followUpInstructions: ["Rebase workflow completed. Continue the workspace through merge readiness."],
              manualResolutionSuggested: false,
              readyFor: "merge",
            },
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
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<WorkspacesPageContent isAuthenticated sessions={[]} />);

    await waitFor(() => {
      expect(screen.getByText("Ready for merge")).toBeInTheDocument();
    });
    expect(screen.getByText(/Continue the workspace through merge readiness/)).toBeInTheDocument();
  });
});
