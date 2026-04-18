import type { PhaseMapping } from '@a5c-ai/hooks-proxy-core';

/**
 * Codex native event to canonical phase mapping table.
 *
 * Codex CLI hooks use a similar event naming scheme to Claude Code,
 * but with an experimental/limited surface. Tool-level hooks only
 * cover Bash execution and are incomplete (spec section 17.2).
 *
 * Events documented in Codex hooks.json: SessionStart, UserPromptSubmit,
 * Stop, PreToolUse, PostToolUse (Bash commands only).
 */
export const CODEX_PHASE_MAPPINGS: PhaseMapping[] = [
  // --- Session lifecycle ---
  {
    canonicalPhase: 'session.start',
    nativeHook: 'SessionStart',
    supportLevel: 'native',
    blockCapability: false,
    mutationCapability: false,
    scope: 'session',
    notes: 'Bootstrap event; output is largely ignored by Codex runtime',
  },
  {
    canonicalPhase: 'session.end',
    nativeHook: 'SessionEnd',
    supportLevel: 'lossy',
    blockCapability: false,
    mutationCapability: false,
    scope: 'session',
    notes: 'Codex may not reliably fire SessionEnd in all exit paths',
  },

  // --- Turn lifecycle ---
  {
    canonicalPhase: 'turn.user_prompt_submitted',
    nativeHook: 'UserPromptSubmit',
    supportLevel: 'native',
    blockCapability: true,
    mutationCapability: false,
    scope: 'turn',
  },
  {
    canonicalPhase: 'turn.stop',
    nativeHook: 'Stop',
    supportLevel: 'native',
    blockCapability: true,
    mutationCapability: false,
    scope: 'turn',
  },

  // --- Tool lifecycle (Bash-only, incomplete) ---
  {
    canonicalPhase: 'tool.before',
    nativeHook: 'PreToolUse',
    supportLevel: 'lossy',
    blockCapability: true,
    mutationCapability: false,
    scope: 'tool',
    notes: 'Bash-only; non-Bash tool calls are not intercepted',
  },
  {
    canonicalPhase: 'tool.after',
    nativeHook: 'PostToolUse',
    supportLevel: 'lossy',
    blockCapability: false,
    mutationCapability: false,
    scope: 'tool',
    notes: 'Bash-only; non-Bash tool calls are not intercepted',
  },
];

/**
 * Quick lookup from native event name to phase mapping.
 */
export function findMapping(nativeEventName: string): PhaseMapping | undefined {
  return CODEX_PHASE_MAPPINGS.find((m) => m.nativeHook === nativeEventName);
}
