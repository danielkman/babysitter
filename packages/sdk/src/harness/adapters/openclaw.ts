/**
 * OpenClaw harness adapter.
 */

import { HarnessCapability as Cap } from "../types";
import type {
  HookHandlerArgs,
  HarnessInstallOptions,
  HarnessInstallResult,
  SessionBindOptions,
  SessionBindResult,
} from "../types";
import type { PromptContext } from "../../prompts/types";
import { BaseHarnessAdapter } from "../BaseAdapter";
import { normalizeSessionStateDir } from "../../config";
import { checkCliAvailable } from "../discovery";
import { installCliViaNpm } from "../installSupport";
import { createHookLogger, initializeSessionState } from "../hooks/utils";
import { bindSession } from "../hooks/sessionBinding";
import { createOpenClawContext } from "../openclaw/promptContext";

class OpenClawAdapter extends BaseHarnessAdapter {
  constructor() {
    super({
      name: "openclaw",
      displayName: "OpenClaw",
      activationEnvVars: ["OPENCLAW_SHELL", "OPENCLAW_HOME"],
      capabilities: [Cap.SessionBinding, Cap.Mcp, Cap.HeadlessPrompt],
      loopControlTerm: "agent_end",
      autoResolvesSession: true,
      pluginRootEnvVars: [],
      sessionIdEnvVars: ["AGENT_SESSION_ID", "OPENCLAW_SHELL"],
      promptCapabilities: ["session-binding", "mcp", "headless-prompt", "task-tool", "breakpoint-routing"],
      pluginRootVar: "",
      hookDriven: false,
      interactiveToolName: "AskUserQuestion tool",
      sessionEnvVars: "PID-scoped session marker (authoritative); OPENCLAW_SHELL gateway injection and AGENT_SESSION_ID are fallbacks",
      hasIntentFidelityChecks: false,
      hasNonNegotiables: false,
    });
  }

  override getMissingSessionIdHint(): string {
    return (
      "Session ID is provided by the OpenClaw gateway. " +
      "Ensure you're running inside an OpenClaw agent session."
    );
  }

  override supportsHookType(hookType: string): boolean {
    return hookType === "session-start";
  }

  override getUnsupportedHookMessage(hookType: string): string {
    if (hookType === "stop") {
      return (
        "OpenClaw does not support a blocking stop hook. " +
        "The daemon manages agent lifecycle via agent_end signals. " +
        "Use the OpenClaw gateway API instead."
      );
    }
    return `Hook type "${hookType}" is not supported by the OpenClaw adapter. OpenClaw hooks are registered programmatically.`;
  }

  override resolvePluginRoot(_args: { pluginRoot?: string }): string | undefined {
    return undefined;
  }

  override async bindSession(opts: SessionBindOptions): Promise<SessionBindResult> {
    const stateDir = normalizeSessionStateDir(
      opts.stateDir ?? process.env.BABYSITTER_STATE_DIR,
    );
    return bindSession({
      harness: "openclaw",
      stateDir,
      opts,
    });
  }

  override handleStopHook(_args: HookHandlerArgs): Promise<number> {
    process.stdout.write("{}\n");
    return Promise.resolve(0);
  }

  override async handleSessionStartHook(args: HookHandlerArgs): Promise<number> {
    const { verbose } = args;
    const log = createHookLogger("babysitter-openclaw-session-start-hook");
    log.info("handleSessionStartHook started (openclaw)");

    const sessionId =
      process.env.AGENT_SESSION_ID || process.env.OPENCLAW_SHELL || "";

    if (!sessionId) {
      log.info("No session ID — skipping state file creation");
      process.stdout.write("{}\n");
      return 0;
    }

    log.setContext("session", sessionId);
    log.info(`Session ID: ${sessionId}`);

    const stateDir = normalizeSessionStateDir(
      args.stateDir ?? process.env.BABYSITTER_STATE_DIR,
    );
    log.info(`Resolved stateDir: ${stateDir}`);

    await initializeSessionState(sessionId, stateDir, { verbose, log });

    process.stdout.write("{}\n");
    return 0;
  }

  async isCliInstalled(): Promise<boolean> {
    const result = await checkCliAvailable("openclaw");
    return result.available;
  }

  async getCliInfo(): Promise<{ command: string; version?: string; path?: string }> {
    const result = await checkCliAvailable("openclaw");
    return {
      command: "openclaw",
      version: result.version,
      path: result.path,
    };
  }

  installHarness(options: HarnessInstallOptions): Promise<HarnessInstallResult> {
    return installCliViaNpm({
      harness: "openclaw",
      cliCommand: "openclaw",
      packageName: "openclaw",
      summary: "Install the OpenClaw CLI globally via npm.",
      options,
    });
  }

  installPlugin(options: HarnessInstallOptions): Promise<HarnessInstallResult> {
    return installCliViaNpm({
      harness: "openclaw",
      cliCommand: "openclaw",
      packageName: "@a5c-ai/babysitter-openclaw",
      summary:
        "Install the Babysitter OpenClaw plugin package, then register it via `openclaw plugin install babysitter-openclaw`.",
      options,
    });
  }

  override getPromptContext(opts?: { interactive?: boolean | undefined }): PromptContext {
    return createOpenClawContext(opts);
  }
}

export function createOpenClawAdapter(): OpenClawAdapter {
  return new OpenClawAdapter();
}
