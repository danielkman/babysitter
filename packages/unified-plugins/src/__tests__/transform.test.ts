// Tests for transformation stage

import { describe, it, expect } from 'vitest';
import { generateBashHookScript } from '../hookTemplates';
import { CLAUDE_CODE_PROFILE } from '../targets/claude-code';

describe('generateBashHookScript', () => {
  it('should generate a bash hook script with correct placeholders', () => {
    const script = generateBashHookScript('SessionStart', 'SessionStart', CLAUDE_CODE_PROFILE);

    expect(script).toContain('#!/bin/bash');
    expect(script).toContain('Unified Session Start Hook for Claude Code');
    expect(script).toContain('--adapter claude');
    expect(script).toContain('--hook-type session-start');
    expect(script).toContain('CLAUDE_PLUGIN_ROOT');
  });

  it('should handle different hook types', () => {
    const script = generateBashHookScript('PreToolUse', 'PreToolUse', CLAUDE_CODE_PROFILE);

    expect(script).toContain('Unified Pre Tool Use Hook for Claude Code');
    expect(script).toContain('--hook-type pre-tool-use');
  });
});
