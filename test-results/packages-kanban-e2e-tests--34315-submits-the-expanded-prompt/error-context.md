# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: packages/kanban/e2e/tests/task-tags.spec.ts >> new session authoring inserts a Task Tag snippet and submits the expanded prompt
- Location: packages/kanban/e2e/tests/task-tags.spec.ts:234:5

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/sessions/new", waiting until "domcontentloaded"

```

# Test source

```ts
  140 |       prompt = payload.prompt ?? null;
  141 |       createdSession = {
  142 |         sessionId: "sess-task-tags-e2e",
  143 |         agent: "codex",
  144 |         activeRunId: "run-task-tags-e2e",
  145 |         latestRunId: "run-task-tags-e2e",
  146 |         status: "active",
  147 |       };
  148 | 
  149 |       await route.fulfill({
  150 |         status: 200,
  151 |         contentType: "application/json",
  152 |         body: JSON.stringify({
  153 |           run: {
  154 |             runId: createdSession.activeRunId,
  155 |             sessionId: createdSession.sessionId,
  156 |             agent: "codex",
  157 |             status: "active",
  158 |           },
  159 |           session: createdSession,
  160 |         }),
  161 |       });
  162 |       return;
  163 |     }
  164 | 
  165 |     await route.fulfill({
  166 |       status: 200,
  167 |       contentType: "application/json",
  168 |       body: JSON.stringify({}),
  169 |     });
  170 |   });
  171 | 
  172 |   return {
  173 |     submittedPrompt: () => prompt,
  174 |   };
  175 | }
  176 | 
  177 | test.beforeEach(async () => {
  178 |   await resetTaskTagFixture();
  179 | });
  180 | 
  181 | test.afterEach(async () => {
  182 |   await resetTaskTagFixture();
  183 | });
  184 | 
  185 | test("settings page persists Task Tag create, edit, reorder, and delete against package-local storage", async ({
  186 |   page,
  187 | }) => {
  188 |   await page.goto("/settings", { waitUntil: "domcontentloaded" });
  189 | 
  190 |   const taskTagSection = page.getByTestId("task-tag-settings");
  191 |   await expect(taskTagSection.getByText("Task Tags")).toBeVisible();
  192 |   await expect(taskTagSection.getByText("Bug Report")).toBeVisible();
  193 |   await expect(taskTagSection.getByText("Deployment Validation")).toBeVisible();
  194 | 
  195 |   await page.getByLabel("Task Tag key").fill("release_notes");
  196 |   await page.getByLabel("Task Tag label").fill("Release Notes");
  197 |   await page.getByLabel("Task Tag description").fill("Prepare the release summary.");
  198 |   await page
  199 |     .getByLabel("Task Tag content")
  200 |     .fill("Summarize changes, risk, rollout plan, and rollback plan.");
  201 |   await page.getByRole("button", { name: "Create Task Tag" }).click();
  202 | 
  203 |   await expect(page.getByText("Created @release_notes.")).toBeVisible();
  204 |   let taskTags = await readTaskTags();
  205 |   expect(taskTags.map((taskTag) => taskTag.key)).toContain("release_notes");
  206 |   expect(taskTags.find((taskTag) => taskTag.key === "release_notes")?.label).toBe("Release Notes");
  207 | 
  208 |   const createdItem = page.locator("[data-testid^='task-tag-item-']").filter({
  209 |     hasText: "Release Notes",
  210 |   });
  211 |   await createdItem.getByRole("button", { name: "Edit" }).click();
  212 |   await page.getByLabel("Task Tag label").fill("Ship Notes");
  213 |   await page.getByRole("button", { name: "Save Task Tag" }).click();
  214 | 
  215 |   await expect(page.getByText("Updated @release_notes.")).toBeVisible();
  216 |   taskTags = await readTaskTags();
  217 |   expect(taskTags.find((taskTag) => taskTag.key === "release_notes")?.label).toBe("Ship Notes");
  218 | 
  219 |   await page.getByRole("button", { name: "Move Ship Notes up" }).click();
  220 |   await expect(page.getByText("Updated Task Tag order.")).toBeVisible();
  221 |   taskTags = await readTaskTags();
  222 |   expect(taskTags.find((taskTag) => taskTag.key === "release_notes")?.order).toBe(1);
  223 | 
  224 |   const updatedItem = page.locator("[data-testid^='task-tag-item-']").filter({
  225 |     hasText: "Ship Notes",
  226 |   });
  227 |   await updatedItem.getByRole("button", { name: "Delete" }).click();
  228 | 
  229 |   await expect(page.getByText("Deleted @release_notes.")).toBeVisible();
  230 |   taskTags = await readTaskTags();
  231 |   expect(taskTags.map((taskTag) => taskTag.key)).not.toContain("release_notes");
  232 | });
  233 | 
  234 | test("new session authoring inserts a Task Tag snippet and submits the expanded prompt", async ({
  235 |   page,
  236 | }) => {
  237 |   const gateway = await stubGateway(page);
  238 |   await seedGatewayAuth(page);
  239 | 
> 240 |   await page.goto("/sessions/new", { waitUntil: "domcontentloaded" });
      |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  241 | 
  242 |   const prompt = page.getByPlaceholder("Describe the task you want the agent to handle...");
  243 |   await expect(prompt).toBeVisible();
  244 | 
  245 |   await prompt.fill("@deploy");
  246 |   await page.getByText("Deployment Validation").click();
  247 |   await expect(prompt).toHaveValue("Validate staging deploy, smoke tests, and rollback path.");
  248 | 
  249 |   await page.getByRole("button", { name: "Start session" }).click();
  250 | 
  251 |   await expect(page).toHaveURL(/\/sessions\/sess-task-tags-e2e$/);
  252 |   expect(gateway.submittedPrompt()).toBe(
  253 |     "Validate staging deploy, smoke tests, and rollback path.",
  254 |   );
  255 | });
  256 | 
```