import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "../fixtures";

const GATEWAY_URL = "http://127.0.0.1:7878";
const AUTH_STORAGE_KEY = "babysitter.kanban.gateway-auth";
const MOCK_TOKEN = "task-tags-e2e-token";
const TASK_TAGS_FIXTURE_PATH = path.resolve(
  __dirname,
  "../fixtures/kanban-backlog.task-tags.json",
);
const BASELINE_TASK_TAG_FIXTURE = {
  taskTags: [
    {
      id: "task-tag-bug-report",
      key: "bug_report",
      label: "Bug Report",
      content: "Describe the bug in detail.",
      description: "Capture reproduction details and observed behavior.",
      order: 0,
      createdAt: "2026-04-24T12:00:00.000Z",
      updatedAt: "2026-04-24T12:00:00.000Z",
    },
    {
      id: "task-tag-deployment-validation",
      key: "deployment_validation",
      label: "Deployment Validation",
      content: "Validate staging deploy, smoke tests, and rollback path.",
      description: "Release checklist scaffold.",
      order: 1,
      createdAt: "2026-04-24T12:00:00.000Z",
      updatedAt: "2026-04-24T12:00:00.000Z",
    },
  ],
} as const;

type StoredTaskTag = {
  id: string;
  key: string;
  label: string;
  content: string;
  description?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

async function resetTaskTagFixture(): Promise<void> {
  await fs.writeFile(
    TASK_TAGS_FIXTURE_PATH,
    `${JSON.stringify(BASELINE_TASK_TAG_FIXTURE, null, 2)}\n`,
    "utf8",
  );
}

async function readTaskTags(): Promise<StoredTaskTag[]> {
  const payload = JSON.parse(await fs.readFile(TASK_TAGS_FIXTURE_PATH, "utf8")) as {
    taskTags?: StoredTaskTag[];
  };
  return payload.taskTags ?? [];
}

async function seedGatewayAuth(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(
    ({ authStorageKey, gatewayUrl, token }) => {
      window.localStorage.setItem(authStorageKey, JSON.stringify({ gatewayUrl, token }));
    },
    {
      authStorageKey: AUTH_STORAGE_KEY,
      gatewayUrl: GATEWAY_URL,
      token: MOCK_TOKEN,
    },
  );
}

async function stubGateway(page: import("@playwright/test").Page): Promise<{
  submittedPrompt: () => string | null;
}> {
  let createdSession:
    | {
        sessionId: string;
        agent: string;
        activeRunId: string;
        latestRunId: string;
        status: string;
      }
    | null = null;
  let prompt: string | null = null;

  await page.route(`${GATEWAY_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/v1/agents") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          agents: [
            {
              agent: "codex",
              displayName: "codex",
              supportsInteractiveMode: true,
              structuredSessionTransport: "persistent",
              sessionControlPlane: "gateway",
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === "/api/v1/runs") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          runs: createdSession
            ? [{ runId: createdSession.activeRunId, sessionId: createdSession.sessionId, agent: "codex" }]
            : [],
        }),
      });
      return;
    }

    if (url.pathname === "/api/v1/sessions" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessions: createdSession ? [createdSession] : [],
        }),
      });
      return;
    }

    if (url.pathname === "/api/v1/sessions" && request.method() === "POST") {
      const payload = request.postDataJSON() as { prompt?: string };
      prompt = payload.prompt ?? null;
      createdSession = {
        sessionId: "sess-task-tags-e2e",
        agent: "codex",
        activeRunId: "run-task-tags-e2e",
        latestRunId: "run-task-tags-e2e",
        status: "active",
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          run: {
            runId: createdSession.activeRunId,
            sessionId: createdSession.sessionId,
            agent: "codex",
            status: "active",
          },
          session: createdSession,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  return {
    submittedPrompt: () => prompt,
  };
}

test.beforeEach(async () => {
  await resetTaskTagFixture();
});

test.afterEach(async () => {
  await resetTaskTagFixture();
});

test("settings page persists Task Tag create, edit, reorder, and delete against package-local storage", async ({
  page,
}) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });

  const taskTagSection = page.getByTestId("task-tag-settings");
  await expect(taskTagSection.getByText("Task Tags")).toBeVisible();
  await expect(taskTagSection.getByText("Bug Report")).toBeVisible();
  await expect(taskTagSection.getByText("Deployment Validation")).toBeVisible();

  await page.getByLabel("Task Tag key").fill("release_notes");
  await page.getByLabel("Task Tag label").fill("Release Notes");
  await page.getByLabel("Task Tag description").fill("Prepare the release summary.");
  await page
    .getByLabel("Task Tag content")
    .fill("Summarize changes, risk, rollout plan, and rollback plan.");
  await page.getByRole("button", { name: "Create Task Tag" }).click();

  await expect(page.getByText("Created @release_notes.")).toBeVisible();
  let taskTags = await readTaskTags();
  expect(taskTags.map((taskTag) => taskTag.key)).toContain("release_notes");
  expect(taskTags.find((taskTag) => taskTag.key === "release_notes")?.label).toBe("Release Notes");

  const createdItem = page.locator("[data-testid^='task-tag-item-']").filter({
    hasText: "Release Notes",
  });
  await createdItem.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Task Tag label").fill("Ship Notes");
  await page.getByRole("button", { name: "Save Task Tag" }).click();

  await expect(page.getByText("Updated @release_notes.")).toBeVisible();
  taskTags = await readTaskTags();
  expect(taskTags.find((taskTag) => taskTag.key === "release_notes")?.label).toBe("Ship Notes");

  await page.getByRole("button", { name: "Move Ship Notes up" }).click();
  await expect(page.getByText("Updated Task Tag order.")).toBeVisible();
  taskTags = await readTaskTags();
  expect(taskTags.find((taskTag) => taskTag.key === "release_notes")?.order).toBe(1);

  const updatedItem = page.locator("[data-testid^='task-tag-item-']").filter({
    hasText: "Ship Notes",
  });
  await updatedItem.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText("Deleted @release_notes.")).toBeVisible();
  taskTags = await readTaskTags();
  expect(taskTags.map((taskTag) => taskTag.key)).not.toContain("release_notes");
});

test("new session authoring inserts a Task Tag snippet and submits the expanded prompt", async ({
  page,
}) => {
  const gateway = await stubGateway(page);
  await seedGatewayAuth(page);

  await page.goto("/sessions/new", { waitUntil: "domcontentloaded" });

  const prompt = page.getByPlaceholder("Describe the task you want the agent to handle...");
  await expect(prompt).toBeVisible();

  await prompt.fill("@deploy");
  await page.getByText("Deployment Validation").click();
  await expect(prompt).toHaveValue("Validate staging deploy, smoke tests, and rollback path.");

  await page.getByRole("button", { name: "Start session" }).click();

  await expect(page).toHaveURL(/\/sessions\/sess-task-tags-e2e$/);
  expect(gateway.submittedPrompt()).toBe(
    "Validate staging deploy, smoke tests, and rollback path.",
  );
});
