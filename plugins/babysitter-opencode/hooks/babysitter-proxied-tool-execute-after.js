#!/usr/bin/env node
/**
 * Unified Tool Execute After Hook for OpenCode
 * Mirrors tool-execute-after.js but routes through hooks-proxy when available,
 * falling back to direct SDK.
 * NOT YET ACTIVE — parallel to existing hook scripts
 *
 * Fires after a tool execution in OpenCode. Delegates to
 * `babysitter hook:run --hook-type post-tool-use` for post-tool-use awareness.
 *
 * This hook can be used to:
 * - Log tool execution results for babysitter run observability
 * - Trigger babysitter effects based on tool outputs
 * - Update session state after tool executions
 *
 * OpenCode plugin protocol:
 *   - Receives tool result context as JSON via stdin
 *   - Outputs JSON to stdout
 *   - Exit 0 = success
 */

"use strict";

const { execSync } = require("child_process");
const { readFileSync, mkdirSync, appendFileSync, existsSync } = require("fs");
const os = require("os");
const path = require("path");

const PLUGIN_ROOT = process.env.OPENCODE_PLUGIN_ROOT || path.resolve(__dirname, "..");
const GLOBAL_ROOT = process.env.BABYSITTER_GLOBAL_STATE_DIR || path.join(os.homedir(), ".a5c");
const STATE_DIR = process.env.BABYSITTER_STATE_DIR || path.join(GLOBAL_ROOT, "state");
const LOG_DIR = process.env.BABYSITTER_LOG_DIR || path.join(GLOBAL_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "babysitter-tool-after-hook.log");

function ensureDir(dir) {
  try { mkdirSync(dir, { recursive: true }); } catch { /* best-effort */ }
}

function blog(msg) {
  ensureDir(LOG_DIR);
  const ts = new Date().toISOString();
  try {
    appendFileSync(LOG_FILE, `[INFO] ${ts} ${msg}\n`);
  } catch { /* best-effort */ }
}

function getSdkVersion() {
  try {
    const versions = JSON.parse(readFileSync(path.join(PLUGIN_ROOT, "versions.json"), "utf8"));
    return versions.sdkVersion || "latest";
  } catch {
    return "latest";
  }
}

function resolveHooksProxy() {
  try {
    execSync("a5c-hooks-proxy --version", { stdio: "pipe", timeout: 5000 });
    return "a5c-hooks-proxy";
  } catch { /* not in PATH */ }

  const localProxy = path.join(
    process.env.HOME || process.env.USERPROFILE || "~",
    ".local", "bin", process.platform === "win32" ? "a5c-hooks-proxy.exe" : "a5c-hooks-proxy"
  );
  if (existsSync(localProxy)) {
    return localProxy;
  }

  return null;
}

function main() {
  const sessionId = process.env.BABYSITTER_SESSION_ID
    || process.env.OPENCODE_SESSION_ID
    || "";

  if (!sessionId) {
    process.stdout.write("{}\n");
    return;
  }

  // Read stdin for tool result context
  let inputData = "";
  try {
    inputData = require("fs").readFileSync(0, "utf8");
  } catch {
    // No stdin available
  }

  blog(`Unified tool-execute-after: session=${sessionId}`);

  const hookInput = JSON.stringify({
    session_id: sessionId,
    cwd: process.cwd(),
    harness: "opencode",
    plugin_root: PLUGIN_ROOT,
    tool_result: inputData ? JSON.parse(inputData) : {},
  });

  const sdkVersion = getSdkVersion();
  const proxy = resolveHooksProxy();

  if (proxy) {
    blog(`Using hooks-proxy: ${proxy}`);
    const handler = `babysitter hook:run --harness unified --hook-type post-tool-use --plugin-root ${PLUGIN_ROOT} --state-dir ${STATE_DIR} --json`;
    try {
      const result = execSync(`"${proxy}" invoke --adapter opencode --handler "${handler}" --json`, {
        input: hookInput,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000,
        env: { ...process.env, BABYSITTER_STATE_DIR: STATE_DIR },
      });
      const output = result.toString("utf8").trim();
      blog(`Hook result: ${output}`);
      process.stdout.write((output || "{}") + "\n");
      return;
    } catch (err) {
      blog(`hooks-proxy failed: ${err.message}, falling back to direct SDK`);
    }
  }

  // Direct SDK fallback
  const args = [
    "hook:run",
    "--hook-type", "post-tool-use",
    "--harness", "opencode",
    "--plugin-root", PLUGIN_ROOT,
    "--state-dir", STATE_DIR,
    "--json",
  ];

  try {
    const result = execSync(`babysitter ${args.join(" ")}`, {
      input: hookInput,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000,
      env: { ...process.env, BABYSITTER_STATE_DIR: STATE_DIR },
    });
    const output = result.toString("utf8").trim();
    blog(`Hook result: ${output}`);
    process.stdout.write((output || "{}") + "\n");
  } catch {
    blog("Post-tool-use hook failed -- non-blocking");
    process.stdout.write("{}\n");
  }
}

main();
