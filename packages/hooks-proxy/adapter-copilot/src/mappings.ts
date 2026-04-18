import type { PhaseMapping } from '@a5c-ai/hooks-proxy-core';

/**
 * Copilot native hook names mapped to canonical lifecycle phases.
 *
 * GitHub Copilot CLI exposes these hook events:
 * - sessionStart / sessionEnd   -> session lifecycle
 * - userPromptSubmitted         -> turn lifecycle
 * - preToolUse / postToolUse    -> tool lifecycle
 * - error                       -> turn error
 */
export const COPILOT_PHASE_MAPPINGS: PhaseMapping[] = [
  {
    canonicalPhase: 'session.start',
    nativeHook: 'sessionStart',
    supportLevel: 'native',
    blockCapability: false, // output is ignored
    mutationCapability: false,
    scope: 'session',
    notes: 'Session-start output is ignored by Copilot CLI; observer-only plus session-store init',
  },
  {
    canonicalPhase: 'session.end',
    nativeHook: 'sessionEnd',
    supportLevel: 'native',
    blockCapability: false,
    mutationCapability: false,
    scope: 'session',
  },
  {
    canonicalPhase: 'turn.user_prompt_submitted',
    nativeHook: 'userPromptSubmitted',
    supportLevel: 'native',
    blockCapability: false, // output ignored
    mutationCapability: false,
    scope: 'turn',
    notes: 'Output ignored on this event; observer-only',
  },
  {
    canonicalPhase: 'tool.before',
    nativeHook: 'preToolUse',
    supportLevel: 'native',
    blockCapability: true, // deny is processed
    mutationCapability: false,
    scope: 'tool',
    notes: 'permissionDecision supports allow|deny|ask in schema but only deny is processed',
  },
  {
    canonicalPhase: 'tool.after',
    nativeHook: 'postToolUse',
    supportLevel: 'native',
    blockCapability: false,
    mutationCapability: false,
    scope: 'tool',
    notes: 'Output ignored on non-preTool events',
  },
  {
    canonicalPhase: 'turn.error',
    nativeHook: 'errorOccurred',
    supportLevel: 'native',
    blockCapability: false,
    mutationCapability: false,
    scope: 'turn',
    notes: 'Error reporting; output ignored',
  },
];

/**
 * Lookup a phase mapping by native hook name.
 */
export function getMappingByNativeHook(nativeHook: string): PhaseMapping | undefined {
  return COPILOT_PHASE_MAPPINGS.find((m) => m.nativeHook === nativeHook);
}

/**
 * Lookup a phase mapping by canonical phase.
 */
export function getMappingByPhase(phase: string): PhaseMapping | undefined {
  return COPILOT_PHASE_MAPPINGS.find((m) => m.canonicalPhase === phase);
}
