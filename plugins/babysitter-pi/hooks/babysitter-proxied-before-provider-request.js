#!/usr/bin/env node
/**
 * Unified Before Provider Request Hook for Pi
 * Routes through hooks-proxy for all hook execution.
 *
 * Fires before Pi sends a request to the LLM provider. Delegates to
 * `babysitter hook:run --hook-type pre-tool-use` via hooks-proxy
 * (mapped as a model-level interception point).
 *
 * This hook can be used to:
 * - Log provider requests for observability
 * - Inject babysitter metadata into request context
 * - Track token usage across orchestration iterations
 *
 * Pi plugin protocol (programmatic):
 *   - Called from extension via execSync
 *   - Receives provider request context as JSON via stdin
 *   - Outputs JSON to stdout
 *   - Exit 0 = success
 */

"use strict";

const { execSync } = require("child_process");
const { readFileSync, mkdirSync, appendFileSync, existsSync, writeFileSync } = require("fs");
const os = require("os");
const path = require("path");

const PLUGIN_ROOT = process.env.PI_PLUGIN_ROOT || path.resolve(__dirname, "..");
const GLOBAL_ROOT = process.env.BABYSITTER_GLOBAL_STATE_DIR || path.join(os.homedir(), ".a5c");
const STATE_DIR = process.env.BABYSITTER_STATE_DIR || path.join(GLOBAL_ROOT, "state");
const LOG_DIR = process.env.BABYSITTER_LOG_DIR || path.join(GLOBAL_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "babysitter-pi-before-provider-hook.log");
const PROXY_MARKER = path.join(PLUGIN_ROOT, ".hooks-proxy-install-attempted");

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

function installHooksProxy(version) {
  if (existsSync(PROXY_MARKER)) return;

  try {
    execSync(`npm i -g "@a5c-ai/hooks-proxy-cli@${version}" --loglevel=error`, {
      stdio: "pipe",
      timeout: 120000,
    });
    blog(`Installed hooks-proxy globally (${version})`);
  } catch {
    try {
      const prefix = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".local");
      execSync(`npm i -g "@a5c-ai/hooks-proxy-cli@${version}" --prefix "${prefix}" --loglevel=error`, {
        stdio: "pipe",
        timeout: 120000,
      });
      blog(`Installed hooks-proxy to user prefix (${version})`);
    } catch {
      blog("hooks-proxy installation failed");
    }
  }

  try { writeFileSync(PROXY_MARKER, version); } catch { /* best-effort */ }
}

function main() {
  const sessionId = process.env.BABYSITTER_SESSION_ID
    || process.env.PI_SESSION_ID
    || "";

  if (!sessionId) {
    process.stdout.write("{}\n");
    return;
  }

  // Read stdin for provider request context
  let inputData = "";
  try {
    inputData = readFileSync(0, "utf8");
  } catch {
    // No stdin available
  }

  blog(`Unified before-provider-request: session=${sessionId}`);

  const hookInput = JSON.stringify({
    session_id: sessionId,
    cwd: process.cwd(),
    harness: "pi",
    plugin_root: PLUGIN_ROOT,
    provider_request: inputData ? JSON.parse(inputData) : {},
  });

  const sdkVersion = getSdkVersion();

  // Ensure hooks-proxy is installed
  let proxy = resolveHooksProxy();
  if (!proxy) {
    installHooksProxy(sdkVersion);
    proxy = resolveHooksProxy();
  }

  const handler = `babysitter hook:run --harness unified --hook-type pre-tool-use --plugin-root ${PLUGIN_ROOT} --state-dir ${STATE_DIR} --json`;

  try {
    let result;
    if (proxy) {
      blog(`Using hooks-proxy: ${proxy}`);
      result = execSync(`"${proxy}" invoke --adapter pi --handler "${handler}" --json`, {
        input: hookInput,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000,
        env: { ...process.env, BABYSITTER_STATE_DIR: STATE_DIR },
      });
    } else {
      blog("hooks-proxy not found after install, using npx fallback");
      result = execSync(`npx -y "@a5c-ai/hooks-proxy-cli@${sdkVersion}" invoke --adapter pi --handler "${handler}" --json`, {
        input: hookInput,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30000,
        env: { ...process.env, BABYSITTER_STATE_DIR: STATE_DIR },
      });
    }
    const output = result.toString("utf8").trim();
    blog(`Hook result: ${output}`);
    process.stdout.write((output || "{}") + "\n");
  } catch (err) {
    blog(`Before-provider-request hook failed: ${err.message} -- non-blocking`);
    process.stdout.write("{}\n");
  }
}

main();
