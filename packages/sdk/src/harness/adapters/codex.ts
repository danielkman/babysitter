/**
 * Codex harness adapter.
 *
 * Extends BaseHarnessAdapter with Codex-specific behavior:
 * - Stop hook delegation to Claude Code's handler
 * - Session start with marker writes
 * - Codex-specific session/plugin root resolution
 */

import { HarnessCapability as Cap } from "../types";
import type {
  HookHandlerArgs,
  SessionBindOptions,
  SessionBindResult,
} from "../types";
import type { PromptContext } from "../../prompts/types";
import { BaseHarnessAdapter } from "../BaseAdapter";
import { createClaudeCodeAdapter } from "./claude-code";
import { handleCodexStopHook, handleCodexSessionStartHook } from "../codex/hooks";
import {
  resolveCodexPluginRoot,
  resolveCodexSessionId,
  resolveCodexStateDir,
} from "../codex/shared";
import { bindSession } from "../hooks/sessionBinding";
import { createCodexContext } from "../codex/promptContext";

class CodexAdapter extends BaseHarnessAdapter {
  constructor() {
    super({
      name: "codex",
      displayName: "Codex",
      activationEnvVars: ["AGENT_SESSION_ID", "CODEX_THREAD_ID", "CODEX_SESSION_ID", "CODEX_PLUGIN_ROOT"],
      capabilities: [Cap.SessionBinding, Cap.StopHook, Cap.HeadlessPrompt],
      loopControlTerm: "stop-hook",
      autoResolvesSession: true,
      pluginRootEnvVars: ["CODEX_PLUGIN_ROOT", "AGENT_PLUGIN_ROOT"],
      sessionIdEnvVars: ["CODEX_THREAD_ID", "CODEX_SESSION_ID", "AGENT_SESSION_ID"],
      promptCapabilities: ["hooks", "stop-hook", "ask-user-question", "task-tool", "breakpoint-routing"],
      pluginRootVar: "${CODEX_PLUGIN_ROOT}",
      hookDriven: true,
      interactiveToolName: "AskUserQuestion tool",
      sessionEnvVars: "PID-scoped session marker (authoritative); CODEX_THREAD_ID/CODEX_SESSION_ID and AGENT_SESSION_ID are fallbacks",
      hasIntentFidelityChecks: true,
      hasNonNegotiables: true,
    });
  }

  override getMissingSessionIdHint(): string {
    return (
      "Use --session-id explicitly, or launch through a Codex hook callback " +
      "that provides a stable session/thread ID."
    );
  }

  override supportsHookType(_hookType: string): boolean {
    return true;
  }

  override resolveSessionId(parsed: { sessionId?: string }): string | undefined {
    return resolveCodexSessionId(parsed);
  }

  override resolveStateDir(args: { stateDir?: string; pluginRoot?: string }): string | undefined {
    return resolveCodexStateDir(args);
  }

  override resolvePluginRoot(args: { pluginRoot?: string }): string | undefined {
    return resolveCodexPluginRoot(args);
  }

  override async bindSession(opts: SessionBindOptions): Promise<SessionBindResult> {
    const stateDir = resolveCodexStateDir({
      stateDir: opts.stateDir,
      pluginRoot: opts.pluginRoot,
    });
    return bindSession({
      harness: "codex",
      stateDir,
      opts,
      autoReleaseStale: true,
    });
  }

  override handleStopHook(args: HookHandlerArgs): Promise<number> {
    const claude = createClaudeCodeAdapter();
    return handleCodexStopHook(args, claude);
  }

  override handleSessionStartHook(args: HookHandlerArgs): Promise<number> {
    return handleCodexSessionStartHook(args);
  }

  override getPromptContext(opts?: { interactive?: boolean | undefined }): PromptContext {
    return createCodexContext(opts);
  }
}

export function createCodexAdapter(): CodexAdapter {
  return new CodexAdapter();
}
