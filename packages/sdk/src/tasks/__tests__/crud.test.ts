/**
 * Tests for programmatic task CRUD (GAP-TOOLS-014).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fsp from "node:fs/promises";
import { listTasks, readTask, readTaskStdout, readTaskStderr, countTasks } from "../crud";
import type { TaskSummary, TaskDetail } from "../crud";

// Mock fs.promises
vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
}));

const mockReaddir = vi.mocked(fsp.readdir);
const mockStat = vi.mocked(fsp.stat);
const mockReadFile = vi.mocked(fsp.readFile);

describe("listTasks (GAP-TOOLS-014)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists all tasks from a run directory", async () => {
    mockReaddir.mockResolvedValue(["eff-1", "eff-2"] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    mockStat.mockResolvedValue({ isDirectory: () => true } as fsp.FileHandle & { isDirectory: () => boolean } as unknown as Awaited<ReturnType<typeof fsp.stat>>);
    mockReadFile.mockImplementation(async (p) => {
      const pathStr = String(p);
      if (pathStr.includes("eff-1") && pathStr.endsWith("task.json")) {
        return JSON.stringify({ taskId: "t1", kind: "agent", title: "Task 1", labels: ["test"] });
      }
      if (pathStr.includes("eff-2") && pathStr.endsWith("task.json")) {
        return JSON.stringify({ taskId: "t2", kind: "shell", title: "Task 2" });
      }
      if (pathStr.includes("eff-1") && pathStr.endsWith("result.json")) {
        return JSON.stringify({ status: "ok", resolvedAt: "2026-01-01T00:02:00Z" });
      }
      throw new Error("ENOENT");
    });

    const tasks: TaskSummary[] = await listTasks("/fake/run");

    expect(tasks).toHaveLength(2);
    expect(tasks.find((t) => t.taskId === "t1")?.status).toBe("resolved");
    expect(tasks.find((t) => t.taskId === "t2")?.status).toBe("requested");
  });

  it("filters by status", async () => {
    mockReaddir.mockResolvedValue(["eff-1", "eff-2"] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    mockStat.mockResolvedValue({ isDirectory: () => true } as unknown as Awaited<ReturnType<typeof fsp.stat>>);
    mockReadFile.mockImplementation(async (p) => {
      const pathStr = String(p);
      if (pathStr.endsWith("task.json")) {
        return JSON.stringify({ taskId: "t", kind: "agent" });
      }
      if (pathStr.includes("eff-1") && pathStr.endsWith("result.json")) {
        return JSON.stringify({ status: "ok" });
      }
      throw new Error("ENOENT");
    });

    const requested = await listTasks("/fake/run", { status: "requested" });
    expect(requested).toHaveLength(1);

    const resolved = await listTasks("/fake/run", { status: "resolved" });
    expect(resolved).toHaveLength(1);
  });

  it("returns empty for nonexistent tasks dir", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));

    const tasks = await listTasks("/fake/run");

    expect(tasks).toHaveLength(0);
  });
});

describe("readTask (GAP-TOOLS-014)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads task definition and result", async () => {
    mockReadFile.mockImplementation(async (p) => {
      const pathStr = String(p);
      if (pathStr.endsWith("task.json")) {
        return JSON.stringify({
          taskId: "t1",
          kind: "agent",
          title: "My Task",
          labels: ["review"],
        });
      }
      if (pathStr.endsWith("result.json")) {
        return JSON.stringify({ status: "ok", value: { score: 95 } });
      }
      throw new Error("ENOENT");
    });

    const task: TaskDetail | null = await readTask("/fake/run", "eff-1");

    expect(task).not.toBeNull();
    expect(task!.taskId).toBe("t1");
    expect(task!.kind).toBe("agent");
    expect(task!.status).toBe("resolved");
    expect(task!.definition).toBeDefined();
    expect(task!.result).toBeDefined();
  });

  it("returns null for nonexistent task", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const task = await readTask("/fake/run", "nonexistent");

    expect(task).toBeNull();
  });

  it("returns task with no result", async () => {
    mockReadFile.mockImplementation(async (p) => {
      const pathStr = String(p);
      if (pathStr.endsWith("task.json")) {
        return JSON.stringify({ taskId: "t1", kind: "shell" });
      }
      throw new Error("ENOENT");
    });

    const task = await readTask("/fake/run", "eff-1");

    expect(task).not.toBeNull();
    expect(task!.status).toBe("requested");
    expect(task!.result).toBeUndefined();
  });
});

describe("readTaskStdout / readTaskStderr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads stdout content", async () => {
    mockReadFile.mockResolvedValue("output line 1\noutput line 2");

    const stdout = await readTaskStdout("/fake/run", "eff-1");

    expect(stdout).toBe("output line 1\noutput line 2");
  });

  it("returns null when stdout missing", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const stdout = await readTaskStdout("/fake/run", "eff-1");

    expect(stdout).toBeNull();
  });

  it("reads stderr content", async () => {
    mockReadFile.mockResolvedValue("error output");

    const stderr = await readTaskStderr("/fake/run", "eff-1");

    expect(stderr).toBe("error output");
  });
});

describe("countTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts tasks by status", async () => {
    mockReaddir.mockResolvedValue(["eff-1", "eff-2", "eff-3"] as unknown as Awaited<ReturnType<typeof fsp.readdir>>);
    mockStat.mockResolvedValue({ isDirectory: () => true } as unknown as Awaited<ReturnType<typeof fsp.stat>>);
    mockReadFile.mockImplementation(async (p) => {
      const pathStr = String(p);
      if (pathStr.endsWith("task.json")) {
        return JSON.stringify({ taskId: "t", kind: "agent" });
      }
      if ((pathStr.includes("eff-1") || pathStr.includes("eff-2")) && pathStr.endsWith("result.json")) {
        return JSON.stringify({ status: "ok" });
      }
      throw new Error("ENOENT");
    });

    const counts = await countTasks("/fake/run");

    expect(counts.total).toBe(3);
    expect(counts.resolved).toBe(2);
    expect(counts.requested).toBe(1);
  });
});
