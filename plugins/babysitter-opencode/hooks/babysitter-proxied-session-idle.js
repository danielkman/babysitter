#!/usr/bin/env node
/**
 * Unified Session Idle Hook for OpenCode
 * Routes through hooks-proxy for all hook execution.
 *
 * Fires when the OpenCode agent goes idle. Checks if the current babysitter
 * run has pending effects that need attention. Since OpenCode does NOT have a
 * blocking stop hook, this is fire-and-forget -- it outputs context about
 * pending effects so the agent can decide whether to continue iterating.
 *
 * Delegates to `babysitter hook:run --hook-type stop` via hooks-proxy.
 *
 * OpenCode plugin protocol:
 *   - Receives event context as JSON via stdin
 *   - Outputs JSON to stdout
 *   - Exit 0 = success
 */

"use strict";

const { execSync } = require("child_process");
const { readFileSync, mkdirSync, appendFileSync, existsSync, writeFileSync } = require("fs");
const os = require("os");
const path = require("path");

const PLUGIN_ROOT = process.env.OPENCODE_PLUGIN_ROOT || path.resolve(__dirname, "..");
const GLOBAL_ROOT = process.env.BABYSITTER_GLOBAL_STATE_DIR || path.join(os.homedir(), ".a5c");
const STATE_DIR = process.env.BABYSITTER_STATE_DIR || path.join(GLOBAL_ROOT, "state");
const LOG_DIR = process.env.BABYSITTER_LOG_DIR || path.join(GLOBAL_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "babysitter-session-idle-hook.log");
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

function runViaProxy(proxy, hookType, inputJson) {
  const handler = `babysitter hook:run --harness unified --hook-type ${hookType} --plugin-root ${PLUGIN_ROOT} --state-dir ${STATE_DIR} --json`;
  const result = execSync(`"${proxy}" invoke --adapter opencode --handler "${handler}" --json`, {
    input: inputJson,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30000,
    env: { ...process.env, BABYSITTER_STATE_DIR: STATE_DIR },
  });
  return result.toString("utf8").trim();
}

function runViaNpxProxy(version, hookType, inputJson) {
  const handler = `babysitter hook:run --harness unified --hook-type ${hookType} --plugin-root ${PLUGIN_ROOT} --state-dir ${STATE_DIR} --json`;
  const result = execSync(`npx -y "@a5c-ai/hooks-proxy-cli@${version}" invoke --adapter opencode --handler "${handler}" --json`, {
    input: inputJson,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60000,
    env: { ...process.env, BABYSITTER_STATE_DIR: STATE_DIR },
  });
  return result.toString("utf8").trim();
}

function main() {
  blog("Unified session-idle hook invoked");

  const sessionId = process.env.BABYSITTER_SESSION_ID
    || process.env.OPENCODE_SESSION_ID
    || "";

  if (!sessionId) {
    blog("No session ID -- nothing to check");
    process.stdout.write("{}\n");
    return;
  }

  const sdkVersion = getSdkVersion();

  // Ensure hooks-proxy is installed
  let proxy = resolveHooksProxy();
  if (!proxy) {
    installHooksProxy(sdkVersion);
    proxy = resolveHooksProxy();
  }

  const hookInput = JSON.stringify({
    session_id: sessionId,
    cwd: process.cwd(),
    harness: "opencode",
    plugin_root: PLUGIN_ROOT,
  });

  blog(`Checking run status for session ${sessionId}`);

  let result;
  try {
    if (proxy) {
      blog(`Using hooks-proxy: ${proxy}`);
      result = runViaProxy(proxy, "stop", hookInput);
    } else {
      blog("hooks-proxy not found after install, using npx fallback");
      result = runViaNpxProxy(sdkVersion, "stop", hookInput);
    }
  } catch (err) {
    blog(`Hook execution failed: ${err.message}`);
    result = "{}";
  }

  blog(`Hook result: ${result}`);

  try {
    const parsed = JSON.parse(result);
    process.stdout.write(JSON.stringify(parsed) + "\n");
  } catch {
    process.stdout.write("{}\n");
  }
}

main();
