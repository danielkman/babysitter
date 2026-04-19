// Pi target profile

import type { TargetProfile } from '../types.js';

export const PI_PROFILE: TargetProfile = {
  name: 'pi',
  displayName: 'Pi Coding Agent',
  adapterName: 'pi',
  pluginRootEnvVar: null,
  supportedHooks: new Map([
    ['SessionStart', 'session_start'],
    ['Stop', 'stop'],
    ['UserPromptSubmit', 'context'],
    ['PreToolUse', 'tool_call'],
    ['BeforeProviderRequest', 'before_provider_request'],
  ]),
  commandFormat: 'markdown',
  skillHandling: 'derived-from-commands',
  manifestFormat: 'package.json',
  hookRegistrationFormat: null,
  scriptVariants: ['javascript'],
  npmPublishable: true,
  npmPackageName: '@a5c-ai/babysitter-pi',
  adapterFamily: 'programmatic',
  distribution: 'npm-cli',
  pluginRootEnvVarForExtension: 'PI_PLUGIN_ROOT',
};
