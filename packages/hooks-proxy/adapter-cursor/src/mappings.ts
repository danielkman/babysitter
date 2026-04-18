import type { PhaseMapping } from '@a5c-ai/hooks-proxy-core';

/**
 * Cursor native event to canonical phase mapping table.
 *
 * Cursor's hook surface is now documented and stable for both IDE and CLI.
 * All listed events (sessionStart, sessionEnd, preToolUse, postToolUse, stop)
 * are native hooks per Cursor's official docs.
 *
 * Spec section 17.5.
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
    supportLevel: 'native',
    blockCapability: false,
    mutationCapability: false,
    scope: 'session',
    notes: 'Fires on session end. Observer-only.',
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

  // --- Tool lifecycle ---
  {
    canonicalPhase: 'tool.before',
    nativeHook: 'preToolUse',
    supportLevel: 'native',
    blockCapability: true,
    mutationCapability: false,
    scope: 'tool',
    notes: 'Documented and stable. Fires before tool execution. Can block (deny).',
  },
  {
    canonicalPhase: 'tool.after',
    nativeHook: 'postToolUse',
    supportLevel: 'native',
    blockCapability: false,
    mutationCapability: false,
    scope: 'tool',
    notes: 'Documented and stable. Observer-only post-tool hook.',
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
