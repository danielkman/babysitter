import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POSTURES,
  getPostureForCategory,
  resolvePostureFromBreakpointId,
} from '../postures';
import type { ActionCategory } from '../types';

describe('GAP-SEC-005: Approval Posture Model', () => {
  describe('DEFAULT_POSTURES', () => {
    it('has entries for all six action categories', () => {
      const categories: ActionCategory[] = ['read', 'write', 'execute', 'destroy', 'network', 'auth'];
      for (const cat of categories) {
        expect(DEFAULT_POSTURES[cat]).toBeDefined();
        expect(DEFAULT_POSTURES[cat].name).toBeTruthy();
      }
    });

    it('read posture is permissive', () => {
      const p = DEFAULT_POSTURES['read'];
      expect(p.name).toBe('permissive');
      expect(p.allowAutoApprove).toBe(true);
      expect(p.minConsecutiveApprovalsForAutoN).toBe(0);
      expect(p.requireExplicitRule).toBe(false);
    });

    it('write posture is cautious', () => {
      const p = DEFAULT_POSTURES['write'];
      expect(p.name).toBe('cautious');
      expect(p.allowAutoApprove).toBe(true);
      expect(p.minConsecutiveApprovalsForAutoN).toBe(3);
      expect(p.requireExplicitRule).toBe(false);
    });

    it('execute posture is guarded', () => {
      const p = DEFAULT_POSTURES['execute'];
      expect(p.name).toBe('guarded');
      expect(p.allowAutoApprove).toBe(true);
      expect(p.minConsecutiveApprovalsForAutoN).toBe(5);
      expect(p.requireExplicitRule).toBe(true);
    });

    it('destroy posture is locked — no auto-approve', () => {
      const p = DEFAULT_POSTURES['destroy'];
      expect(p.name).toBe('locked');
      expect(p.allowAutoApprove).toBe(false);
      expect(p.minConsecutiveApprovalsForAutoN).toBe(-1);
      expect(p.requireExplicitRule).toBe(true);
      expect(p.requiredApproverLevel).toBe('owner');
    });

    it('network posture matches write (cautious)', () => {
      const p = DEFAULT_POSTURES['network'];
      expect(p.name).toBe('cautious');
      expect(p.allowAutoApprove).toBe(true);
      expect(p.minConsecutiveApprovalsForAutoN).toBe(3);
    });

    it('auth posture is locked — no auto-approve', () => {
      const p = DEFAULT_POSTURES['auth'];
      expect(p.name).toBe('locked');
      expect(p.allowAutoApprove).toBe(false);
      expect(p.requiredApproverLevel).toBe('owner');
    });

    it('safety ladder order: read < write < execute < destroy', () => {
      expect(DEFAULT_POSTURES['read'].minConsecutiveApprovalsForAutoN)
        .toBeLessThan(DEFAULT_POSTURES['write'].minConsecutiveApprovalsForAutoN);
      expect(DEFAULT_POSTURES['write'].minConsecutiveApprovalsForAutoN)
        .toBeLessThan(DEFAULT_POSTURES['execute'].minConsecutiveApprovalsForAutoN);
      // destroy disables autoN entirely (-1)
      expect(DEFAULT_POSTURES['destroy'].minConsecutiveApprovalsForAutoN).toBe(-1);
    });
  });

  describe('getPostureForCategory', () => {
    it('returns base posture when no overrides', () => {
      const posture = getPostureForCategory('read');
      expect(posture).toEqual(DEFAULT_POSTURES['read']);
    });

    it('merges overrides into base posture', () => {
      const posture = getPostureForCategory('read', { allowAutoApprove: false });
      expect(posture.name).toBe('permissive'); // base preserved
      expect(posture.allowAutoApprove).toBe(false); // overridden
      expect(posture.minConsecutiveApprovalsForAutoN).toBe(0); // base preserved
    });

    it('override does not mutate DEFAULT_POSTURES', () => {
      getPostureForCategory('write', { minConsecutiveApprovalsForAutoN: 99 });
      expect(DEFAULT_POSTURES['write'].minConsecutiveApprovalsForAutoN).toBe(3);
    });

    it('empty overrides return base posture unchanged', () => {
      const posture = getPostureForCategory('execute', {});
      expect(posture).toEqual(DEFAULT_POSTURES['execute']);
    });
  });

  describe('resolvePostureFromBreakpointId', () => {
    it('resolves read prefix', () => {
      expect(resolvePostureFromBreakpointId('read.file-contents')).toBe('read');
    });

    it('resolves write prefix', () => {
      expect(resolvePostureFromBreakpointId('write.config-update')).toBe('write');
    });

    it('resolves exec prefix to execute', () => {
      expect(resolvePostureFromBreakpointId('exec.npm-install')).toBe('execute');
    });

    it('resolves execute prefix', () => {
      expect(resolvePostureFromBreakpointId('execute.shell-cmd')).toBe('execute');
    });

    it('resolves destroy prefix', () => {
      expect(resolvePostureFromBreakpointId('destroy.important-files')).toBe('destroy');
    });

    it('resolves delete prefix to destroy', () => {
      expect(resolvePostureFromBreakpointId('delete.branch')).toBe('destroy');
    });

    it('resolves net prefix to network', () => {
      expect(resolvePostureFromBreakpointId('net.outbound-call')).toBe('network');
    });

    it('resolves network prefix', () => {
      expect(resolvePostureFromBreakpointId('network.webhook')).toBe('network');
    });

    it('resolves auth prefix', () => {
      expect(resolvePostureFromBreakpointId('auth.token-refresh')).toBe('auth');
    });

    it('resolves cred prefix to auth', () => {
      expect(resolvePostureFromBreakpointId('cred.rotate-key')).toBe('auth');
    });

    it('returns undefined for unknown prefix', () => {
      expect(resolvePostureFromBreakpointId('confirm.star-repo')).toBeUndefined();
    });

    it('returns undefined for no-dot ID', () => {
      expect(resolvePostureFromBreakpointId('standalone')).toBeUndefined();
    });
  });
});
