import type { PhaseMapping } from '@a5c-ai/hooks-proxy-core';

/**
 * Gemini CLI native event name to canonical phase mappings.
 *
 * Gemini CLI hook events cover a richer lifecycle than some other harnesses,
 * including planner, model, and agent-level events:
 *   SessionStart, SessionEnd, BeforeToolSelection, BeforeModel, AfterModel,
 *   BeforeAgent, AfterAgent, BeforeTool, AfterTool
 *
 * Spec section 8.2 / 17.3.
 */
export const GEMINI_PHASE_MAPPINGS: PhaseMapping[] = [
  // --- Session lifecycle ---
  {
    canonicalPhase: 'session.start',
    nativeHook: 'SessionStart',
    supportLevel: 'native',
    blockCapability: false,
    mutationCapability: false,
    scope: 'session',
    notes: 'Fires when the Gemini CLI session begins.',
  },
  {
    canonicalPhase: 'session.end',
    nativeHook: 'SessionEnd',
    supportLevel: 'native',
    blockCapability: false,
    mutationCapability: false,
    scope: 'session',
    notes: 'Observer-only; fires when session is torn down.',
  },

  // --- Planner lifecycle ---
  {
    canonicalPhase: 'planner.before_tool_selection',
    nativeHook: 'BeforeToolSelection',
    supportLevel: 'native',
    blockCapability: true,
    mutationCapability: true,
    scope: 'planner',
    notes:
      'Union-style aggregation: multiple hooks return tool subsets that are unioned. ' +
      'Can influence which tools are available for the current turn.',
  },

  // --- Model lifecycle ---
  {
    canonicalPhase: 'model.before_request',
    nativeHook: 'BeforeModel',
    supportLevel: 'native',
    blockCapability: true,
    mutationCapability: true,
    scope: 'model',
    notes: 'Fires before the model request is sent. Can mutate the request payload.',
  },
  {
    canonicalPhase: 'model.after_response',
    nativeHook: 'AfterModel',
    supportLevel: 'native',
    blockCapability: false,
    mutationCapability: false,
    scope: 'model',
    notes: 'Observer-only; fires after model response is received.',
  },

  // --- Turn / agent lifecycle ---
  {
    canonicalPhase: 'turn.before_agent',
    nativeHook: 'BeforeAgent',
    supportLevel: 'native',
    blockCapability: true,
    mutationCapability: false,
    scope: 'turn',
    notes: 'Fires before the agent turn begins. Can block execution.',
  },
  {
    canonicalPhase: 'turn.after_agent',
    nativeHook: 'AfterAgent',
    supportLevel: 'native',
    blockCapability: true,
    mutationCapability: false,
    scope: 'turn',
    notes:
      'Fires after the agent turn completes. Can continue session ' +
      'by providing a follow-up prompt.',
  },

  // --- Tool lifecycle ---
  {
    canonicalPhase: 'tool.before',
    nativeHook: 'BeforeTool',
    supportLevel: 'native',
    blockCapability: true,
    mutationCapability: true,
    scope: 'tool',
    notes: 'Fires before tool execution. Can block (deny) or mutate tool input.',
  },
  {
    canonicalPhase: 'tool.after',
    nativeHook: 'AfterTool',
    supportLevel: 'native',
    blockCapability: false,
    mutationCapability: false,
    scope: 'tool',
    notes: 'Observer-only post-tool hook.',
  },
];

/**
 * Look up the phase mapping for a given Gemini native event name.
 */
export function getGeminiPhaseMapping(nativeEventName: string): PhaseMapping | undefined {
  return GEMINI_PHASE_MAPPINGS.find((m) => m.nativeHook === nativeEventName);
}

/**
 * Get all canonical phases supported by the Gemini adapter.
 */
export function getSupportedPhases(): string[] {
  return GEMINI_PHASE_MAPPINGS.map((m) => m.canonicalPhase);
}
