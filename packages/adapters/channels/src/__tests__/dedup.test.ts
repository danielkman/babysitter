import { describe, it, expect } from 'vitest';
import { deriveNew, boundSeen } from '../index.js';

// SPEC §5.3 dedup.js: deriveNew(items, { idOf, seen, max }) -> { fresh, seen }.
// `fresh` = items whose derived id is NOT already in `seen`; the returned `seen`
// is the FIFO-bounded union of prior seen + the fresh ids (AC-13, AC-14).

const idOf = (it) => it.id;

describe('deriveNew (AC-13)', () => {
  it('AC-13: drops items whose id is already in seen', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const { fresh } = deriveNew(items, { idOf, seen: ['a', 'c'] });
    expect(fresh.map(idOf)).toEqual(['b']);
  });

  it('AC-13: with an empty seen, every item is fresh', () => {
    const items = [{ id: 'x' }, { id: 'y' }];
    const { fresh, seen } = deriveNew(items, { idOf, seen: [] });
    expect(fresh.map(idOf)).toEqual(['x', 'y']);
    expect(seen).toEqual(['x', 'y']);
  });

  it('AC-13: returned seen is the union of prior seen + fresh ids', () => {
    const items = [{ id: 'b' }, { id: 'c' }];
    const { seen } = deriveNew(items, { idOf, seen: ['a'] });
    expect(seen).toContain('a');
    expect(seen).toContain('b');
    expect(seen).toContain('c');
  });

  it('AC-13: two polls over an OVERLAPPING window emit no duplicates', () => {
    // First poll sees a,b. Second poll re-sees b (boundary overlap) plus a new c.
    const poll1 = [{ id: 'a' }, { id: 'b' }];
    const r1 = deriveNew(poll1, { idOf, seen: [] });
    expect(r1.fresh.map(idOf)).toEqual(['a', 'b']);

    const poll2 = [{ id: 'b' }, { id: 'c' }];
    const r2 = deriveNew(poll2, { idOf, seen: r1.seen });
    // b was already emitted last time; only c is fresh.
    expect(r2.fresh.map(idOf)).toEqual(['c']);
  });

  it('AC-13: duplicate ids within a SINGLE batch are only fresh once', () => {
    const items = [{ id: 'a' }, { id: 'a' }, { id: 'b' }];
    const { fresh } = deriveNew(items, { idOf, seen: [] });
    expect(fresh.map(idOf)).toEqual(['a', 'b']);
  });
});

describe('deriveNew — edit semantics (AC-14)', () => {
  it('AC-14: an edited item (same id) is NOT re-emitted', () => {
    // Model an edit as the same id reappearing with changed content.
    const first = [{ id: 'gh:comment:1', body: 'original' }];
    const r1 = deriveNew(first, { idOf, seen: [] });
    expect(r1.fresh).toHaveLength(1);

    const edited = [{ id: 'gh:comment:1', body: 'EDITED' }];
    const r2 = deriveNew(edited, { idOf, seen: r1.seen });
    expect(r2.fresh).toHaveLength(0);
  });

  it('AC-14: re-trigger-on-edit works when id embeds a version (id:updated_at)', () => {
    // When configured to re-trigger, the id derivation includes updated_at, so a
    // new updated_at is a genuinely new id and IS fresh.
    const versioned = (it) => `${it.id}:${it.updated_at}`;
    const first = [{ id: 'gh:comment:1', updated_at: 't1' }];
    const r1 = deriveNew(first, { idOf: versioned, seen: [] });
    expect(r1.fresh).toHaveLength(1);

    const edited = [{ id: 'gh:comment:1', updated_at: 't2' }];
    const r2 = deriveNew(edited, { idOf: versioned, seen: r1.seen });
    expect(r2.fresh).toHaveLength(1);
  });
});

describe('deriveNew — FIFO bound (AC-13)', () => {
  it('AC-13: returned seen is FIFO-bounded by max (oldest dropped)', () => {
    const seedSeen = ['s1', 's2'];
    const items = [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }];
    const { seen } = deriveNew(items, { idOf, seen: seedSeen, max: 3 });
    // Bound to 3, keeping the most-recent ids.
    expect(seen).toHaveLength(3);
    expect(seen).toEqual(['n1', 'n2', 'n3']);
    // The very newest id is always retained.
    expect(seen).toContain('n3');
  });

  it('AC-13: without max, seen grows unbounded (no pruning)', () => {
    const items = [{ id: 'n1' }, { id: 'n2' }];
    const { seen } = deriveNew(items, { idOf, seen: ['a', 'b', 'c'] });
    expect(seen).toHaveLength(5);
  });
});

describe('boundSeen — boundary protection (finding §3)', () => {
  it('plain FIFO when no keep set is given (newest retained)', () => {
    expect(boundSeen(['a', 'b', 'c', 'd', 'e'], { max: 3 })).toEqual(['c', 'd', 'e']);
  });

  it('no-op when under the bound', () => {
    expect(boundSeen(['a', 'b'], { max: 5 })).toEqual(['a', 'b']);
  });

  it('NEVER drops a kept (boundary) id even when it is the oldest', () => {
    // max=2 but 'a' is a boundary id -> it survives though it is oldest; the bound
    // then keeps the 2 most-recent non-kept ids too.
    const out = boundSeen(['a', 'b', 'c', 'd'], { max: 2, keep: ['a'] });
    expect(out).toContain('a');
    expect(out).toContain('d');
    // Result preserves original order.
    expect(out).toEqual(out.slice().sort((x, y) => ['a', 'b', 'c', 'd'].indexOf(x) - ['a', 'b', 'c', 'd'].indexOf(y)));
  });

  it('a keep set larger than max retains ALL boundary ids (soft bound)', () => {
    const out = boundSeen(['a', 'b', 'c'], { max: 1, keep: ['a', 'b', 'c'] });
    expect(out).toEqual(['a', 'b', 'c']);
  });
});

describe('deriveNew — keep is threaded into the bound (finding §3)', () => {
  it('a boundary id passed via keep is not pruned even past max', () => {
    const items = [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }];
    const { seen } = deriveNew(items, { idOf, seen: ['old1'], max: 2, keep: ['old1'] });
    // old1 protected; plus the 2 most-recent fresh ids.
    expect(seen).toContain('old1');
    expect(seen).toContain('n3');
    expect(seen).toContain('n2');
  });
});
