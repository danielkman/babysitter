/**
 * The Archive overlay (SPEC-V2 §V2-3, AC17/AC18 — as amended by SPEC-V4
 * §V4-10, AC44): full-screen parchment plate over the board. Silo cards
 * along the left edge; a deterministic SVG graph clustered BY SILO into
 * sectors with gutters and on-canvas captions (memoryLayout.ts — seed-
 * stable); nodes are brass-ringed wax seals, edges quadratic `<path>` curves
 * (NEVER <line>/<polyline>).
 *
 * §V4-10 navigation (VIEW-ONLY state — the layout never moves):
 *   wheel zoom (clamped [0.5, 2.5], toward the cursor), drag pan on empty
 *   canvas, `memory-search` box filtering/highlighting by title/id with a
 *   match count, node labels at zoom ≥1 (always on hover/focus), edge
 *   declutter below zoom 1 (intra-silo + selected/hovered incident only),
 *   and a reset-view button restoring the home transform.
 *
 * §V4-9 deep-link: `meta.archiveFocusId` focuses+selects a node when the
 * overlay opens from a Memory I/O piece.
 *
 * Testids: memory-overlay, memory-silo-<name>, memory-node-<id> (':' → '-'),
 * memory-filter-<kind>, memory-search.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import clsx from 'clsx';

import {
  ARCHIVE_HOME_VIEW,
  clientToSvg,
  edgeVisible,
  searchArchive,
  wheelZoomFactor,
  zoomAt,
  panBy,
  type ArchiveViewState,
} from '../../game/archiveView';
import {
  computeMemoryLayout,
  kindHue,
  MEMORY_VIEW,
  sanitizeNodeId,
} from '../../game/memoryLayout';
import type { CommanderStore } from '../../game/store';
import type { GraphRecord } from '../../contracts/kradle-memory';

export interface MemoryOverlayProps {
  store: CommanderStore;
}

interface PanState {
  pointerId: number;
  lastX: number;
  lastY: number;
}

export function MemoryOverlay({ store }: MemoryOverlayProps): React.JSX.Element | null {
  const open = useStore(store, (s) => s.meta.archiveOpen);
  const deepLinkId = useStore(store, (s) => s.meta.archiveFocusId);
  const memory = useStore(store, (s) => s.board.memory);
  const agents = useStore(store, (s) => s.board.agents);
  const selectionIds = useStore(store, (s) => s.selection.ids);
  const pulses = useStore(store, (s) => s.meta.memoryPulses);
  const heldByCard = useStore(store, (s) => s.board.heldByCard);
  const [filter, setFilter] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [view, setView] = useState<ArchiveViewState>(ARCHIVE_HOME_VIEW);
  const [query, setQuery] = useState('');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<PanState | null>(null);

  // Seed-deterministic silo-sector layout (§V4-10): zoom/pan NEVER touch it.
  const layout = useMemo(
    () => computeMemoryLayout(memory.records, memory.silos),
    [memory.records, memory.silos],
  );

  // Fresh navigation per open + §V4-9 deep-link focus.
  useEffect(() => {
    if (open) {
      setView(ARCHIVE_HOME_VIEW);
      setQuery('');
      setFocusId(deepLinkId);
    }
  }, [open, deepLinkId]);

  // Wheel zoom toward the cursor — native non-passive listener so
  // preventDefault sticks (clamped inside zoomAt; at the clamp the view is
  // returned UNCHANGED, AC44).
  useEffect(() => {
    const svg = svgRef.current;
    if (!open || svg === null) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const point = clientToSvg(rect, e.clientX, e.clientY, MEMORY_VIEW.width, MEMORY_VIEW.height);
      setView((v) => zoomAt(v, wheelZoomFactor(e.deltaY), point));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [open]);

  if (!open) return null;

  const recordById = new Map<string, GraphRecord>(memory.records.map((r) => [r.id, r]));
  const focus = focusId !== null ? recordById.get(focusId) : undefined;
  const siloByNode = new Map<string, string>(layout.nodes.map((n) => [n.id, n.silo]));

  // §V4-10 search: match by title or id; non-matches dim while a query runs.
  const matches = searchArchive(memory.records, query);
  const searching = query.trim().length > 0;

  // Held-piece highlighting (§V2-3): selected agents' live held pieces plus
  // the accumulated held set of selected cards (survives worker despawn).
  const heldSet = new Set<string>();
  let hasFocusEntity = false;
  for (const id of selectionIds) {
    const agent = agents[id];
    if (agent !== undefined) {
      hasFocusEntity = true;
      for (const piece of agent.heldPieces) heldSet.add(piece);
    }
    const cardHeld = heldByCard[id];
    if (cardHeld !== undefined) {
      hasFocusEntity = true;
      for (const piece of cardHeld) heldSet.add(piece);
    }
  }

  // Live pulse targets: records named by recent memory_query events.
  const pulsedRecords = new Set(pulses.flatMap((p) => p.recordIds));
  const pulsedSilos = new Set(pulses.map((p) => p.silo));

  // --- §V4-10 drag pan (view-only; never starts on a node seal) -------------
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest('[data-testid^="memory-node-"]') !== null) return;
    panRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const pan = panRef.current;
    const svg = svgRef.current;
    if (pan === null || svg === null || pan.pointerId !== e.pointerId) return;
    const rect = svg.getBoundingClientRect();
    const { scale } = clientToSvg(rect, e.clientX, e.clientY, MEMORY_VIEW.width, MEMORY_VIEW.height);
    const dx = (e.clientX - pan.lastX) / scale;
    const dy = (e.clientY - pan.lastY) / scale;
    pan.lastX = e.clientX;
    pan.lastY = e.clientY;
    setView((v) => panBy(v, dx, dy));
  };
  const endPan = (): void => {
    panRef.current = null;
  };

  return (
    <div className="wr-overlay-backdrop" data-testid="memory-overlay">
      <div className="wr-memory" role="dialog" aria-label="The Archive — Company Brain">
        <header className="wr-memory-head">
          <span className="wr-panel-title">THE ARCHIVE — COMPANY BRAIN</span>
          <span className="wr-mem-search-cell">
            <input
              type="search"
              data-testid="memory-search"
              className="wr-mem-search"
              placeholder="search the archive…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search memory records"
            />
            {searching && (
              <span className="wr-mem-matches">{matches.size} matches</span>
            )}
          </span>
          <span className="wr-memory-filters">
            <button
              type="button"
              className={clsx('wr-mem-chip', filter === null && 'is-active')}
              onClick={() => setFilter(null)}
            >
              all
            </button>
            {layout.kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                data-testid={`memory-filter-${kind}`}
                className={clsx('wr-mem-chip', filter === kind && 'is-active')}
                style={{ ['--mem-hue' as string]: String(kindHue(kind)) }}
                onClick={() => setFilter(filter === kind ? null : kind)}
              >
                {kind}
              </button>
            ))}
          </span>
          <button
            type="button"
            className="wr-mem-chip wr-mem-reset"
            onClick={() => setView(ARCHIVE_HOME_VIEW)}
          >
            RESET VIEW
          </button>
          <button type="button" className="wr-inspector-close" onClick={() => store.getState().closeArchive()}>
            CLOSE
          </button>
        </header>

        <div className="wr-memory-body">
          <aside className="wr-memory-silos">
            {memory.silos.map((silo) => (
              <div
                key={silo.name}
                data-testid={`memory-silo-${silo.name}`}
                className={clsx('wr-mem-silo', pulsedSilos.has(silo.name) && 'is-pulsing')}
              >
                <div className="wr-mem-silo-name">{silo.name}</div>
                <div className="wr-mem-silo-meta">
                  <span className="wr-mem-silo-phase">{silo.phase}</span>
                  <span className="wr-mem-silo-sha">{silo.currentCommit.slice(0, 7)}</span>
                </div>
                <div className="wr-mem-silo-meta">
                  <span>{silo.recordCount} records</span>
                  <span>{silo.owner}</span>
                </div>
                {pulsedSilos.has(silo.name) && <span className="wr-mem-pulse memory-pulse" aria-hidden />}
              </div>
            ))}
          </aside>

          <div className="wr-memory-plate">
            <svg
              ref={svgRef}
              className={clsx('wr-memory-graph', panRef.current !== null && 'is-panning')}
              viewBox={`0 0 ${MEMORY_VIEW.width} ${MEMORY_VIEW.height}`}
              role="img"
              aria-label="Unified memory graph"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPan}
              onPointerLeave={endPan}
            >
              {/* §V4-10 view transform: translate BEFORE scale (view-only). */}
              <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
                <g className="wr-mem-sectors" aria-hidden>
                  {layout.captions.map((caption) => (
                    <g key={caption.silo} className="wr-mem-sector">
                      <path
                        className="wr-mem-sector-plate"
                        d={`M ${caption.rect.x} ${caption.rect.y} h ${caption.rect.width} v ${caption.rect.height} h ${-caption.rect.width} Z`}
                        fill="none"
                      />
                      <text className="wr-mem-sector-caption" x={caption.x} y={caption.y}>
                        {caption.silo}
                      </text>
                    </g>
                  ))}
                </g>
                <g className="wr-mem-edges">
                  {layout.edges.map((edge) => {
                    const active = hoverId ?? focusId;
                    if (
                      !edgeVisible(
                        view.k,
                        siloByNode.get(edge.src) ?? '',
                        siloByNode.get(edge.dst) ?? '',
                        edge.src,
                        edge.dst,
                        [hoverId, focusId],
                      )
                    ) {
                      return null;
                    }
                    const incident =
                      active !== null && (edge.src === active || edge.dst === active);
                    return (
                      <path
                        key={edge.key}
                        className={clsx(
                          'wr-mem-edge',
                          active !== null && (incident ? 'is-incident' : 'is-faded'),
                        )}
                        d={edge.d}
                        fill="none"
                      />
                    );
                  })}
                </g>
                <g className="wr-mem-nodes">
                  {layout.nodes.map((node) => {
                    const hidden = filter !== null && node.nodeKind !== filter;
                    if (hidden) return null;
                    const held = heldSet.has(node.id);
                    const pulsed = pulsedRecords.has(node.id);
                    const matched = searching && matches.has(node.id);
                    const labelled =
                      view.k >= 1 || hoverId === node.id || focusId === node.id;
                    return (
                      <g
                        key={node.id}
                        data-testid={`memory-node-${sanitizeNodeId(node.id)}`}
                        className={clsx(
                          'wr-mem-node',
                          held && 'is-held',
                          hasFocusEntity && heldSet.size > 0 && !held && 'is-dimmed',
                          pulsed && 'is-pulsing',
                          focusId === node.id && 'is-focused',
                          matched && 'is-match',
                          searching && !matched && 'is-filtered',
                        )}
                        transform={`translate(${node.x} ${node.y})`}
                        style={{ ['--mem-hue' as string]: String(kindHue(node.nodeKind)) }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusId(node.id === focusId ? null : node.id);
                        }}
                        onMouseEnter={() => setHoverId(node.id)}
                        onMouseLeave={() => setHoverId((cur) => (cur === node.id ? null : cur))}
                      >
                        <circle className="wr-mem-node-ring" r="11.5" />
                        <circle className="wr-mem-node-dot" r="9" />
                        <circle className="wr-mem-node-gloss" cx="-2.5" cy="-3" r="3" />
                        {pulsed && <circle className="wr-mem-node-pulse memory-pulse" r="9" />}
                        {labelled && (
                          <text className="wr-mem-node-label" y="22" textAnchor="middle">
                            {node.id.split(':').pop()}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>

            {focus !== undefined && (
              <div className="wr-mem-card" data-testid="memory-node-card">
                <div className="wr-mem-card-title">{focus.attributes.title}</div>
                <div className="wr-mem-card-row">
                  <span className="wr-mem-card-kind">{focus.nodeKind}</span>
                  <span className={`wr-mem-card-status wr-mem-card-status--${focus.attributes.status}`}>
                    {focus.attributes.status}
                  </span>
                </div>
                <div className="wr-mem-card-row">
                  owners: {focus.attributes.owners.join(', ') || '—'}
                </div>
                {focus.attributes.tags !== undefined && focus.attributes.tags.length > 0 && (
                  <div className="wr-mem-card-row">tags: {focus.attributes.tags.join(', ')}</div>
                )}
                {focus.attributes.summary !== undefined && (
                  <div className="wr-mem-card-summary">{focus.attributes.summary}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
