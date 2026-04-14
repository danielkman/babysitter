import { resolveSessionIdWithMarker } from "../utils/sessionMarker";

/**
 * Mapping of harness identifiers to their native session environment variables.
 * These are used as intermediate fallbacks between the PID-scoped marker
 * (authoritative) and the generic BABYSITTER_SESSION_ID (last resort).
 */
export const HARNESS_ENV_VARS: Record<string, string[]> = {
  "codex": ["CODEX_THREAD_ID", "CODEX_SESSION_ID"],
  "gemini-cli": ["GEMINI_SESSION_ID"],
  "github-copilot": ["COPILOT_SESSION_ID"],
  "pi": ["PI_SESSION_ID"],
  "oh-my-pi": ["OMP_SESSION_ID"],
  "claude-code": [], // Claude Code uses the marker or BABYSITTER_SESSION_ID directly
  "cursor": [],
};

/**
 * Resolve the current session ID from the ambient environment (markers + env vars).
 *
 * This is used for "autodiscovery" in contexts where no explicit session ID
 * was provided (e.g. journaling low-level events).
 *
 * Precedence matches the standard adapter resolution:
 *   1. PID-scoped marker for the given harness (if provided and alive)
 *   2. Harness-native env vars (e.g. GEMINI_SESSION_ID)
 *   3. BABYSITTER_SESSION_ID
 *
 * If BABYSITTER_TRUST_ENV_SESSION=1 is set, env vars are preferred over markers.
 */
export function resolveAmbientSessionId(harness?: string): string | undefined {
  if (!harness) {
    return process.env.BABYSITTER_SESSION_ID;
  }

  const envVars = HARNESS_ENV_VARS[harness] || [];
  return resolveSessionIdWithMarker(harness, {}, envVars);
}
