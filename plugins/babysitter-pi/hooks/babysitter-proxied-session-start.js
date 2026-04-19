#!/usr/bin/env node
/**
 * Unified Session Start Hook for Pi
 * Routes through hooks-proxy for all hook execution.
 *
 * Fires when a Pi session begins. Ensures the babysitter SDK CLI
 * and hooks-proxy are installed, then delegates to
 * `babysitter hook:run --hook-type session-start` via hooks-proxy.
 *
 * Pi plugin protocol (programmatic):
 *   - Called from extension activate() via execSync
 *   - Receives event context as JSON via stdin
 *   - Outputs JSON to stdout
 *   - Exit 0 = success
 */

"use strict";

const { execSync } = require("child_process");
const { readFileSync, mkdirSync, appendFileSync, existsSync, writeFileSync } = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const PLUGIN_ROOT = process.env.PI_PLUGIN_ROOT || path.resolve(__dirname, "..");
const GLOBAL_ROOT = process.env.BABYSITTER_GLOBAL_STATE_DIR || path.join(os.homedir(), ".a5c");
const STATE_DIR = process.env.BABYSITTER_STATE_DIR || path.join(GLOBAL_ROOT, "state");
const LOG_DIR = process.env.BABYSITTER_LOG_DIR || path.join(GLOBAL_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "babysitter-pi-session-start-hook.log");
const SDK_MARKER = path.join(PLUGIN_ROOT, ".babysitter-install-attempted");
const PROXY_MARKER = path.join(PLUGIN_ROOT, ".hooks-proxy-install-attempted");

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SDK version & install
// ---------------------------------------------------------------------------

function getSdkVersion() {
  try {
    const versions = JSON.parse(readFileSync(path.join(PLUGIN_ROOT, "versions.json"), "utf8"));
    return versions.sdkVersion || "latest";
  } catch {
    return "latest";
  }
}

function getInstalledVersion(cmd) {
  try {
    return execSync(`${cmd} --version`, { stdio: "pipe", timeout: 10000 }).toString().trim();
  } catch {
    return null;
  }
}

function installPackage(npmPkg, version, marker) {
  if (existsSync(marker)) return;

  try {
    execSync(`npm i -g "${npmPkg}@${version}" --loglevel=error`, {
      stdio: "pipe",
      timeout: 120000,
    });
    blog(`Installed ${npmPkg} globally (${version})`);
  } catch {
    // Try user-local prefix
    try {
      const prefix = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".local");
      execSync(`npm i -g "${npmPkg}@${version}" --prefix "${prefix}" --loglevel=error`, {
        stdio: "pipe",
        timeout: 120000,
      });
      blog(`Installed ${npmPkg} to user prefix (${version})`);
    } catch {
      blog(`${npmPkg} installation failed`);
    }
  }

  try { writeFileSync(marker, version); } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Hooks-proxy resolution & install
// ---------------------------------------------------------------------------

function resolveHooksProxy() {
  // Check PATH first
  try {
    execSync("a5c-hooks-proxy --version", { stdio: "pipe", timeout: 5000 });
    return "a5c-hooks-proxy";
  } catch { /* not in PATH */ }

  // Check user-local install
  const localProxy = path.join(
    process.env.HOME || process.env.USERPROFILE || "~",
    ".local", "bin", process.platform === "win32" ? "a5c-hooks-proxy.exe" : "a5c-hooks-proxy"
  );
  if (existsSync(localProxy)) {
    return localProxy;
  }

  return null;
}

// ---------------------------------------------------------------------------
// CLI execution helpers
// ---------------------------------------------------------------------------

function runViaProxy(proxy, hookType, inputJson) {
  const handler = `babysitter hook:run --harness unified --hook-type ${hookType} --plugin-root ${PLUGIN_ROOT} --state-dir ${STATE_DIR} --json`;
  const result = execSync(`"${proxy}" invoke --adapter pi --handler "${handler}" --json`, {
    input: inputJson,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30000,
    env: { ...process.env, BABYSITTER_STATE_DIR: STATE_DIR },
  });
  return result.toString("utf8").trim();
}

function runViaNpxProxy(version, hookType, inputJson) {
  const handler = `babysitter hook:run --harness unified --hook-type ${hookType} --plugin-root ${PLUGIN_ROOT} --state-dir ${STATE_DIR} --json`;
  const result = execSync(`npx -y "@a5c-ai/hooks-proxy-cli@${version}" invoke --adapter pi --handler "${handler}" --json`, {
    input: inputJson,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60000,
    env: { ...process.env, BABYSITTER_STATE_DIR: STATE_DIR },
  });
  return result.toString("utf8").trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  blog("Unified session-start hook invoked");
  blog(`PLUGIN_ROOT=${PLUGIN_ROOT}`);

  // Generate a session ID if Pi doesn't provide one
  const sessionId = process.env.PI_SESSION_ID
    || process.env.BABYSITTER_SESSION_ID
    || crypto.randomUUID();

  // Set env var so downstream hooks can pick it up
  process.env.BABYSITTER_SESSION_ID = sessionId;

  const sdkVersion = getSdkVersion();

  // Ensure SDK is installed with version sync
  const currentSdkVersion = getInstalledVersion("babysitter");
  if (!currentSdkVersion || currentSdkVersion !== sdkVersion) {
    blog(`SDK needs install/upgrade: installed=${currentSdkVersion || "none"}, required=${sdkVersion}`);
    installPackage("@a5c-ai/babysitter-sdk", sdkVersion, SDK_MARKER);
  } else {
    blog(`SDK version OK: ${currentSdkVersion}`);
  }

  // Ensure hooks-proxy is installed with version sync
  const currentProxyVersion = getInstalledVersion("a5c-hooks-proxy");
  if (!currentProxyVersion || currentProxyVersion !== sdkVersion) {
    blog(`hooks-proxy needs install/upgrade: installed=${currentProxyVersion || "none"}, required=${sdkVersion}`);
    installPackage("@a5c-ai/hooks-proxy-cli", sdkVersion, PROXY_MARKER);
  } else {
    blog(`hooks-proxy version OK: ${currentProxyVersion}`);
  }

  // Read stdin if available
  let stdinData = "";
  try {
    stdinData = readFileSync(0, "utf8");
  } catch { /* no stdin */ }

  // Build hook input
  const hookInput = JSON.stringify({
    session_id: sessionId,
    cwd: process.cwd(),
    harness: "pi",
    plugin_root: PLUGIN_ROOT,
    ...(stdinData ? { event_data: JSON.parse(stdinData) } : {}),
  });

  blog(`Hook input: ${hookInput}`);

  // Route through hooks-proxy (install or npx fallback)
  const proxy = resolveHooksProxy();
  let result;

  try {
    if (proxy) {
      blog(`Using hooks-proxy: ${proxy}`);
      result = runViaProxy(proxy, "session-start", hookInput);
    } else {
      blog("hooks-proxy not found after install, using npx fallback");
      result = runViaNpxProxy(sdkVersion, "session-start", hookInput);
    }
  } catch (err) {
    blog(`Hook execution failed: ${err.message}`);
    result = "{}";
  }

  blog(`Hook result: ${result}`);

  // Output result
  try {
    const parsed = JSON.parse(result);
    process.stdout.write(JSON.stringify(parsed) + "\n");
  } catch {
    process.stdout.write("{}\n");
  }
}

main();
