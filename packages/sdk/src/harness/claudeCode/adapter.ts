import * as path from "node:path";
import type { PromptContext } from "../../prompts/types";
import { createClaudeCodeContext } from "./promptContext";
import { normalizeSessionStateDir } from "../../config";
import type {
  HarnessAdapter,
  HarnessInstallOptions,
  HarnessInstallResult,
  HookHandlerArgs,
  SessionBindOptions,
  SessionBindResult,
} from "../types";
import {
  __resolveCurrentSessionIdFromEnvForTests,
  resolveCurrentSessionIdFromEnv,
  type SessionResolutionDetails,
  resolveSessionIdDetailed,
} from "./shared";
import {
  bindClaudeCodeSession,
} from "./lifecycle";
import { handleClaudeCodeStopHook } from "./stopHook";
import { handleClaudeCodeSessionStartHook } from "./sessionStart";

export {
  __resolveCurrentSessionIdFromEnvForTests,
  type SessionResolutionDetails,
  resolveSessionIdDetailed,
};

export function createClaudeCodeAdapter(): HarnessAdapter {
  return {
    name: "claude-code",

    isActive(): boolean {
      return !!(process.env.AGENT_SESSION_ID || process.env.CLAUDE_ENV_FILE);
    },

    autoResolvesSessionId(): boolean {
      return true;
    },

    resolveSessionId(parsed: { sessionId?: string }): string | undefined {
      if (parsed.sessionId) return parsed.sessionId;
      return resolveCurrentSessionIdFromEnv();
    },

    resolveStateDir(args: { stateDir?: string; pluginRoot?: string }): string | undefined {
      return normalizeSessionStateDir(
        args.stateDir ?? process.env.BABYSITTER_STATE_DIR,
      );
    },

    resolvePluginRoot(args: { pluginRoot?: string }): string | undefined {
      const root = args.pluginRoot || process.env.CLAUDE_PLUGIN_ROOT;
      return root ? path.resolve(root) : undefined;
    },

    bindSession(opts: SessionBindOptions): Promise<SessionBindResult> {
      return bindClaudeCodeSession(opts);
    },

    handleStopHook(args: HookHandlerArgs): Promise<number> {
      return handleClaudeCodeStopHook(args);
    },

    handleSessionStartHook(args: HookHandlerArgs): Promise<number> {
      return handleClaudeCodeSessionStartHook(args);
    },

    findHookDispatcherPath(_startCwd: string): string | null {
      return null;
    },

    getPromptContext(opts?: { interactive?: boolean | undefined }): PromptContext {
      return createClaudeCodeContext(opts);
    },
  };
}
