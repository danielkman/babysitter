import type { AdapterCapabilities } from '@a5c-ai/hooks-proxy-core';

/**
 * Creates the Claude Code adapter capability descriptor.
 *
 * Claude Code is a shell-hook harness with native session IDs,
 * native env-file persistence via CLAUDE_ENV_FILE, and full
 * tool interception scope.
 *
 * Spec section 17.1.
 */
export function createAdapter(): AdapterCapabilities {
  return {
    name: 'claude',
    family: 'shell-hook',
    sessionIdQuality: 'native',
    supportsOrderedFanout: true,
    supportsNativeAdditionalContext: true,
    supportsBlock: true,
    supportsAsk: true,
    supportsToolInputMutation: false,
    supportsToolResultMutation: false,
    supportsPersistedEnv: true,
    envPersistenceMode: 'native_env_file',
    toolInterceptionScope: 'all',
    notes: [
      'CLAUDE_ENV_FILE is only available on specific events; append semantics required',
      'turn.stop can recurse if not guarded; stop_hook_active must be checked',
      'session.start source values: startup, resume, clear, compact',
    ],
  };
}
