/**
 * OPS-VIEWS-V4 phase unit tests (SPEC-V4 §V4-6/§V4-9/§V4-10):
 *   - process-template editor rules (rename/add/remove ≥2 floor/reorder),
 *   - memory I/O selectors (ref resolution, deep-link target, strip keys),
 *   - archive view math (clamped cursor zoom, pan, search, edge declutter),
 *   - run-detail assembly (live vs sealed journal) + ledger formatting,
 *   - silo-sector memory layout (captions, gutters, determinism),
 *   - store wiring: runs overlay Esc tier + §V4-9 archive deep-link.
 */
import { describe, expect, it } from 'vitest';

import { MockBackend } from '../../backend/mock/mockBackend';
import {
  ARCHIVE_HOME_VIEW,
  ARCHIVE_ZOOM_MAX,
  ARCHIVE_ZOOM_MIN,
  clampZoom,
  clientToSvg,
  edgeVisible,
  isHomeView,
  panBy,
  searchArchive,
  wheelZoomFactor,
  zoomAt,
} from '../archiveView';
import {
  firstRecordOfSilo,
  memoryRefFor,
  totalWrittenChanges,
  uniqueReadRecordIds,
  writtenStripKeys,
} from '../memoryIO';
import { computeMemoryLayout } from '../memoryLayout';
import {
  addPhase,
  BLANK_PHASE_ERROR,
  draftError,
  movePhase,
  PHASE_FLOOR_ERROR,
  phasesValid,
  removePhase,
  renamePhase,
} from '../processEditor';
import { assembleRunDetail, runTokensTotal, shortRunId } from '../runsView';
import { bindBackendToStore, createCommanderStore } from '../store';
import type {
  SimMemoryReadEntry,
  SimMemoryWriteEntry,
  SimRunObservationView,
  SimRunView,
} from '../../backend/mock/simulation';
import type { GraphRecord } from '../../contracts/kradle-memory';

// ---------------------------------------------------------------------------
// §V4-6 process-template editor rules
// ---------------------------------------------------------------------------

