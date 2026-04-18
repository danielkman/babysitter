import type { AdapterCapabilities } from '@a5c-ai/hooks-proxy-core';

/**
 * Creates the Gemini CLI adapter capability descriptor.
 *
 * Gemini CLI is a shell-hook harness with derived session IDs
 * (from GEMINI_SESSION_ID env or workspace-based derivation),
 * wrapper-only env persistence, and support for blocking, asking,
 * and tool input mutation.
 *
 * Spec section 17.3.
 */
export function createAdapter(): AdapterCapabilities {
  return {
    name: 'gemini',
    family: 'shell-hook',
    sessionIdQuality: 'derived',
    supportsOrderedFanout: true,
    supportsNativeAdditionalContext: true,
    supportsBlock: true,
    supportsAsk: true,
    supportsToolInputMutation: true,
    supportsToolResultMutation: false,
    supportsPersistedEnv: false,
    envPersistenceMode: 'wrapper_only',
    toolInterceptionScope: 'all',
    notes: [
      'BeforeToolSelection has union-style aggregation',
      'Logs must go to stderr; final JSON to stdout only',
      'Session ID derived from GEMINI_SESSION_ID env or workspace + timestamp',
    ],
  };
}
