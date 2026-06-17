import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore, MemoryStateStore } from '../index.js';

// SPEC §3 state.js: persist { cursor, seen[] } per source as JSON (atomic write).
// get(id) defaults to { cursor:null, seen:[] }; seen is FIFO-bounded by
// maxSeenPerSource. MemoryStateStore is the in-memory pluggable variant (AC-12).

describe('MemoryStateStore (AC-12)', () => {
  it('AC-12: get() of an unknown id returns the default empty state', () => {
    const store = new MemoryStateStore();
    expect(store.get('nope')).toEqual({ cursor: null, seen: [] });
  });

  it('AC-12: set() then get() round-trips cursor + seen', async () => {
    const store = new MemoryStateStore();
    await store.set('s1', { cursor: '2026-06-16T10:00:00Z', seen: ['a', 'b'] });
    expect(store.get('s1')).toEqual({ cursor: '2026-06-16T10:00:00Z', seen: ['a', 'b'] });
  });

  it('AC-12: per-id isolation — distinct sources keep distinct state', async () => {
    const store = new MemoryStateStore();
    await store.set('s1', { cursor: 'c1', seen: ['x'] });
    await store.set('s2', { cursor: 'c2', seen: ['y'] });
    expect(store.get('s1').cursor).toBe('c1');
    expect(store.get('s2').cursor).toBe('c2');
  });
});

describe('StateStore (file-backed) (AC-12)', () => {
  let dir;
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcp-channels-state-'));
    store = new StateStore({ dir, maxSeenPerSource: 3 });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC-12: get() of an unknown id returns the default empty state', () => {
    expect(store.get('unknown-source')).toEqual({ cursor: null, seen: [] });
  });

  it('AC-12: cursor persists across set -> get (and to a fresh store on same dir)', async () => {
    await store.set('gh', { cursor: '2026-06-16T12:00:00Z', seen: ['gh:comment:1'] });
    expect(store.get('gh').cursor).toBe('2026-06-16T12:00:00Z');

    // A brand new StateStore over the same dir must read the persisted cursor:
    // this is the "persists across runs" guarantee.
    const reopened = new StateStore({ dir, maxSeenPerSource: 3 });
    const persisted = reopened.get('gh');
    expect(persisted.cursor).toBe('2026-06-16T12:00:00Z');
    expect(persisted.seen).toContain('gh:comment:1');
  });

  it('AC-12: writes a JSON file (atomic write leaves no temp turds)', async () => {
    await store.set('gh', { cursor: 'c', seen: [] });
    const files = readdirSync(dir);
    // At least one persisted file exists; no leftover *.tmp partial files.
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
    expect(existsSync(dir)).toBe(true);
  });

  it('AC-12: seen is FIFO-bounded at maxSeenPerSource (oldest dropped)', async () => {
    // maxSeenPerSource = 3; push 5 ids, expect only the LAST 3 retained in order.
    await store.set('gh', { cursor: 'c', seen: ['a', 'b', 'c', 'd', 'e'] });
    const got = store.get('gh');
    expect(got.seen).toHaveLength(3);
    expect(got.seen).toEqual(['c', 'd', 'e']);
  });
});
