import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActiveProfile,
  setActiveProfile,
  resetProfile,
  isEventReliable,
  isEventKnown,
  getEventDiagnostics,
  DEFAULT_PROFILE,
  CLI_PERMISSIVE_PROFILE,
} from '../capability-profile';

beforeEach(() => {
  resetProfile();
});

describe('DEFAULT_PROFILE', () => {
  it('is named default-conservative', () => {
    expect(DEFAULT_PROFILE.name).toBe('default-conservative');
  });

  it('has unknown mode', () => {
    expect(DEFAULT_PROFILE.mode).toBe('unknown');
  });

  it('lists sessionStart and stop as reliable', () => {
    expect(DEFAULT_PROFILE.reliableEvents).toContain('sessionStart');
    expect(DEFAULT_PROFILE.reliableEvents).toContain('stop');
  });

  it('lists tool hooks as unreliable', () => {
    expect(DEFAULT_PROFILE.unreliableEvents).toContain('preToolUse');
    expect(DEFAULT_PROFILE.unreliableEvents).toContain('postToolUse');
  });

  it('has tool hooks disabled', () => {
    expect(DEFAULT_PROFILE.toolHooksAvailable).toBe(false);
  });
});

describe('CLI_PERMISSIVE_PROFILE', () => {
  it('is named cli-permissive', () => {
    expect(CLI_PERMISSIVE_PROFILE.name).toBe('cli-permissive');
  });

  it('has cli mode', () => {
    expect(CLI_PERMISSIVE_PROFILE.mode).toBe('cli');
  });

  it('has tool hooks available', () => {
    expect(CLI_PERMISSIVE_PROFILE.toolHooksAvailable).toBe(true);
  });
});

describe('getActiveProfile / setActiveProfile / resetProfile', () => {
  it('defaults to DEFAULT_PROFILE', () => {
    const profile = getActiveProfile();
    expect(profile.name).toBe('default-conservative');
  });

  it('allows overriding the active profile', () => {
    setActiveProfile(CLI_PERMISSIVE_PROFILE);
    expect(getActiveProfile().name).toBe('cli-permissive');
  });

  it('resets to default', () => {
    setActiveProfile(CLI_PERMISSIVE_PROFILE);
    resetProfile();
    expect(getActiveProfile().name).toBe('default-conservative');
  });

  it('makes a copy when setting (does not share reference)', () => {
    const custom = { ...CLI_PERMISSIVE_PROFILE, name: 'custom' };
    setActiveProfile(custom);
    custom.name = 'mutated';
    expect(getActiveProfile().name).toBe('custom');
  });
});

describe('isEventReliable', () => {
  it('returns true for reliable events', () => {
    expect(isEventReliable('sessionStart')).toBe(true);
    expect(isEventReliable('stop')).toBe(true);
  });

  it('returns false for unreliable events', () => {
    expect(isEventReliable('preToolUse')).toBe(false);
  });

  it('returns false for unknown events', () => {
    expect(isEventReliable('SomeFutureEvent')).toBe(false);
  });
});

describe('isEventKnown', () => {
  it('returns true for reliable events', () => {
    expect(isEventKnown('sessionStart')).toBe(true);
  });

  it('returns true for unreliable events', () => {
    expect(isEventKnown('preToolUse')).toBe(true);
  });

  it('returns false for completely unknown events', () => {
    expect(isEventKnown('SomeFutureEvent')).toBe(false);
  });
});

describe('getEventDiagnostics', () => {
  it('returns no warnings for reliable events (except mode)', () => {
    const diag = getEventDiagnostics('sessionStart');
    expect(diag.isReliable).toBe(true);
    expect(diag.isKnown).toBe(true);
    // mode=unknown warning should still be present
    expect(diag.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('mode (IDE vs CLI) is unknown'),
      ]),
    );
  });

  it('warns about unreliable events', () => {
    const diag = getEventDiagnostics('preToolUse');
    expect(diag.isReliable).toBe(false);
    expect(diag.isKnown).toBe(true);
    expect(diag.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unreliable'),
      ]),
    );
  });

  it('warns about completely unknown events', () => {
    const diag = getEventDiagnostics('SomeFutureEvent');
    expect(diag.isReliable).toBe(false);
    expect(diag.isKnown).toBe(false);
    expect(diag.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('not recognized'),
      ]),
    );
  });

  it('includes profile name and mode', () => {
    const diag = getEventDiagnostics('sessionStart');
    expect(diag.profileName).toBe('default-conservative');
    expect(diag.mode).toBe('unknown');
  });

  it('reflects overridden profile', () => {
    setActiveProfile(CLI_PERMISSIVE_PROFILE);
    const diag = getEventDiagnostics('sessionStart');
    expect(diag.profileName).toBe('cli-permissive');
    expect(diag.mode).toBe('cli');
    // No mode-unknown warning when mode is known
    const modeWarnings = diag.warnings.filter((w) => w.includes('mode (IDE vs CLI)'));
    expect(modeWarnings).toHaveLength(0);
  });
});
