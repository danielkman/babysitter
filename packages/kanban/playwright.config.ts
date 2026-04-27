import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * Playwright E2E configuration for the kanban dashboard.
 *
 * The webServer is started with WATCH_DIR pointing to the fixture runs
 * directory so that the kanban dashboard displays deterministic test data.
 *
 * @see https://playwright.dev/docs/test-configuration
 */

const fixtureRunsDir = path.resolve(__dirname, "e2e/fixtures/runs");
const nextBin = path.resolve(__dirname, "../../node_modules/next/dist/bin/next");
const taskTagsBacklogFile = path.resolve(__dirname, "e2e/fixtures/kanban-backlog.task-tags.json");
const repoRoot = path.resolve(__dirname, "../..");

// Use a dedicated test port to avoid collisions with a running dev server.
// The dev server on port 4800 uses real data; the E2E server on 4173 uses fixtures.
const testPort = parseInt(process.env.KANBAN_PORT || "4173", 10);

export default defineConfig({
  testDir: "e2e/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 1 : undefined,

  timeout: 120_000,

  reporter: [["html", { open: "never" }]],

  use: {
    baseURL: `http://localhost:${testPort}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `cd ${repoRoot} && npm run build --workspace=@a5c-ai/agent-catalog && npm run build --workspace=@a5c-ai/agent-mux-observability && npm run build --workspace=@a5c-ai/agent-mux-core && npm run build --workspace=@a5c-ai/agent-mux-ui && cd ${__dirname} && node ${nextBin} dev --webpack --port ${testPort}`,
    port: testPort,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      WATCH_DIR: fixtureRunsDir,
      KANBAN_REGISTRY: path.resolve(__dirname, "e2e/fixtures/.kanban-test.json"),
      KANBAN_BACKLOG_FILE: taskTagsBacklogFile,
      PORT: String(testPort),
      KANBAN_STALE_THRESHOLD_MS: "999999999999",
    },
  },
});
