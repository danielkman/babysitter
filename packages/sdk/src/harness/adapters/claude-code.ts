/**
 * Claude Code harness adapter.
 *
 * Extends BaseHarnessAdapter with Claude-Code-specific behavior:
 * - Session binding with auto-release of stale runs
 * - Rich stop-hook continuation with skill discovery + compression
 * - Session-start hook with compression pre-warming
 */

import { appendFileSync } from "node:fs";
import { HarnessCapability as Cap } from "../types";
import type {
  SessionBindOptions,
  SessionBindResult,
} from "../types";
import type { PromptContext } from "../../prompts/types";
import {
  createClaudeCodeCliSetupSnippet,
  createPromptContext,
} from "../../prompts/contextShared";
import { normalizeSessionStateDir } from "../../config";
import { BaseHarnessAdapter } from "../BaseAdapter";
import { bindSession } from "../hooks/sessionBinding";

// ---------------------------------------------------------------------------
// Session ID resolution (previously in claudeCodeHooks.ts)
// ---------------------------------------------------------------------------

/**
 * Resolve the current session ID from environment.
 * hooks-proxy handles session ID propagation via AGENT_SESSION_ID.
 */
export function resolveCurrentSessionIdFromEnv(): string | undefined {
  return process.env.AGENT_SESSION_ID;
}

export interface SessionResolutionDetails {
  sessionId?: string;
  resolvedFrom: "env-var" | "explicit" | "none";
  /** @deprecated PID-marker logic removed. Always null. */
  ancestorPid: number | null;
  /** @deprecated PID-marker logic removed. Always null. */
  ancestorAlive: boolean | null;
}

/**
 * Resolve session ID with detailed provenance.
 */
export function resolveSessionIdDetailed(explicit?: string): SessionResolutionDetails {
  if (explicit) {
    return {
      sessionId: explicit,
      resolvedFrom: "explicit",
      ancestorPid: null,
      ancestorAlive: null,
    };
  }

  const agentSessionId = process.env.AGENT_SESSION_ID;
  if (agentSessionId) {
    return {
      sessionId: agentSessionId,
      resolvedFrom: "env-var",
      ancestorPid: null,
      ancestorAlive: null,
    };
  }

  return {
    sessionId: undefined,
    resolvedFrom: "none",
    ancestorPid: null,
    ancestorAlive: null,
  };
}

export const __resolveCurrentSessionIdFromEnvForTests = resolveCurrentSessionIdFromEnv;

export function setBabysitterSessionIdInEnvFile(
  envFile: string,
  sessionId: string,
): void {
  appendFileSync(envFile, `export AGENT_SESSION_ID="${sessionId}"\n`);
}

// ---------------------------------------------------------------------------
// Adapter class
// ---------------------------------------------------------------------------

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
    const stateDir = normalizeSessionStateDir(
      opts.stateDir ?? process.env.BABYSITTER_STATE_DIR,
    );
    return bindSession({
      harness: "claude-code",
      stateDir,
      opts,
      autoReleaseStale: true,
    });
  }

  // handleStopHook and handleSessionStartHook use BaseAdapter defaults
  // (shared stop-hook handler with detailed run state resolution)
}

export function createClaudeCodeAdapter(): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter();
}
