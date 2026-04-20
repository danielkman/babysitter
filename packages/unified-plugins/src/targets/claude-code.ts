// Claude Code target profile

import type { TargetProfile } from '../types.js';

export const CLAUDE_CODE_PROFILE: TargetProfile = {
  name: 'claude-code',
  displayName: 'Claude Code',
  adapterName: 'claude',
  pluginRootEnvVar: 'CLAUDE_PLUGIN_ROOT',
  supportedHooks: new Map([
    ['SessionStart', 'SessionStart'],
    ['Stop', 'Stop'],
    ['UserPromptSubmit', 'UserPromptSubmit'],
    ['PreToolUse', 'PreToolUse'],
    ['PostToolUse', 'PostToolUse'],
    ['SubagentStop', 'SubagentStop'],
    ['Notification', 'Notification'],
    ['PreCompact', 'PreCompact'],
  ]),
  commandFormat: 'markdown',
  skillHandling: 'native',
  manifestFormat: 'plugin.json',
  hookRegistrationFormat: 'claude-code',
  scriptVariants: ['bash'],
  npmPublishable: false,
  adapterFamily: 'shell-hook',
  distribution: 'marketplace',
  marketplacePath: '.claude-plugin/marketplace.json',
};
