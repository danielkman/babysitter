// Target registry and hook name mapping

import type { TargetProfile } from '../types.js';
import { CLAUDE_CODE_PROFILE } from './claude-code.js';
import { CODEX_PROFILE } from './codex.js';
import { CURSOR_PROFILE } from './cursor.js';
import { GEMINI_PROFILE } from './gemini.js';
import { GITHUB_COPILOT_PROFILE } from './github-copilot.js';
import { PI_PROFILE } from './pi.js';
import { OH_MY_PI_PROFILE } from './oh-my-pi.js';
import { OPENCODE_PROFILE } from './opencode.js';
import { OPENCLAW_PROFILE } from './openclaw.js';

export const TARGET_REGISTRY: Record<string, TargetProfile> = {
  'claude-code': CLAUDE_CODE_PROFILE,
  codex: CODEX_PROFILE,
  cursor: CURSOR_PROFILE,
  gemini: GEMINI_PROFILE,
  'github-copilot': GITHUB_COPILOT_PROFILE,
  pi: PI_PROFILE,
  'oh-my-pi': OH_MY_PI_PROFILE,
  opencode: OPENCODE_PROFILE,
  openclaw: OPENCLAW_PROFILE,
};

export const HOOK_NAME_MAP: Record<string, Record<string, string>> = {
  SessionStart: {
    'claude-code': 'SessionStart',
    codex: 'SessionStart',
    cursor: 'sessionStart',
    gemini: 'SessionStart',
    'github-copilot': 'sessionStart',
    opencode: 'session.created',
    openclaw: 'session_start',
  },
  Stop: {
    'claude-code': 'Stop',
    codex: 'Stop',
    cursor: 'stop',
  },
  UserPromptSubmit: {
    'claude-code': 'UserPromptSubmit',
    codex: 'UserPromptSubmit',
    'github-copilot': 'userPromptSubmitted',
  },
  PreToolUse: {
    'claude-code': 'PreToolUse',
    opencode: 'tool.execute.before',
  },
  PostToolUse: {
    'claude-code': 'PostToolUse',
    opencode: 'tool.execute.after',
  },
  AfterAgent: {
    gemini: 'AfterAgent',
    openclaw: 'agent_end',
  },
  SessionEnd: {
    'github-copilot': 'sessionEnd',
    openclaw: 'session_end',
  },
  SessionIdle: {
    opencode: 'session.idle',
  },
  ShellEnv: {
    opencode: 'shell.env',
  },
  BeforePromptBuild: {
    openclaw: 'before_prompt_build',
  },
};

export function getTargetProfile(name: string): TargetProfile | null {
  return TARGET_REGISTRY[name] || null;
}

export function getAllTargets(): string[] {
  return Object.keys(TARGET_REGISTRY);
}
