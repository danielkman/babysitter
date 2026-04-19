// OpenCode target profile

import type { TargetProfile } from '../types.js';

export const OPENCODE_PROFILE: TargetProfile = {
  name: 'opencode',
  displayName: 'OpenCode',
  adapterName: 'opencode',
  pluginRootEnvVar: 'OPENCODE_PLUGIN_ROOT',
  supportedHooks: new Map([
    ['SessionStart', 'session.created'],
    ['SessionIdle', 'session.idle'],
    ['ShellEnv', 'shell.env'],
    ['PreToolUse', 'tool.execute.before'],
    ['PostToolUse', 'tool.execute.after'],
  ]),
  commandFormat: 'markdown',
  skillHandling: 'derived-from-commands',
  manifestFormat: 'plugin.json',
  hookRegistrationFormat: 'opencode',
  scriptVariants: ['javascript'],
  npmPublishable: false,
  adapterFamily: 'programmatic',
  distribution: 'npm-cli',
};
