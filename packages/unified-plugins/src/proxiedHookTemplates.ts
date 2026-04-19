// Proxied hook script templates for programmatic (non-shell-hook) targets
// These Node.js scripts bridge programmatic extensions to the hooks-proxy CLI

import type { TargetProfile } from './types.js';
import { slugify } from './utils.js';

function getHookTitle(canonicalHook: string): string {
  return canonicalHook
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^./, (str) => str.toUpperCase());
}

export function generateProxiedHookScript(
  canonicalHook: string,
  nativeHook: string,
  targetProfile: TargetProfile
): string {
  const hookType = slugify(canonicalHook);
  const hookTitle = getHookTitle(canonicalHook);
  const adapterName = targetProfile.adapterName;
  const displayName = targetProfile.displayName;
  const pluginRootEnvVar = targetProfile.pluginRootEnvVarForExtension || 'PLUGIN_ROOT';

  return `#!/usr/bin/env node
/**
 * Unified ${hookTitle} Hook for ${displayName}
 * Routes through hooks-proxy for all hook execution.
 *
 * ${displayName} plugin protocol (programmatic):
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

const PLUGIN_ROOT = process.env.${pluginRootEnvVar} || path.resolve(__dirname, "..");
const GLOBAL_ROOT = process.env.BABYSITTER_GLOBAL_STATE_DIR || path.join(os.homedir(), ".a5c");
const STATE_DIR = process.env.BABYSITTER_STATE_DIR || path.join(GLOBAL_ROOT, "state");
const LOG_DIR = process.env.BABYSITTER_LOG_DIR || path.join(GLOBAL_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "babysitter-${adapterName}-${hookType}-hook.log");
const SDK_MARKER = path.join(PLUGIN_ROOT, ".babysitter-install-attempted");
const PROXY_MARKER = path.join(PLUGIN_ROOT, ".hooks-proxy-install-attempted");

function ensureDir(dir) {
  try { mkdirSync(dir, { recursive: true }); } catch { /* best-effort */ }
}

function blog(msg) {
  ensureDir(LOG_DIR);
  const ts = new Date().toISOString();
  try {
    appendFileSync(LOG_FILE, "[INFO] " + ts + " " + msg + "\\n");
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

function getInstalledVersion(cmd) {
  try {
    return execSync(cmd + " --version", { stdio: "pipe", timeout: 10000 }).toString().trim();
  } catch {
    return null;
  }
}

function installPackage(npmPkg, version, marker) {
  if (existsSync(marker)) return;
  try {
    execSync('npm i -g "' + npmPkg + "@" + version + '" --loglevel=error', {
      stdio: "pipe",
      timeout: 120000,
    });
    blog("Installed " + npmPkg + " globally (" + version + ")");
  } catch {
    try {
      const prefix = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".local");
      execSync('npm i -g "' + npmPkg + "@" + version + '" --prefix "' + prefix + '" --loglevel=error', {
        stdio: "pipe",
        timeout: 120000,
      });
      blog("Installed " + npmPkg + " to user prefix (" + version + ")");
    } catch {
      blog(npmPkg + " installation failed");
    }
  }
  try { writeFileSync(marker, version); } catch { /* best-effort */ }
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
  if (existsSync(localProxy)) return localProxy;
  return null;
}

function runViaProxy(proxy, hookType, inputJson) {
  const handler = 'babysitter hook:run --harness unified --hook-type ' + hookType + ' --state-dir ' + STATE_DIR + ' --json';
  const result = execSync('"' + proxy + '" invoke --adapter ${adapterName} --handler "' + handler + '" --json', {
    input: inputJson,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30000,
    env: Object.assign({}, process.env, { BABYSITTER_STATE_DIR: STATE_DIR }),
  });
  return result.toString("utf8").trim();
}

function runViaNpxProxy(version, hookType, inputJson) {
  const handler = 'babysitter hook:run --harness unified --hook-type ' + hookType + ' --state-dir ' + STATE_DIR + ' --json';
  const result = execSync('npx -y "@a5c-ai/hooks-proxy-cli@' + version + '" invoke --adapter ${adapterName} --handler "' + handler + '" --json', {
    input: inputJson,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60000,
    env: Object.assign({}, process.env, { BABYSITTER_STATE_DIR: STATE_DIR }),
  });
  return result.toString("utf8").trim();
}

function main() {
  blog("Unified ${hookType} hook invoked");
  blog("PLUGIN_ROOT=" + PLUGIN_ROOT);

  const sessionId = process.env.AGENT_SESSION_ID || crypto.randomUUID();
  process.env.AGENT_SESSION_ID = sessionId;

  const sdkVersion = getSdkVersion();

  var currentSdkVersion = getInstalledVersion("babysitter");
  if (!currentSdkVersion || currentSdkVersion !== sdkVersion) {
    installPackage("@a5c-ai/babysitter-sdk", sdkVersion, SDK_MARKER);
  }

  var currentProxyVersion = getInstalledVersion("a5c-hooks-proxy");
  if (!currentProxyVersion || currentProxyVersion !== sdkVersion) {
    installPackage("@a5c-ai/hooks-proxy-cli", sdkVersion, PROXY_MARKER);
  }

  var stdinData = "";
  try { stdinData = readFileSync(0, "utf8"); } catch { /* no stdin */ }

  var hookInput = JSON.stringify({
    session_id: sessionId,
    cwd: process.cwd(),
    harness: "${adapterName}",
    plugin_root: PLUGIN_ROOT,
    ...(stdinData ? { event_data: JSON.parse(stdinData) } : {}),
  });

  var proxy = resolveHooksProxy();
  var result;

  try {
    if (proxy) {
      result = runViaProxy(proxy, "${hookType}", hookInput);
    } else {
      result = runViaNpxProxy(sdkVersion, "${hookType}", hookInput);
    }
  } catch (err) {
    blog("Hook execution failed: " + err.message);
    result = "{}";
  }

  try {
    var parsed = JSON.parse(result);
    process.stdout.write(JSON.stringify(parsed) + "\\n");
  } catch {
    process.stdout.write("{}\\n");
  }
}

main();
`;
}