describe('process editor rules (§V4-6)', () => {
  const base = ['scout', 'forge', 'temper'];

  it('renames a phase in place without touching neighbours', () => {
    expect(renamePhase(base, 1, 'calibrate-gears')).toEqual(['scout', 'calibrate-gears', 'temper']);
    expect(base).toEqual(['scout', 'forge', 'temper']); // pure
  });

  it('adds phases with unique default labels', () => {
    const once = addPhase(base);
    expect(once).toEqual([...base, 'new-phase']);
    expect(addPhase(once)).toEqual([...base, 'new-phase', 'new-phase-2']);
  });

  it('removes a phase but refuses (in character) below the floor of 2', () => {
    const removed = removePhase(base, 0);
    expect(removed).toEqual({ ok: true, phases: ['forge', 'temper'], error: null });
    const refused = removePhase(['forge', 'temper'], 1);
    expect(refused.ok).toBe(false);
    expect(refused.phases).toEqual(['forge', 'temper']);
    expect(refused.error).toBe(PHASE_FLOOR_ERROR);
  });

  it('reorders with up/down moves; out-of-range moves are identity', () => {
    expect(movePhase(base, 2, -1)).toEqual(['scout', 'temper', 'forge']);
    expect(movePhase(base, 0, 1)).toEqual(['forge', 'scout', 'temper']);
    expect(movePhase(base, 0, -1)).toEqual(base);
    expect(movePhase(base, 2, 1)).toEqual(base);
  });

  it('validates drafts: floor + non-blank labels', () => {
    expect(phasesValid(base)).toBe(true);
    expect(draftError(base)).toBeNull();
    expect(draftError(['solo'])).toBe(PHASE_FLOOR_ERROR);
    expect(draftError(['a', '  '])).toBe(BLANK_PHASE_ERROR);
    expect(phasesValid(['a', ' '])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §V4-9 memory I/O selectors
// ---------------------------------------------------------------------------

function readEntry(recordId: string, tick = 1): SimMemoryReadEntry {
  return { recordId, kind: 'doc', silo: 'product', tick, unitId: 'u-1' };
}

function writeEntry(updateId: string, silo = 'product'): SimMemoryWriteEntry {
  return {
    updateId,
    silo,
    changes: [
      { path: 'docs/a.md', action: 'update', reason: 'r' },
      { path: 'docs/b.md', action: 'add', reason: 'r' },
    ],
    phase: 'verify',
    tick: 9,
    unitId: 'u-1',
  };
}

describe('memory I/O selectors (§V4-9)', () => {
  it('prefers the card taskId over the unit id, falling back to the unit', () => {
    expect(memoryRefFor('adr-c01', 'unit-1')).toBe('adr-c01');
    expect(memoryRefFor(null, 'unit-1')).toBe('unit-1');
    expect(memoryRefFor(null, null)).toBeNull();
  });

  it('deep-links a Written piece to its target silo first record', () => {
    const silos = [
      { name: 'product', recordIds: ['doc:vision', 'doc:plan'] },
      { name: 'eng', recordIds: ['adr:0001'] },
    ];
    expect(firstRecordOfSilo(silos, 'product')).toBe('doc:vision');
    expect(firstRecordOfSilo(silos, 'eng')).toBe('adr:0001');
    expect(firstRecordOfSilo(silos, 'unknown')).toBeNull();
    expect(firstRecordOfSilo([{ name: 'empty', recordIds: [] }], 'empty')).toBeNull();
  });

  it('dedupes Read strip beads in first-seen order with a cap', () => {
    const read = [readEntry('a'), readEntry('b'), readEntry('a', 5), readEntry('c')];
    expect(uniqueReadRecordIds(read)).toEqual(['a', 'b', 'c']);
    expect(uniqueReadRecordIds(read, 2)).toEqual(['a', 'b']);
  });

  it('caps Written strip keys and sums proposed changes', () => {
    const written = [writeEntry('upd-1'), writeEntry('upd-2'), writeEntry('upd-3')];
    expect(writtenStripKeys(written, 2)).toEqual(['upd-1', 'upd-2']);
    expect(totalWrittenChanges(written)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// §V4-10 archive view math (view-only — layout untouched)
// ---------------------------------------------------------------------------

describe('archive view math (§V4-10)', () => {
  it('clamps zoom into [min, max]', () => {
    expect(clampZoom(0.01)).toBe(ARCHIVE_ZOOM_MIN);
    expect(clampZoom(99)).toBe(ARCHIVE_ZOOM_MAX);
    expect(clampZoom(1.3)).toBe(1.3);
  });

  it('wheel-up zooms in, wheel-down zooms out, symmetrically', () => {
    expect(wheelZoomFactor(-120)).toBeGreaterThan(1);
    expect(wheelZoomFactor(120)).toBeLessThan(1);
    expect(wheelZoomFactor(-120) * wheelZoomFactor(120)).toBeCloseTo(1, 10);
  });

  it('zoomAt keeps the cursor point fixed in screen space', () => {
    const point = { x: 300, y: 200 };
    const next = zoomAt(ARCHIVE_HOME_VIEW, 1.5, point);
    // The svg-space point under the cursor maps to the same place:
    // screen = tx + k * world; world under cursor before = (p - tx)/k.
    const worldBefore = { x: (point.x - ARCHIVE_HOME_VIEW.tx) / ARCHIVE_HOME_VIEW.k, y: (point.y - ARCHIVE_HOME_VIEW.ty) / ARCHIVE_HOME_VIEW.k };
    expect(next.tx + next.k * worldBefore.x).toBeCloseTo(point.x, 8);
    expect(next.ty + next.k * worldBefore.y).toBeCloseTo(point.y, 8);
  });

  it('returns the view UNCHANGED (same reference) at the clamp boundary', () => {
    let view = ARCHIVE_HOME_VIEW;
    for (let i = 0; i < 30; i += 1) view = zoomAt(view, 1.5, { x: 10, y: 10 });
    expect(view.k).toBe(ARCHIVE_ZOOM_MAX);
    const more = zoomAt(view, 1.5, { x: 500, y: 400 });
    expect(more).toBe(view); // AC44: further wheel-up must not move the view
  });

  it('pans by deltas and reports the home view', () => {
    const panned = panBy(ARCHIVE_HOME_VIEW, 90, 50);
    expect(panned).toMatchObject({ tx: 90, ty: 50, k: 1 });
    expect(isHomeView(ARCHIVE_HOME_VIEW)).toBe(true);
    expect(isHomeView(panned)).toBe(false);
    expect(panBy(panned, 0, 0)).toBe(panned);
  });

  it('maps client pixels to svg user units under meet letterboxing', () => {
    // 2400x760-px viewport for a 1200x380 viewBox: scale 2, no letterbox on x.
    const rect = { left: 100, top: 50, width: 2400, height: 760 };
    const out = clientToSvg(rect, 100 + 240, 50 + 80, 1200, 380);
    expect(out.scale).toBe(2);
    expect(out.x).toBeCloseTo(120, 8);
    expect(out.y).toBeCloseTo(40, 8);
  });

  it('searches by title or id with testid colon folding; blank query matches nothing', () => {
    const records = [
      { id: 'doc:auth', attributes: { title: 'Auth Charter' } },
      { id: 'adr:0042', attributes: { title: 'Queue selection' } },
    ];
    expect([...searchArchive(records, 'auth')]).toEqual(['doc:auth']);
    expect([...searchArchive(records, 'doc-auth')]).toEqual(['doc:auth']); // ':'→'-' folded
    expect([...searchArchive(records, 'QUEUE')]).toEqual(['adr:0042']);
    expect(searchArchive(records, '   ').size).toBe(0);
  });

  it('declutters edges below zoom 1: intra-silo or incident-to-active only', () => {
    expect(edgeVisible(1, 'a', 'b', 'n1', 'n2', [null, null])).toBe(true); // zoom ≥1: all
    expect(edgeVisible(0.6, 'a', 'a', 'n1', 'n2', [null, null])).toBe(true); // intra-silo
    expect(edgeVisible(0.6, 'a', 'b', 'n1', 'n2', [null, null])).toBe(false); // cross-silo
    expect(edgeVisible(0.6, 'a', 'b', 'n1', 'n2', ['n2', null])).toBe(true); // incident
    expect(edgeVisible(0.6, 'a', 'b', 'n1', 'n2', [null, 'n1'])).toBe(true); // incident (focus)
  });
});

// ---------------------------------------------------------------------------
// §V4-10 silo-sector layout (seed-deterministic, captions + gutters)
// ---------------------------------------------------------------------------

function record(id: string, nodeKind: string): GraphRecord {
  return {
    id,
    nodeKind,
    attributes: { title: id, status: 'approved', owners: [] },
  } as unknown as GraphRecord;
}

describe('silo-sector memory layout (§V4-10)', () => {
  const records = [
    record('doc:a', 'doc'),
    record('doc:b', 'doc'),
    record('adr:a', 'adr'),
    record('adr:b', 'adr'),
  ];
  const silos = [
    { name: 'product', recordIds: ['doc:a', 'doc:b'] },
    { name: 'eng', recordIds: ['adr:a', 'adr:b'] },
  ];

  it('clusters records into per-silo sectors with on-canvas captions', () => {
    const layout = computeMemoryLayout(records, silos);
    expect(layout.captions.map((c) => c.silo)).toEqual(['product', 'eng']);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const silo of silos) {
      const caption = layout.captions.find((c) => c.silo === silo.name)!;
      for (const id of silo.recordIds) {
        const node = byId.get(id)!;
        expect(node.silo).toBe(silo.name);
        expect(node.x).toBeGreaterThanOrEqual(caption.rect.x);
        expect(node.x).toBeLessThanOrEqual(caption.rect.x + caption.rect.width);
        expect(node.y).toBeGreaterThanOrEqual(caption.rect.y);
        expect(node.y).toBeLessThanOrEqual(caption.rect.y + caption.rect.height);
      }
    }
  });

  it('keeps clear gutters between sector rects', () => {
    const layout = computeMemoryLayout(records, silos);
    const [a, b] = layout.captions.map((c) => c.rect);
    const overlapX = Math.max(0, Math.min(a!.x + a!.width, b!.x + b!.width) - Math.max(a!.x, b!.x));
    const overlapY = Math.max(0, Math.min(a!.y + a!.height, b!.y + b!.height) - Math.max(a!.y, b!.y));
    expect(overlapX === 0 || overlapY === 0).toBe(true); // disjoint sectors
  });

  it('is byte-stable for the same records + silos (zoom/pan never touch it)', () => {
    const one = computeMemoryLayout(records, silos);
    const two = computeMemoryLayout(records, silos);
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
  });

  it('gathers unassigned records into a trailing archive sector', () => {
    const layout = computeMemoryLayout([...records, record('misc:x', 'note')], silos);
    const misc = layout.nodes.find((n) => n.id === 'misc:x')!;
    expect(misc.silo).toBe('archive');
    expect(layout.captions.some((c) => c.silo === 'archive')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §V4-6 run-detail assembly + ledger formatting
// ---------------------------------------------------------------------------

function runView(runId: string): SimRunView {
  return {
    runId,
    taskId: 'adr-c01',
    taskKind: 'fix',
    processId: 'commander/fix@v1',
    processRevision: 1,
    observedState: 'waiting',
    phases: [
      { label: 'scout', status: 'done' },
      { label: 'forge', status: 'current' },
    ],
    pendingEffectsByKind: { breakpoint: 1 },
    tokens: { inputTokens: 100, outputTokens: 40, thinkingTokens: 10, cachedTokens: 500 },
    costUsd: 0.42,
    startedAt: 1_000,
    endedAt: null,
  };
}

function observation(runId: string): SimRunObservationView {
  return {
    runId,
    taskId: 'adr-c01',
    observedState: 'waiting',
    pendingEffectsByKind: { breakpoint: 1 },
    phases: [{ label: 'scout', status: 'done' }],
    journal: [
      { seq: 1, ulid: '01A', type: 'RUN_CREATED', recordedAt: 1_000, data: {} },
      { seq: 2, ulid: '01B', type: 'EFFECT_REQUESTED', recordedAt: 1_100, data: { label: 'forge' } },
    ],
  };
}

describe('run-detail assembly (§V4-6)', () => {
  it('joins the live journal when the observation describes the same run', () => {
    const detail = assembleRunDetail(runView('run-7'), observation('run-7'));
    expect(detail.journalLive).toBe(true);
    expect(detail.journal.map((e) => e.type)).toEqual(['RUN_CREATED', 'EFFECT_REQUESTED']);
  });

  it('seals the journal for older attempts (observation owns a newer run)', () => {
    const detail = assembleRunDetail(runView('run-7'), observation('run-8'));
    expect(detail.journalLive).toBe(false);
    expect(detail.journal).toEqual([]);
    expect(assembleRunDetail(runView('run-7'), null).journalLive).toBe(false);
  });

  it('formats the ledger columns: short run ids and token totals (cache excluded)', () => {
    expect(shortRunId('run-000000000042')).toBe('run-00000000…');
    expect(shortRunId('run-42')).toBe('run-42');
    expect(runTokensTotal(runView('run-7'))).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Store wiring: runs overlay Esc tier (§V4-6/§V4-13) + archive deep-link (§V4-9)
// ---------------------------------------------------------------------------

describe('store wiring (§V4-6/§V4-9)', () => {
  function makeRig() {
    const backend = new MockBackend({ seed: 42, autoStart: false });
    const store = createCommanderStore();
    const binding = bindBackendToStore(store, backend);
    binding.flush();
    return { backend, store, orders: binding.orders };
  }

  it('opens/closes the runs overlay and Esc closes it at the top tier', () => {
    const { store } = makeRig();
    store.getState().openRuns();
    store.getState().openReview('adr-c01');
    expect(store.getState().meta.runsOpen).toBe(true);
    store.getState().escape();
    expect(store.getState().meta.runsOpen).toBe(false);
    // The review panel survives the runs-overlay Esc (cascade order).
    expect(store.getState().meta.reviewTaskId).toBe('adr-c01');
  });

  it('guards M/N surfaces: runsOpen joins the modal tier flags', () => {
    const { store } = makeRig();
    store.getState().openRuns();
    expect(store.getState().meta.foundryOpen).toBe(false);
    expect(store.getState().meta.archiveOpen).toBe(false);
  });

  it('openArchiveAt focuses the archive on a record and closes the inspector (§V4-9)', () => {
    const { store } = makeRig();
    store.getState().openInspectorCard('adr-c01');
    store.getState().openArchiveAt('doc:vision');
    const meta = store.getState().meta;
    expect(meta.archiveOpen).toBe(true);
    expect(meta.archiveFocusId).toBe('doc:vision');
    expect(meta.inspectorTaskId).toBeNull();
    expect(meta.inspectorUnitId).toBeNull();
    // A plain open/close clears the pending deep-link.
    store.getState().closeArchive();
    expect(store.getState().meta.archiveFocusId).toBeNull();
  });

  it('routes orders.updateProcessTemplate to the sim: revision bump, future runs only', () => {
    const { backend, orders } = makeRig();
    const before = backend.sim.listProcessTemplates().find((t) => t.kind === 'fix')!;
    const revision = orders.updateProcessTemplate('fix', ['calibrate-gears', ...before.phases.slice(1)]);
    expect(revision).toBe(before.revision + 1);
    const after = backend.sim.listProcessTemplates().find((t) => t.kind === 'fix')!;
    expect(after.revision).toBe(before.revision + 1);
    expect(after.phases[0]).toBe('calibrate-gears');
    expect(after.processId).toBe(`commander/fix@v${after.revision}`);
  });

  it('memory tab refs resolve against the live sim getMemoryIO view', () => {
    const { backend } = makeRig();
    const io = backend.sim.getMemoryIO('adr-c01');
    expect(Array.isArray(io.read)).toBe(true);
    expect(Array.isArray(io.written)).toBe(true);
  });
});
