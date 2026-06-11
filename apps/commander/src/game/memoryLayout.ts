/**
 * Deterministic radial layout for the Archive overlay graph (SPEC-V2 §V2-3).
 * Pure: same records ⇒ same positions, byte-stable. Nodes cluster by
 * nodeKind around a circle; edges render as quadratic `<path>` curves (NEVER
 * <line>/<polyline> — AC24/AC33 census rule).
 */

import type { GraphRecord } from '../contracts/kradle-memory';

export const MEMORY_VIEW = { width: 1200, height: 760 } as const;

export interface MemoryNodePosition {
  id: string;
  nodeKind: string;
  x: number;
  y: number;
}

export interface MemoryEdgePath {
  /** `<edgeKind>:<sourceId>-><targetId>` (unique, deterministic). */
  key: string;
  edgeKind: string;
  d: string;
}

export interface MemoryLayout {
  nodes: MemoryNodePosition[];
  edges: MemoryEdgePath[];
  /** nodeKinds present, sorted (filter chip order). */
  kinds: string[];
}

/** Sanitize a record id for testids (§V2-3: ':' → '-'). */
export function sanitizeNodeId(id: string): string {
  return id.replace(/:/g, '-');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Quadratic curve between two points, bowed toward the plate center. */
export function edgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const cx = MEMORY_VIEW.width / 2;
  const cy = MEMORY_VIEW.height / 2;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  // Pull the control point 22% toward the center for a gentle engraving bow.
  const qx = mx + (cx - mx) * 0.22;
  const qy = my + (cy - my) * 0.22;
  return `M ${round(from.x)} ${round(from.y)} Q ${round(qx)} ${round(qy)} ${round(to.x)} ${round(to.y)}`;
}

/**
 * Cluster records by nodeKind into angular sectors; within a sector, fan the
 * records across two alternating radii. Deterministic for a given record set
 * (records sorted by id inside kind; kinds sorted).
 */
export function computeMemoryLayout(records: readonly GraphRecord[]): MemoryLayout {
  const kinds = [...new Set(records.map((r) => r.nodeKind))].sort();
  const byKind = new Map<string, GraphRecord[]>();
  for (const kind of kinds) {
    byKind.set(
      kind,
      records.filter((r) => r.nodeKind === kind).sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
  }

  const cx = MEMORY_VIEW.width / 2;
  const cy = MEMORY_VIEW.height / 2;
  const baseRadius = Math.min(cx, cy) - 120;
  const nodes: MemoryNodePosition[] = [];
  const positions = new Map<string, MemoryNodePosition>();

  const sectorSpan = (2 * Math.PI) / Math.max(1, kinds.length);
  kinds.forEach((kind, kindIndex) => {
    const members = byKind.get(kind) ?? [];
    const sectorStart = kindIndex * sectorSpan;
    members.forEach((record, i) => {
      const t = members.length === 1 ? 0.5 : i / (members.length - 1);
      const angle = sectorStart + sectorSpan * (0.12 + 0.76 * t);
      const radius = baseRadius * (i % 2 === 0 ? 0.78 : 1);
      const node: MemoryNodePosition = {
        id: record.id,
        nodeKind: kind,
        x: round(cx + Math.cos(angle) * radius),
        y: round(cy + Math.sin(angle) * radius),
      };
      nodes.push(node);
      positions.set(record.id, node);
    });
  });

  const edges: MemoryEdgePath[] = [];
  const sorted = [...records].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const record of sorted) {
    const from = positions.get(record.id);
    if (from === undefined || record.edges === undefined) continue;
    const edgesByKind = record.edges as Record<string, Array<{ target: string }> | undefined>;
    for (const edgeKind of Object.keys(edgesByKind).sort()) {
      for (const edge of edgesByKind[edgeKind] ?? []) {
        const to = positions.get(edge.target);
        if (to === undefined) continue;
        edges.push({
          key: `${edgeKind}:${record.id}->${edge.target}`,
          edgeKind,
          d: edgePath(from, to),
        });
      }
    }
  }

  return { nodes, edges, kinds };
}
