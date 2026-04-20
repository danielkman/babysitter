/**
 * Claude Code harness adapter.
 *
 * Extends BaseHarnessAdapter with Claude-Code-specific behavior:
 * - Session binding with auto-release of stale runs
 * - Rich stop-hook continuation with skill discovery + compression
 * - Session-start hook with compression pre-warming
 */

import { HarnessCapability as Cap } from "../types";
import type {
  HookHandlerArgs,
  SessionBindOptions,
  SessionBindResult,
} from "../types";
import type { PromptContext } from "../../prompts/types";
import {
  createClaudeCodeCliSetupSnippet,
  createPromptContext,
} from "../../prompts/contextShared";
import { BaseHarnessAdapter } from "../BaseAdapter";
import { handleClaudeCodeStopHook } from "../claudeCode/stopHook";
import { handleClaudeCodeSessionStartHook } from "../claudeCode/sessionStart";
import { bindClaudeCodeSession } from "../claudeCode/lifecycle";
import {
  resolveCurrentSessionIdFromEnv,
  type SessionResolutionDetails,
  resolveSessionIdDetailed,
  __resolveCurrentSessionIdFromEnvForTests,
} from "../claudeCode/shared";

export {
  __resolveCurrentSessionIdFromEnvForTests,
  type SessionResolutionDetails,
  resolveSessionIdDetailed,
};

class ClaudeCodeAdapter extends BaseHarnessAdapter {
  constructor() {
    super({
      name: "claude-code",
      displayName: "Claude Code",
      activationEnvVars: ["AGENT_SESSION_ID", "CLAUDE_ENV_FILE"],
      capabilities: [Cap.SessionBinding, Cap.StopHook, Cap.Mcp, Cap.HeadlessPrompt],
      loopControlTerm: "stop-hook",
      autoResolvesSession: true,
      pluginRootEnvVars: ["CLAUDE_PLUGIN_ROOT"],
      sessionIdEnvVars: ["AGENT_SESSION_ID"],
      promptCapabilities: ["hooks", "stop-hook", "ask-user-question", "task-tool", "breakpoint-routing"],
      pluginRootVar: "${CLAUDE_PLUGIN_ROOT}",
      hookDriven: true,
      interactiveToolName: "AskUserQuestion tool",
      sessionEnvVars: "PID-scoped session marker (authoritative); CLAUDE_ENV_FILE and AGENT_SESSION_ID are fallbacks",
      hasIntentFidelityChecks: false,
      hasNonNegotiables: false,
    });
  }

  override resolveSessionId(parsed: { sessionId?: string }): string | undefined {
    if (parsed.sessionId) return parsed.sessionId;
    return resolveCurrentSessionIdFromEnv();
  }

  override getPromptContext(opts?: { interactive?: boolean | undefined }): PromptContext {
    return createPromptContext(
      {
        harness: "claude-code",
        harnessLabel: "Claude Code",
        capabilities: ["hooks", "stop-hook", "ask-user-question", "task-tool", "breakpoint-routing"],
        pluginRootVar: "${CLAUDE_PLUGIN_ROOT}",
        loopControlTerm: "stop-hook",
        sessionBindingFlags: "",
        hookDriven: true,
        interactiveToolName: "AskUserQuestion tool",
        sessionEnvVars: "PID-scoped session marker (authoritative); CLAUDE_ENV_FILE and AGENT_SESSION_ID are fallbacks",
        resumeFlags: "",
        cliSetupSnippet: createClaudeCodeCliSetupSnippet(),
        sdkVersionExpr: "$SDK_VERSION",
        iterateFlags: "",
        hasIntentFidelityChecks: false,
        hasNonNegotiables: false,
      },
      opts ? { interactive: opts.interactive } : undefined,
    );
  }

  override bindSession(opts: SessionBindOptions): Promise<SessionBindResult> {
    return bindClaudeCodeSession(opts);
  }

  override handleStopHook(args: HookHandlerArgs): Promise<number> {
    return handleClaudeCodeStopHook(args);
  }

  override handleSessionStartHook(args: HookHandlerArgs): Promise<number> {
    return handleClaudeCodeSessionStartHook(args);
  }
}

export function createClaudeCodeAdapter(): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter();
}
