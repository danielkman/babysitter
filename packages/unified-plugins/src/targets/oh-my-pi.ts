// oh-my-pi target profile

import type { TargetProfile } from '../types.js';

export const OH_MY_PI_PROFILE: TargetProfile = {
  name: 'oh-my-pi',
  displayName: 'oh-my-pi',
  adapterName: 'oh-my-pi',
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
  adapterFamily: 'programmatic',
  distribution: 'npm-cli',
  pluginRootEnvVarForExtension: 'OMP_PLUGIN_ROOT',
};
