import type { PhaseMapping } from '@a5c/hooks-proxy-core';

/**
 * Cursor native event to canonical phase mapping table.
 *
 * Cursor's hook surface is EXPERIMENTAL and varies between IDE and CLI.
 * Only sessionStart and stop are documented as stable. Tool-level hooks
 * may exist in some versions but are marked as lossy/emulated.
 *
 * Spec section 17.5: "support only documented/stable subset per
 * configured capability profile."
 */
export const CURSOR_PHASE_MAPPINGS: PhaseMapping[] = [
  // --- Session lifecycle ---
  {
    canonicalPhase: 'session.start',
    nativeHook: 'sessionStart',
    supportLevel: 'native',
    blockCapability: false,
    mutationCapability: false,
    scope: 'session',
    notes: 'Documented and stable. Fires on session initialization.',
  },
  {
    canonicalPhase: 'session.end',
    nativeHook: 'sessionEnd',
    supportLevel: 'lossy',
    blockCapability: false,
    mutationCapability: false,
    scope: 'session',
    notes: 'May not fire reliably in all exit paths. Observer-only.',
  },

  // --- Turn lifecycle ---
  {
    canonicalPhase: 'turn.stop',
    nativeHook: 'stop',
    supportLevel: 'native',
    blockCapability: true,
    mutationCapability: false,
    scope: 'turn',
    notes: 'Documented and stable. Can continue session. Guard against recursion.',
  },

  // --- Tool lifecycle (unreliable / emulated) ---
  {
    canonicalPhase: 'tool.before',
    nativeHook: 'preToolUse',
    supportLevel: 'emulated',
    blockCapability: true,
    mutationCapability: false,
    scope: 'tool',
    notes: 'Not documented as stable. May not fire in IDE mode. Shell commands only when available.',
  },
  {
    canonicalPhase: 'tool.after',
    nativeHook: 'postToolUse',
    supportLevel: 'emulated',
    blockCapability: false,
    mutationCapability: false,
    scope: 'tool',
    notes: 'Not documented as stable. May not fire in IDE mode. Observer-only when available.',
  },
];

/**
 * Quick lookup from native event name to phase mapping.
 */
export function findMapping(nativeEventName: string): PhaseMapping | undefined {
  return CURSOR_PHASE_MAPPINGS.find((m) => m.nativeHook === nativeEventName);
}

/**
 * Get all canonical phases supported by the Cursor adapter.
 */
export function getSupportedPhases(): string[] {
  return CURSOR_PHASE_MAPPINGS.map((m) => m.canonicalPhase);
}
