// Cursor target profile

import type { TargetProfile } from '../types.js';

export const CURSOR_PROFILE: TargetProfile = {
  name: 'cursor',
  displayName: 'Cursor',
  adapterName: 'cursor',
  pluginRootEnvVar: 'CURSOR_PLUGIN_ROOT',
  supportedHooks: new Map([
    ['SessionStart', 'sessionStart'],
    ['Stop', 'stop'],
  ]),
  commandFormat: 'markdown',
  skillHandling: 'native',
  manifestFormat: 'plugin.json',
  hookRegistrationFormat: 'cursor',
  scriptVariants: ['bash', 'powershell'],
  npmPublishable: false,
  adapterFamily: 'shell-hook',
  distribution: 'both',
};
