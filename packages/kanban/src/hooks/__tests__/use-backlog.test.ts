import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTaskTag,
  deleteTaskTag,
  loadTaskTags,
  updateTaskTag,
} from "../use-backlog";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("task tag backlog helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads task tags from the task tags API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        taskTags: [
          {
            id: "task-tag-1",
            key: "bug_report",
            label: "Bug Report",
            content: "Describe the bug",
            order: 0,
            createdAt: "2026-04-24T12:00:00.000Z",
            updatedAt: "2026-04-24T12:00:00.000Z",
          },
        ],
      }),
    );

    const taskTags = await loadTaskTags();

    expect(taskTags).toHaveLength(1);
    expect(taskTags[0]?.key).toBe("bug_report");
    expect(fetch).toHaveBeenCalledWith("/api/task-tags", expect.anything());
  });

  it("posts created task tags to the task tags API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ taskTags: [] }, 201));

    await createTaskTag({
      key: "deployment_validation",
      label: "Deployment Validation",
      content: "Run release checks",
      order: 1,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/task-tags");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(
      JSON.stringify({
        key: "deployment_validation",
        label: "Deployment Validation",
        content: "Run release checks",
        order: 1,
      }),
    );
  });

  it("patches task tags through the task tags API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ taskTags: [] }));

    await updateTaskTag("task-tag-1", { label: "Ship Validation" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/task-tags/task-tag-1");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ label: "Ship Validation" }));
  });

  it("deletes task tags through the task tags API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ taskTags: [] }));

    await deleteTaskTag("task-tag-1");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/task-tags/task-tag-1");
    expect(init?.method).toBe("DELETE");
  });
});
