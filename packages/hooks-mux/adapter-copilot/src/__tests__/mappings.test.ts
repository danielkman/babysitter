import { describe, it, expect } from 'vitest';
import { COPILOT_PHASE_MAPPINGS, getMappingByNativeHook, getMappingByPhase } from '../mappings';

describe('COPILOT_PHASE_MAPPINGS', () => {
  it('should cover the minimum v1 canonical phases', () => {
    const phases = COPILOT_PHASE_MAPPINGS.map((m) => m.canonicalPhase);
    expect(phases).toContain('session.start');
    expect(phases).toContain('session.end');
    expect(phases).toContain('turn.user_prompt_submitted');
    expect(phases).toContain('tool.before');
    expect(phases).toContain('tool.after');
  });

  it('should also map turn.error', () => {
    const phases = COPILOT_PHASE_MAPPINGS.map((m) => m.canonicalPhase);
    expect(phases).toContain('turn.error');
  });

  it('should only allow blocking on preToolUse', () => {
    const blockable = COPILOT_PHASE_MAPPINGS.filter((m) => m.blockCapability);
    expect(blockable).toHaveLength(1);
    expect(blockable[0].nativeHook).toBe('preToolUse');
  });

  it('should not support mutation on any event', () => {
    const mutable = COPILOT_PHASE_MAPPINGS.filter((m) => m.mutationCapability);
    expect(mutable).toHaveLength(0);
  });

  it('should have correct scopes', () => {
    const sessionMappings = COPILOT_PHASE_MAPPINGS.filter((m) => m.scope === 'session');
    expect(sessionMappings.length).toBeGreaterThanOrEqual(2);

    const toolMappings = COPILOT_PHASE_MAPPINGS.filter((m) => m.scope === 'tool');
    expect(toolMappings).toHaveLength(2); // before + after

    const turnMappings = COPILOT_PHASE_MAPPINGS.filter((m) => m.scope === 'turn');
    expect(turnMappings).toHaveLength(2); // user_prompt_submitted + error
  });
});

describe('getMappingByNativeHook', () => {
  it('should find mapping for known native hooks', () => {
    expect(getMappingByNativeHook('sessionStart')?.canonicalPhase).toBe('session.start');
    expect(getMappingByNativeHook('preToolUse')?.canonicalPhase).toBe('tool.before');
    expect(getMappingByNativeHook('postToolUse')?.canonicalPhase).toBe('tool.after');
  });

  it('should return undefined for unknown hooks', () => {
    expect(getMappingByNativeHook('nonExistentHook')).toBeUndefined();
  });
});

describe('getMappingByPhase', () => {
  it('should find mapping for known phases', () => {
    expect(getMappingByPhase('session.start')?.nativeHook).toBe('sessionStart');
    expect(getMappingByPhase('tool.before')?.nativeHook).toBe('preToolUse');
  });

  it('should return undefined for unmapped phases', () => {
    expect(getMappingByPhase('model.before_request')).toBeUndefined();
  });
});