export function generateProxiedHooksJson(
  targetProfile: TargetProfile,
  hooks: Map<string, string>,
  pluginName = 'plugin'
): string {
  const entries: Record<string, { script: string; hookType: string }> = {};

  for (const [canonical, native] of hooks) {
    const hookType = slugify(canonical);
    entries[native] = {
      script: `hooks/${pluginName}-proxied-${hookType}.js`,
      hookType,
    };
  }

  return JSON.stringify(
    {
      _comment: `Proxied hooks for ${targetProfile.displayName} — routed through hooks-proxy`,
      adapter: targetProfile.adapterName,
      hooks: entries,
    },
    null,
    2
  );
}

export function generateProgrammaticExtension(
  manifest: { name: string; skills?: Array<{ name: string }>; commands?: string[] | string; hooks?: Record<string, string | boolean | null> },
  targetProfile: TargetProfile,
  commandPaths?: string[]
): string {
  const piPackage =
    targetProfile.name === 'pi'
      ? '@mariozechner/pi-coding-agent'
      : targetProfile.name === 'oh-my-pi'
        ? '@oh-my-pi/pi-coding-agent'
        : null;

  const pluginRootEnvVar = targetProfile.pluginRootEnvVarForExtension || 'PLUGIN_ROOT';

  const commandNameSet = new Set<string>();

  // The primary skill is forwarded separately via the main activate handler,
  // so exclude it and its common alias from the COMMANDS list
  const primaryName = manifest.name;
  const excludeNames = new Set([primaryName]);

  if (manifest.skills && Array.isArray(manifest.skills)) {
    for (const skill of manifest.skills) {
      if (!excludeNames.has(skill.name)) {
        commandNameSet.add(skill.name);
      }
    }
  }

  if (commandPaths) {
    for (const cmdPath of commandPaths) {
      const name = cmdPath.replace(/^.*\//, '').replace(/\.md$/, '');
      if (!excludeNames.has(name)) {
        commandNameSet.add(name);
      }
    }
  }

  const commandNames = Array.from(commandNameSet).sort();

  // Find the session-start hook script name for the activate() call
  let sessionStartCall = '';
  if (manifest.hooks) {
    const ssHandler = manifest.hooks.SessionStart;
    if (typeof ssHandler === 'string' && ssHandler !== 'proxy') {
      const jsBridge = ssHandler.replace(/^hooks\//, '').replace(/\.sh$/, '.js');
      sessionStartCall = `\n  runProxiedHook("${jsBridge}", {\n    event: "session_start",\n    cwd: process.cwd(),\n  });`;
    }
  }

  if (!piPackage) {
    return `// Programmatic extension for ${targetProfile.displayName}
// Generated by unified-plugins compiler

import { execSync } from "child_process";
import * as path from "path";

const PLUGIN_ROOT = path.resolve(__dirname, "..");

${generateRunProxiedHookFunction(pluginRootEnvVar)}

const COMMANDS = [
  ${commandNames.map((n) => `"${n}"`).join(', ')}
] as const;

export function activate(api: unknown): void {${sessionStartCall}
  // Register commands via target-specific API
}
`;
  }

  return `import type { ExtensionAPI } from "${piPackage}";
import { execSync } from "child_process";
import * as path from "path";

const PLUGIN_ROOT = path.resolve(__dirname, "..");

const COMMANDS = [
  ${commandNames.map((n) => `"${n}"`).join(', ')}
] as const;

function toSkillPrompt(name: string, args: string): string {
  return \`/skill:\${name}\${args ? \` \${args}\` : ""}\`;
}

${generateRunProxiedHookFunction(pluginRootEnvVar)}

export default function activate(pi: ExtensionAPI): void {${sessionStartCall}

  const forwardPrimary = async (args: unknown) => {
    pi.sendUserMessage(toSkillPrompt("${primaryName}", String(args ?? "").trim()));
  };

  pi.registerCommand("${primaryName}", {
    description: "Load the ${primaryName} skill",
    handler: forwardPrimary,
  });

  for (const name of COMMANDS) {
    const forward = async (args: unknown) => {
      pi.sendUserMessage(toSkillPrompt(name, String(args ?? "").trim()));
    };

    pi.registerCommand(name, {
      description: \`Open the \${name} skill\`,
      handler: forward,
    });

    pi.registerCommand(\`${primaryName}:\${name}\`, {
      description: \`Alias for /\${name}\`,
      handler: forward,
    });
  }
}
`;
}

function generateRunProxiedHookFunction(pluginRootEnvVar: string): string {
  return `function runProxiedHook(
  scriptName: string,
  inputData?: Record<string, unknown>
): Record<string, unknown> {
  const scriptPath = path.join(PLUGIN_ROOT, "hooks", scriptName);
  try {
    const result = execSync(\`node "\${scriptPath}"\`, {
      input: inputData ? JSON.stringify(inputData) : undefined,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
      env: {
        ...process.env,
        ${pluginRootEnvVar}: PLUGIN_ROOT,
      },
    });
    return JSON.parse(result.toString("utf8").trim());
  } catch {
    return {};
  }
}`;
}
