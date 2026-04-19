// OpenClaw target profile

import type { TargetProfile } from '../types.js';

export const OPENCLAW_PROFILE: TargetProfile = {
  name: 'openclaw',
  displayName: 'OpenClaw',
  adapterName: 'openclaw',
  pluginRootEnvVar: null,
  supportedHooks: new Map([
    ['SessionStart', 'session_start'],
    ['SessionEnd', 'session_end'],
    ['AfterAgent', 'agent_end'],
    ['BeforePromptBuild', 'before_prompt_build'],
  ]),
  commandFormat: 'markdown',
  skillHandling: 'native',
  manifestFormat: 'multiple', // plugin.json + openclaw.plugin.json
  hookRegistrationFormat: 'openclaw',
  scriptVariants: ['bash', 'typescript'],
  npmPublishable: false,
  adapterFamily: 'programmatic',
  distribution: 'npm-cli',
};
