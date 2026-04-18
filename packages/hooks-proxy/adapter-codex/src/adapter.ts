import type { AdapterCapabilities } from '@a5c-ai/hooks-proxy-core';

/**
 * Creates the Codex adapter with its capability metadata.
 *
 * Codex CLI is a shell-hook adapter with experimental status.
 * Tool interception is partial (Bash-only), and env propagation
 * is wrapper-based only -- there is no native env file mechanism.
 *
 * Spec section 17.2.
 */
export function createAdapter(): AdapterCapabilities {
  return {
    name: 'codex',
    family: 'shell-hook',
    sessionIdQuality: 'native',
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
      'tool interception is bash-only',
      'multiple matching hooks can launch concurrently',
      'many parsed output fields currently fail open',
    ],
  };
}
