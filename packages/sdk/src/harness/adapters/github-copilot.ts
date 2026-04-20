/**
 * GitHub Copilot harness adapter.
 */

import * as path from "node:path";
import { HarnessCapability as Cap } from "../types";
import type {
  HookHandlerArgs,
  SessionBindOptions,
  SessionBindResult,
} from "../types";
import type { PromptContext } from "../../prompts/types";
import { BaseHarnessAdapter } from "../BaseAdapter";
import {
  handleGithubCopilotSessionEndHook,
  handleGithubCopilotSessionStartHook,
  resolveGithubCopilotSessionId,
  resolveGithubCopilotStateDir,
} from "../githubCopilot/hooks";
import { createGithubCopilotContext } from "../githubCopilot/promptContext";
import { bindSession } from "../hooks/sessionBinding";

export { setBabysitterSessionIdInCopilotEnvFile } from "../githubCopilot/hooks";

class GithubCopilotAdapter extends BaseHarnessAdapter {
  constructor() {
    super({
      name: "github-copilot",
      displayName: "GitHub Copilot CLI",
      activationEnvVars: ["AGENT_SESSION_ID", "COPILOT_HOME", "COPILOT_GITHUB_TOKEN"],
      capabilities: [Cap.HeadlessPrompt, Cap.SessionBinding, Cap.Mcp],
      loopControlTerm: "in-turn",
      autoResolvesSession: false,
      pluginRootEnvVars: ["CLAUDE_PLUGIN_DATA", "COPILOT_PLUGIN_ROOT"],
      sessionIdEnvVars: ["AGENT_SESSION_ID"],
      promptCapabilities: ["hooks", "mcp", "task-tool", "breakpoint-routing"],
      pluginRootVar: "${COPILOT_PLUGIN_ROOT}",
      hookDriven: false,
      interactiveToolName: "AskUserQuestion tool",
      sessionEnvVars: "PID-scoped session marker (authoritative); COPILOT_ENV_FILE / COPILOT_SESSION_ID and AGENT_SESSION_ID are fallbacks",
      hasIntentFidelityChecks: false,
      hasNonNegotiables: false,
    });
  }

  override getMissingSessionIdHint(): string {
    return (
      "GitHub Copilot CLI provides session IDs via hook stdin JSON. " +
      "Use --session-id explicitly, or ensure Copilot CLI hooks are configured " +
      "to pass session_id in the stdin payload."
    );
  }

  override supportsHookType(hookType: string): boolean {
    const supported = [
      "session-start", "session-end", "user-prompt-submit",
      "pre-tool-use", "post-tool-use",
    ];
    return supported.includes(hookType);
  }

  override resolveSessionId(parsed: { sessionId?: string }): string | undefined {
    return resolveGithubCopilotSessionId(parsed);
  }

  override resolveStateDir(args: { stateDir?: string; pluginRoot?: string }): string | undefined {
    return resolveGithubCopilotStateDir(args);
  }

  override resolvePluginRoot(args: { pluginRoot?: string }): string | undefined {
    const root =
      args.pluginRoot ||
      process.env.CLAUDE_PLUGIN_DATA ||
      process.env.COPILOT_PLUGIN_ROOT;
    return root ? path.resolve(root) : undefined;
  }

  override async bindSession(opts: SessionBindOptions): Promise<SessionBindResult> {
    const stateDir = resolveGithubCopilotStateDir({
      stateDir: opts.stateDir,
      pluginRoot: opts.pluginRoot,
    });
    return bindSession({
      harness: "github-copilot",
      stateDir: stateDir ?? "",
      opts,
    });
  }

  override handleStopHook(args: HookHandlerArgs): Promise<number> {
    return handleGithubCopilotSessionEndHook(args);
  }

  override handleSessionStartHook(args: HookHandlerArgs): Promise<number> {
    return handleGithubCopilotSessionStartHook(args);
  }

  override getPromptContext(opts?: { interactive?: boolean | undefined }): PromptContext {
    return createGithubCopilotContext(opts);
  }
}

export function createGithubCopilotAdapter(): GithubCopilotAdapter {
  return new GithubCopilotAdapter();
}
