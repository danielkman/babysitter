/**
 * OpenCode harness adapter.
 */

import * as path from "node:path";
import * as os from "node:os";
import { existsSync } from "node:fs";
import { HarnessCapability as Cap } from "../types";
import type {
  HarnessInstallOptions,
  HarnessInstallResult,
  SessionBindOptions,
  SessionBindResult,
} from "../types";
import type { PromptContext } from "../../prompts/types";
import { normalizeSessionStateDir } from "../../config";
import { BaseHarnessAdapter } from "../BaseAdapter";
import { createOpenCodeContext } from "../hooks/promptContexts";
import { bindSession } from "../hooks/sessionBinding";

// ---------------------------------------------------------------------------
// Utilities (previously in opencodeHooks.ts)
// ---------------------------------------------------------------------------

export function resolveOpenCodeStateDir(args: {
  stateDir?: string;
  pluginRoot?: string;
}): string {
  return normalizeSessionStateDir(args.stateDir ?? process.env.BABYSITTER_STATE_DIR);
}

export function resolveOpenCodeSessionId(parsed: {
  sessionId?: string;
}): string | undefined {
  if (parsed.sessionId) {
    return parsed.sessionId;
  }
  if (process.env.AGENT_SESSION_ID) {
    return process.env.AGENT_SESSION_ID;
  }
  if (process.env.OPENCODE_SESSION_ID) {
    return process.env.OPENCODE_SESSION_ID;
  }
  return undefined;
}

function getAccomplishDataDirs(): string[] {
  const dirs: string[] = [];
  const configDir = process.env.OPENCODE_CONFIG_DIR;
  if (configDir) {
    const parent = path.dirname(configDir);
    if (parent && parent !== configDir) {
      dirs.push(parent);
    }
  }

  const home = os.homedir();
  const platform = process.platform;

  if (platform === "darwin") {
    dirs.push(path.join(home, "Library", "Application Support", "Accomplish"));
  } else if (platform === "win32") {
    if (process.env.APPDATA) {
      dirs.push(path.join(process.env.APPDATA, "Accomplish"));
    }
    if (process.env.LOCALAPPDATA) {
      dirs.push(path.join(process.env.LOCALAPPDATA, "Accomplish"));
    }
  } else {
    dirs.push(path.join(home, ".config", "Accomplish"));
  }

  return dirs;
}

// ---------------------------------------------------------------------------
// Adapter class
// ---------------------------------------------------------------------------

class OpenCodeAdapter extends BaseHarnessAdapter {
  constructor() {
    super({
      name: "opencode",
      displayName: "OpenCode",
      activationEnvVars: ["AGENT_SESSION_ID", "OPENCODE_CONFIG", "ACCOMPLISH_TASK_ID"],
      capabilities: [Cap.HeadlessPrompt],
      loopControlTerm: "in-turn",
      autoResolvesSession: false,
      pluginRootEnvVars: ["OPENCODE_PLUGIN_ROOT"],
      sessionIdEnvVars: ["AGENT_SESSION_ID"],
      promptCapabilities: ["task-tool", "breakpoint-routing"],
      pluginRootVar: "",
      hookDriven: false,
      interactiveToolName: "",
      sessionEnvVars: "PID-scoped session marker (authoritative); shell.env-injected session ID and AGENT_SESSION_ID are fallbacks",
      hasIntentFidelityChecks: false,
      hasNonNegotiables: false,
    });
  }

  override getMissingSessionIdHint(): string {
    return (
      "OpenCode does not auto-inject session IDs. Use --session-id explicitly, " +
      "or ensure the babysitter plugin's shell.env hook is configured to set " +
      "AGENT_SESSION_ID."
    );
  }

  override supportsHookType(hookType: string): boolean {
    const supported = ["session-start", "pre-tool-use", "post-tool-use"];
    return supported.includes(hookType);
  }

  override getUnsupportedHookMessage(hookType: string): string {
    if (hookType === "stop") {
      return (
        "OpenCode does not support a blocking stop hook. " +
        "The session.idle event is fire-and-forget. " +
        "Use in-turn orchestration or the SDK loop driver instead."
      );
    }
    return `Hook type "${hookType}" is not supported by the OpenCode adapter.`;
  }

  override resolveSessionId(parsed: { sessionId?: string }): string | undefined {
    return resolveOpenCodeSessionId(parsed);
  }

  override resolveStateDir(args: { stateDir?: string; pluginRoot?: string }): string | undefined {
    return resolveOpenCodeStateDir(args);
  }

  override resolvePluginRoot(args: { pluginRoot?: string }): string | undefined {
    if (args.pluginRoot) return path.resolve(args.pluginRoot);
    if (process.env.OPENCODE_PLUGIN_ROOT) {
      return path.resolve(process.env.OPENCODE_PLUGIN_ROOT);
    }
    const configDir = process.env.OPENCODE_CONFIG_DIR;
    if (configDir) {
      const candidate = path.resolve(configDir, "plugins", "babysitter");
      if (existsSync(candidate)) return candidate;
    }
    for (const dataDir of getAccomplishDataDirs()) {
      const candidate = path.join(dataDir, "opencode", "plugins", "babysitter");
      if (existsSync(candidate)) return candidate;
    }
    return undefined;
  }

  override async bindSession(opts: SessionBindOptions): Promise<SessionBindResult> {
    const stateDir = resolveOpenCodeStateDir({
      stateDir: opts.stateDir,
      pluginRoot: opts.pluginRoot,
    });
    const accomplishTaskId = process.env.ACCOMPLISH_TASK_ID;
    return bindSession({
      harness: "opencode",
      stateDir: stateDir ?? "",
      opts,
      extraState: accomplishTaskId ? { metadata: { accomplishTaskId } } : undefined,
    });
  }

  installPlugin(_options: HarnessInstallOptions): Promise<HarnessInstallResult> {
    return Promise.resolve({
      harness: "opencode",
      summary: "OpenCode plugin installation is not yet automated. " +
        "Place babysitter plugin files in .opencode/plugins/babysitter/ manually.",
    });
  }

  override getPromptContext(opts?: { interactive?: boolean | undefined }): PromptContext {
    return createOpenCodeContext(opts);
  }

  // handleStopHook and handleSessionStartHook use BaseAdapter defaults
}

export function createOpenCodeAdapter(): OpenCodeAdapter {
  return new OpenCodeAdapter();
}
