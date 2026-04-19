// GitHub Copilot target profile

import type { TargetProfile } from '../types.js';

export const GITHUB_COPILOT_PROFILE: TargetProfile = {
  name: 'github-copilot',
  displayName: 'GitHub Copilot CLI',
  adapterName: 'copilot',
  pluginRootEnvVar: 'COPILOT_PLUGIN_DIR',
  supportedHooks: new Map([
    ['SessionStart', 'sessionStart'],
    ['SessionEnd', 'sessionEnd'],
    ['UserPromptSubmit', 'userPromptSubmitted'],
  ]),
  commandFormat: 'markdown',
  skillHandling: 'native',
  manifestFormat: 'plugin.json',
  hookRegistrationFormat: 'github-copilot',
  scriptVariants: ['bash', 'powershell'],
  npmPublishable: false,
  adapterFamily: 'shell-hook',
  distribution: 'both',
};
