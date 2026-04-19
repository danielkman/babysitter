/**
 * Unified harness adapter.
 *
 * Delegates hook plumbing to @a5c-ai/hooks-proxy via subprocess while
 * keeping babysitter-specific orchestration logic (iteration tracking,
 * journal inspection, continuation building) in the SDK.
 *
 * This adapter is the DEFAULT fallback when no harness-specific adapter
 * is detected.  It imports NO hooks-proxy packages — all communication
 * is via subprocess stdin/stdout and environment variables.
 *
 * Key env vars:
 * - AGENT_UNIFIED_ADAPTER=1        — force-enable the adapter
 * - AGENT_SESSION_ID               — session identifier (hooks-proxy convention)
 * - AGENT_CAPABILITIES_JSON        — JSON-serialised proxy capabilities
 * - AGENT_HOOKS_PROXY_PATH         — custom path to the hooks-proxy binary
 * - AGENT_SESSION_ID               — session ID (from hooks-proxy)
 */

import * as path from "node:path";
import { normalizeSessionStateDir } from "../../config";
import { HarnessCapability } from "../types";
import type {
  HarnessAdapter,
  SessionBindOptions,
  SessionBindResult,
  HookHandlerArgs,
} from "../types";
import type { PromptContext } from "../../prompts/types";
import {
  deriveCapabilitiesFromProxy,
  type ProxyCapabilities,
} from "./capabilities";
import { createUnifiedContext } from "./promptContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse AGENT_CAPABILITIES_JSON from the environment.
 * Returns `undefined` when absent or malformed.
 */
function readProxyCapabilities(): ProxyCapabilities | undefined {
  const raw = process.env.AGENT_CAPABILITIES_JSON;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ProxyCapabilities;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

export function createUnifiedAdapter(): HarnessAdapter {
  return {
    name: "unified",

    // ── Detection ──────────────────────────────────────────────────────

    isActive(): boolean {
      return process.env.AGENT_UNIFIED_ADAPTER === "1";
    },

    autoResolvesSessionId(): boolean {
      // The unified adapter reads AGENT_SESSION_ID automatically.
      return !!process.env.AGENT_SESSION_ID;
    },

    // ── Resolution ─────────────────────────────────────────────────────

    resolveSessionId(parsed: { sessionId?: string }): string | undefined {
      if (parsed.sessionId) return parsed.sessionId;
      if (process.env.AGENT_SESSION_ID) return process.env.AGENT_SESSION_ID;
      return undefined;
    },

    resolveStateDir(args: {
      stateDir?: string;
      pluginRoot?: string;
    }): string | undefined {
      return normalizeSessionStateDir(
        args.stateDir ?? process.env.BABYSITTER_STATE_DIR,
      );
    },

    resolvePluginRoot(args: { pluginRoot?: string }): string | undefined {
      if (args.pluginRoot) return path.resolve(args.pluginRoot);
      if (process.env.AGENT_PLUGIN_ROOT)
        return path.resolve(process.env.AGENT_PLUGIN_ROOT);
      return undefined;
    },

    getMissingSessionIdHint(): string {
      return (
        "Set AGENT_SESSION_ID (hooks-proxy convention) or pass --session-id explicitly."
      );
    },

    supportsHookType(_hookType: string): boolean {
      // The unified adapter supports all hook types — hooks-proxy
      // handles the actual dispatch to the underlying harness.
      return true;
    },

    // ── Capabilities ───────────────────────────────────────────────────

    getCapabilities(): HarnessCapability[] {
      const proxy = readProxyCapabilities();
      if (proxy) {
        return deriveCapabilitiesFromProxy(proxy);
      }
      // Default minimal capabilities
      return [
        HarnessCapability.Programmatic,
        HarnessCapability.SessionBinding,
      ];
    },

    // ── Session binding ────────────────────────────────────────────────

    bindSession(opts: SessionBindOptions): Promise<SessionBindResult> {
      const sessionId =
        opts.sessionId ||
        process.env.AGENT_SESSION_ID;

      if (!sessionId) {
        return Promise.resolve({
          harness: "unified",
          sessionId: "",
          error:
            "Unified adapter requires a session ID. " +
            "Set AGENT_SESSION_ID or pass --session-id.",
          fatal: false,
        });
      }

      return Promise.resolve({
        harness: "unified",
        sessionId,
      });
    },

    // ── Hook handlers (minimal; hooks-proxy does the real work) ───────

    handleStopHook(_args: HookHandlerArgs): Promise<number> {
      // When running through hooks-proxy, the proxy handles the stop
      // lifecycle.  If called directly, approve (allow exit).
      process.stdout.write('{"decision":"approve"}\n');
      return Promise.resolve(0);
    },

    handleSessionStartHook(_args: HookHandlerArgs): Promise<number> {
      // Hooks-proxy handles session bootstrapping.
      // If called directly, nothing to do.
      process.stdout.write("{}\n");
      return Promise.resolve(0);
    },

    findHookDispatcherPath(_startCwd: string): string | null {
      // The unified adapter does not ship its own hook dispatcher —
      // hooks-proxy is the dispatcher.
      return null;
    },

    // ── Prompt context ─────────────────────────────────────────────────

    getPromptContext(
      opts?: { interactive?: boolean | undefined },
    ): PromptContext {
      return createUnifiedContext(opts);
    },
  };
}
