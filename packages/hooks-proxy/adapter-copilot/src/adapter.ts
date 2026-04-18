import type { AdapterCapabilities } from '@a5c-ai/hooks-proxy-core';

/**
 * Creates the GitHub Copilot adapter with its capability metadata.
 *
 * Key characteristics:
 * - Shell-hook family (stdin JSON / stdout JSON)
 * - Synthetic session ID (no stable native session ID exposed)
 * - Pre-tool deny is the only blocking path
 * - Session-start output is ignored by Copilot CLI
 * - permissionDecision supports allow|deny|ask in schema but only deny is processed
 * - Many hook outputs are ignored on non-preTool events
 */
export function createAdapter(): AdapterCapabilities {
  return {
    name: 'copilot',
    family: 'shell-hook',
    sessionIdQuality: 'synthetic',
    supportsOrderedFanout: true,
    supportsNativeAdditionalContext: false,
    supportsBlock: true, // pre-tool deny only
    supportsAsk: false,
    supportsToolInputMutation: false,
    supportsToolResultMutation: false,
    supportsPersistedEnv: false,
    envPersistenceMode: 'wrapper_only',
    toolInterceptionScope: 'all',
    notes: [
      'session-start output ignored',
      'only deny processed for permissionDecision',
    ],
  };
}
