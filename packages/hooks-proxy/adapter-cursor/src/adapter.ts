import type { AdapterCapabilities } from '@a5c-ai/hooks-proxy-core';

/**
 * Creates the Cursor adapter capability descriptor.
 *
 * Cursor is a shell-hook harness with a now-stable hook surface.
 * Session IDs are derived (not natively provided), blocking
 * is supported on preToolUse and stop, and env propagation
 * is wrapper-based only.
 *
 * Spec section 17.5.
 */
export function createAdapter(): AdapterCapabilities {
  return {
    name: 'cursor',
    family: 'shell-hook',
    sessionIdQuality: 'derived',
    supportsOrderedFanout: true,
    supportsNativeAdditionalContext: false,
    supportsBlock: true,
    supportsAsk: false,
    supportsToolInputMutation: false,
    supportsToolResultMutation: false,
    supportsPersistedEnv: false,
    envPersistenceMode: 'wrapper_only',
    toolInterceptionScope: 'all',
    notes: [
      'Hook surface is stable as of Cursor 3.0',
      'IDE and CLI share the same hook surface',
    ],
  };
}
