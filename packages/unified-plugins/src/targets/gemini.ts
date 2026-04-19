// Gemini CLI target profile

import type { TargetProfile } from '../types.js';

export const GEMINI_PROFILE: TargetProfile = {
  name: 'gemini',
  displayName: 'Gemini CLI',
  adapterName: 'gemini',
  pluginRootEnvVar: 'GEMINI_EXTENSION_PATH',
  supportedHooks: new Map([
    ['SessionStart', 'SessionStart'],
    ['AfterAgent', 'AfterAgent'],
  ]),
  commandFormat: 'toml',
  skillHandling: 'none',
  manifestFormat: 'multiple', // plugin.json + gemini-extension.json
  hookRegistrationFormat: 'gemini',
  scriptVariants: ['bash'],
  npmPublishable: false,
  adapterFamily: 'shell-hook',
  distribution: 'npm-cli',
};
