// Codex target profile

import type { TargetProfile } from '../types.js';

export const CODEX_PROFILE: TargetProfile = {
  name: 'codex',
  displayName: 'Codex',
  adapterName: 'codex',
  pluginRootEnvVar: null,
  supportedHooks: new Map([
    ['SessionStart', 'SessionStart'],
    ['Stop', 'Stop'],
    ['UserPromptSubmit', 'UserPromptSubmit'],
  ]),
  commandFormat: 'none', // Skills derived from commands instead
  skillHandling: 'derived-from-commands',
  manifestFormat: 'package.json',
  hookRegistrationFormat: 'codex',
  scriptVariants: ['bash'],
  npmPublishable: true,
  adapterFamily: 'shell-hook',
  distribution: 'npm-cli',
  marketplacePath: '.agents/plugins/marketplace.json',
};
