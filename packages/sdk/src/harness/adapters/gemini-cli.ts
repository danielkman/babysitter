/**
 * Gemini CLI harness adapter.
 */

import * as path from "node:path";
import { HarnessCapability as Cap } from "../types";
import type {
  SessionBindOptions,
  SessionBindResult,
} from "../types";
import type { PromptContext } from "../../prompts/types";
import { normalizeSessionStateDir } from "../../config";
import { resolveSessionIdWithMarker } from "../../utils/sessionMarker";
import { BaseHarnessAdapter } from "../BaseAdapter";
import { createGeminiCliContext } from "../hooks/promptContexts";
import { bindSession } from "../hooks/sessionBinding";

export function resolveGeminiSessionIdFromEnv(): string | undefined {
  return resolveSessionIdWithMarker("gemini-cli", {}, ["GEMINI_SESSION_ID"]);
}

export function resolveGeminiCliStateDir(args: {
  stateDir?: string;
  pluginRoot?: string;
}): string {
  return normalizeSessionStateDir(args.stateDir ?? process.env.BABYSITTER_STATE_DIR);
}

class GeminiCliAdapter extends BaseHarnessAdapter {
  constructor() {
    super({
      name: "gemini-cli",
      displayName: "Gemini CLI",
      activationEnvVars: ["AGENT_SESSION_ID", "GEMINI_CLI", "GEMINI_SESSION_ID", "GEMINI_PROJECT_DIR", "GEMINI_CWD"],
      capabilities: [Cap.SessionBinding, Cap.StopHook, Cap.HeadlessPrompt],
      loopControlTerm: "stop-hook",
      autoResolvesSession: true,
      pluginRootEnvVars: ["GEMINI_EXTENSION_PATH", "BABYSITTER_EXTENSION_PATH"],
      sessionIdEnvVars: ["GEMINI_SESSION_ID", "AGENT_SESSION_ID"],
      promptCapabilities: ["hooks", "stop-hook", "task-tool", "breakpoint-routing"],
      pluginRootVar: "${GEMINI_EXTENSION_PATH}",
      hookDriven: true,
      interactiveToolName: "AskUserQuestion tool",
      sessionEnvVars: "PID-scoped session marker (authoritative); GEMINI_SESSION_ID and AGENT_SESSION_ID are fallbacks",
      hasIntentFidelityChecks: false,
      hasNonNegotiables: false,
    });
  }

  override resolveSessionId(parsed: { sessionId?: string }): string | undefined {
    if (parsed.sessionId) return parsed.sessionId;
    return resolveGeminiSessionIdFromEnv();
  }

  override resolveStateDir(args: { stateDir?: string; pluginRoot?: string }): string | undefined {
    return resolveGeminiCliStateDir(args);
  }

  override resolvePluginRoot(args: { pluginRoot?: string }): string | undefined {
    const root =
      args.pluginRoot ||
      process.env.GEMINI_EXTENSION_PATH ||
      process.env.BABYSITTER_EXTENSION_PATH;
    return root ? path.resolve(root) : undefined;
  }

  override async bindSession(opts: SessionBindOptions): Promise<SessionBindResult> {
    const stateDir = resolveGeminiCliStateDir({
      stateDir: opts.stateDir,
      pluginRoot: opts.pluginRoot,
    });
    return bindSession({
      harness: "gemini-cli",
      stateDir: stateDir ?? "",
      opts,
    });
  }

  override getPromptContext(opts?: { interactive?: boolean | undefined }): PromptContext {
    return createGeminiCliContext(opts);
  }

  // handleStopHook and handleSessionStartHook use BaseAdapter defaults
}

export function createGeminiCliAdapter(): GeminiCliAdapter {
  return new GeminiCliAdapter();
}
