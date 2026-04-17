import { describe, it, expect } from 'vitest';
import { createAdapter } from '../adapter';

describe('createAdapter', () => {
  const caps = createAdapter();

  it('returns shell-hook family', () => {
    expect(caps.family).toBe('shell-hook');
  });

  it('has derived sessionIdQuality', () => {
    expect(caps.sessionIdQuality).toBe('derived');
  });

  it('supports limited blocking but not ask', () => {
    expect(caps.supportsBlock).toBe(true);
    expect(caps.supportsAsk).toBe(false);
  });

  it('does not support tool input or result mutation', () => {
    expect(caps.supportsToolInputMutation).toBe(false);
    expect(caps.supportsToolResultMutation).toBe(false);
  });

  it('does not support persisted env', () => {
    expect(caps.supportsPersistedEnv).toBe(false);
  });

  it('uses wrapper_only env persistence', () => {
    expect(caps.envPersistenceMode).toBe('wrapper_only');
  });

  it('has partial_shell_only tool interception scope', () => {
    expect(caps.toolInterceptionScope).toBe('partial_shell_only');
  });

  it('includes experimental note', () => {
    expect(caps.notes).toContain('experimental');
  });

  it('documents hook surface variability', () => {
    expect(caps.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('varies between IDE and CLI'),
      ]),
    );
  });

  it('documents capability profile instability', () => {
    expect(caps.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('capability profile may change'),
      ]),
    );
  });
});
