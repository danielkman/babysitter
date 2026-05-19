/**
 * Claude Code harness adapter.
 *
 * Derives all behavior from BaseHarnessAdapter + agent-mux metadata.
 */

import { appendFileSync } from "node:fs";
import { BaseHarnessAdapter, type AdapterConfig } from "../BaseAdapter";
import { getAmuxAdapterMetadata } from "../amuxMetadata";
import { deriveAdapterConfig } from "../derivePromptContext";

// ---------------------------------------------------------------------------
// Backward-compatible exported utilities
// ---------------------------------------------------------------------------

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

export function resolveSessionIdDetailed(explicit?: string): SessionResolutionDetails {
  if (explicit) {
    return { sessionId: explicit, resolvedFrom: "explicit", ancestorPid: null, ancestorAlive: null };
  }
  const agentSessionId = process.env.AGENT_SESSION_ID;
  if (agentSessionId) {
    return { sessionId: agentSessionId, resolvedFrom: "env-var", ancestorPid: null, ancestorAlive: null };
  }
  return { sessionId: undefined, resolvedFrom: "none", ancestorPid: null, ancestorAlive: null };
}

export const __resolveCurrentSessionIdFromEnvForTests = resolveCurrentSessionIdFromEnv;

export function setBabysitterSessionIdInEnvFile(envFile: string, sessionId: string): void {
  appendFileSync(envFile, `export AGENT_SESSION_ID="${sessionId}"\n`);
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

function buildConfig(): AdapterConfig {
  const metadata = getAmuxAdapterMetadata("claude-code");
  return deriveAdapterConfig(metadata, {
    name: "claude-code",
    displayName: "Claude Code",
    extraActivationEnvVars: ["CLAUDE_ENV_FILE"],
    pluginRootEnvVars: ["CLAUDE_PLUGIN_ROOT"],
    sessionIdEnvVars: ["AGENT_SESSION_ID"],
    pluginRootVar: "${CLAUDE_PLUGIN_ROOT}",
    interactiveToolName: "AskUserQuestion tool",
    sessionEnvVars: "AGENT_SESSION_ID",
    hasIntentFidelityChecks: false,
    hasNonNegotiables: false,
    hookDriven: true,
    autoReleaseStale: true,
  });
}

class ClaudeCodeAdapter extends BaseHarnessAdapter {
  constructor() {
    super(buildConfig());
  }
}

export function createClaudeCodeAdapter(): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter();
}
