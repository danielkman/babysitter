/**
 * Microagent tests (SPEC §8): same id ⇒ byte-identical SVG; command sets per
 * selection state; mixed selections get the intersection; always ≤12.
 */
import { describe, expect, it } from 'vitest';

import type { CommandContext } from '../../types';
import { generateCommands } from '../commandGen';
import { generateIcon } from '../iconGen';

function ctx(partial: Partial<CommandContext['selection']>, fleet?: Partial<CommandContext['fleet']>): CommandContext {
  return {
    selection: {
      count: 0,
      kinds: [],
      states: [],
      adapters: [],
      taskStates: [],
      ...partial,
    },
    alerts: [],
    fleet: {
      totalUnits: 12,
      idleUnits: 4,
      busyUnits: 8,
      pendingAlerts: 0,
      simPaused: false,
      ...fleet,
    },
  };
}

describe('generateIcon determinism (AC12)', () => {
  it('same id ⇒ byte-identical SVG', () => {
    const a = generateIcon({ entityId: 'u01-vanguard', kind: 'unit', adapter: 'claude-code' });
    const b = generateIcon({ entityId: 'u01-vanguard', kind: 'unit', adapter: 'claude-code' });
    expect(a.svg).toBe(b.svg);
    expect(a.svg.startsWith('<svg')).toBe(true);
  });

  it('different ids ⇒ different SVGs; palette keyed by adapter', () => {
    const a = generateIcon({ entityId: 'u01-vanguard', kind: 'unit', adapter: 'claude-code' });
    const b = generateIcon({ entityId: 'u02-specter', kind: 'unit', adapter: 'claude-code' });
    expect(a.svg).not.toBe(b.svg);
    expect(a.palette).toEqual(b.palette);
    const c = generateIcon({ entityId: 'u01-vanguard', kind: 'unit', adapter: 'codex' });
    expect(c.palette).not.toEqual(a.palette);
  });

  it('never emits line/polyline elements (link-layer counting contract)', () => {
    for (const id of ['u01-a', 'u02-b', 'u03-c', 'u04-d', 'u05-e', 'u06-f', 'u07-g', 'u08-h']) {
      const unit = generateIcon({ entityId: id, kind: 'unit', adapter: 'pi' });
      const task = generateIcon({ entityId: id, kind: 'task', taskKind: 'bug-fix' });
      expect(unit.svg).not.toMatch(/<(line|polyline)\b/);
      expect(task.svg).not.toMatch(/<(line|polyline)\b/);
    }
  });
});

describe('generateCommands (SPEC §8)', () => {
  it('empty selection → global set', () => {
    const specs = generateCommands(ctx({}));
    const ids = specs.map((s) => s.id);
    expect(ids).toContain('select-all-idle');
    expect(ids).toContain('jump-to-alert');
    expect(ids).toContain('toggle-sim');
    expect(specs.length).toBeLessThanOrEqual(12);
  });

  it('idle units → Dispatch/Rally/Clone/Retire', () => {
    const specs = generateCommands(ctx({ count: 2, kinds: ['unit'], states: ['idle'] }));
    expect(specs.map((s) => s.label)).toEqual(['Dispatch…', 'Rally', 'Clone', 'Retire']);
  });

  it('working units → Steer/Pause/Inspect/Abort', () => {
    const specs = generateCommands(ctx({ count: 1, kinds: ['unit'], states: ['tool_running'] }));
    expect(specs.map((s) => s.id)).toEqual(['steer', 'pause-unit', 'inspect', 'abort']);
  });

  it('awaiting_approval → Approve/Deny/Inspect', () => {
    const specs = generateCommands(ctx({ count: 1, kinds: ['unit'], states: ['awaiting_approval'] }));
    expect(specs.map((s) => s.id)).toEqual(['approve', 'deny', 'inspect']);
  });

  it('mixed unit states → intersection by command id', () => {
    const specs = generateCommands(
      ctx({ count: 2, kinds: ['unit'], states: ['awaiting_approval', 'thinking'] }),
    );
    expect(specs.map((s) => s.id)).toEqual(['inspect']);
  });

  it('task selection → Assign Best Idle/Prioritize/Cancel; gated on idle availability', () => {
    const specs = generateCommands(ctx({ count: 1, kinds: ['task'], taskStates: ['queued'] }));
    expect(specs.map((s) => s.id)).toEqual(['assign-best-idle', 'prioritize', 'cancel-task']);
    const noIdle = generateCommands(
      ctx({ count: 1, kinds: ['task'], taskStates: ['queued'] }, { idleUnits: 0 }),
    );
    expect(noIdle.find((s) => s.id === 'assign-best-idle')?.enabled).toBe(false);
  });

  it('paused sim flips the toggle label', () => {
    const specs = generateCommands(ctx({}, { simPaused: true }));
    expect(specs.find((s) => s.id === 'toggle-sim')?.label).toBe('Resume Sim');
  });
});
