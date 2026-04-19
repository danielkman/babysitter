#!/usr/bin/env node
/**
 * Unified Shell Environment Hook for OpenCode
 * Routes through hooks-proxy when available for consistency,
 * but primarily performs direct env var injection.
 *
 * Fires when OpenCode initializes a shell environment. Injects babysitter
 * environment variables (AGENT_SESSION_ID, BABYSITTER_STATE_DIR, etc.)
 * so that subprocesses and other hooks can discover the active session.
 *
 * This is critical for OpenCode because it does NOT natively inject
 * distinctive env vars into plugins -- the babysitter plugin must self-inject
 * them via this hook.
 *
 * OpenCode plugin protocol:
 *   - Outputs env var assignments as JSON: { "env": { "KEY": "VALUE" } }
 *   - Exit 0 = success
 */

"use strict";

const { readFileSync, mkdirSync, appendFileSync, existsSync, writeFileSync } = require("fs");
const { execSync } = require("child_process");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const PLUGIN_ROOT = process.env.OPENCODE_PLUGIN_ROOT || path.resolve(__dirname, "..");
const GLOBAL_ROOT = process.env.BABYSITTER_GLOBAL_STATE_DIR || path.join(os.homedir(), ".a5c");
const STATE_DIR = process.env.BABYSITTER_STATE_DIR || path.join(GLOBAL_ROOT, "state");
const RUNS_DIR = process.env.BABYSITTER_RUNS_DIR || path.join(GLOBAL_ROOT, "runs");
const LOG_DIR = process.env.BABYSITTER_LOG_DIR || path.join(GLOBAL_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "babysitter-shell-env-hook.log");
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
  blog("Unified shell-env hook invoked");

  // Resolve or generate session ID
  const sessionId = process.env.AGENT_SESSION_ID
    || process.env.OPENCODE_SESSION_ID
    || crypto.randomUUID();

  const sdkVersion = getSdkVersion();

  // Ensure hooks-proxy is installed (for other hooks to use)
  const proxy = resolveHooksProxy();
  if (!proxy) {
    installHooksProxy(sdkVersion);
  }

  // Build env vars to inject
  const env = {
    AGENT_SESSION_ID: sessionId,
    OPENCODE_SESSION_ID: sessionId,
    BABYSITTER_STATE_DIR: STATE_DIR,
    BABYSITTER_RUNS_DIR: RUNS_DIR,
    OPENCODE_PLUGIN_ROOT: PLUGIN_ROOT,
  };

  // Add SDK version for downstream hooks
  if (sdkVersion && sdkVersion !== "latest") {
    env.BABYSITTER_SDK_VERSION = sdkVersion;
  }

  // Add global state dir if defined
  const globalStateDir = process.env.BABYSITTER_GLOBAL_STATE_DIR;
  if (globalStateDir) {
    env.BABYSITTER_GLOBAL_STATE_DIR = globalStateDir;
  }

  // Note: shell-env is purely env injection — hooks-proxy routing is logged
  // but the output is always the same env vars object. The proxy can
  // potentially enrich env vars in the future.
  const resolvedProxy = resolveHooksProxy();
  if (resolvedProxy) {
    blog(`hooks-proxy available: ${resolvedProxy} (env injection is direct)`);
  }

  blog(`Injecting env: ${JSON.stringify(env)}`);

  process.stdout.write(JSON.stringify({ env }) + "\n");
}

main();
