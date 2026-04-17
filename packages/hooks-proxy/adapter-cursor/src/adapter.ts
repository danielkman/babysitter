import type { AdapterCapabilities } from '@a5c/hooks-proxy-core';

/**
 * Creates the Cursor adapter capability descriptor.
 *
 * Cursor is a shell-hook harness with EXPERIMENTAL status.
 * Its hook surface varies between IDE and CLI modes and may
 * change rapidly across versions. Session IDs are derived
 * (not natively provided), blocking is limited, and env
 * propagation is wrapper-based only.
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
    toolInterceptionScope: 'partial_shell_only',
    notes: [
      'experimental',
      'hook surface varies between IDE and CLI',
      'capability profile may change across versions',
    ],
  };
}
