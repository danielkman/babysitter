"use client";

import * as React from "react";
import { ReactFlow, Background, Controls, type Node, type Edge as RfEdge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export interface MiniGraphProps {
  centerId: string;
  centerKind: string;
  outgoing: Array<{ to: string; kind: string; toKind?: string }>;
  incoming: Array<{ from: string; kind: string; fromKind?: string }>;
}

export function MiniGraph({ centerId, centerKind, outgoing, incoming }: MiniGraphProps) {
  const { nodes, edges } = React.useMemo(() => {
    const seen = new Set<string>([centerId]);
    const items: Array<{ id: string; kind?: string; dir: "out" | "in"; edgeKind: string }> = [];
    for (const o of outgoing) {
      if (!seen.has(o.to)) {
        seen.add(o.to);
        items.push({ id: o.to, kind: o.toKind, dir: "out", edgeKind: o.kind });
      }
    }
    for (const i of incoming) {
      if (!seen.has(i.from)) {
        seen.add(i.from);
        items.push({ id: i.from, kind: i.fromKind, dir: "in", edgeKind: i.kind });
      }
    }
    const radius = 240;
    const nodes: Node[] = [
      {
        id: centerId,
        position: { x: 0, y: 0 },
        data: { label: shortLabel(centerId, centerKind) },
        style: nodeStyle(true),
      },
    ];
    items.forEach((it, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(items.length, 1);
      nodes.push({
        id: it.id,
        position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        data: { label: shortLabel(it.id, it.kind) },
        style: nodeStyle(false),
      });
    });
    const edges: RfEdge[] = [];
    outgoing.forEach((o, i) => {
      edges.push({
        id: `out-${i}-${o.to}`,
        source: centerId,
        target: o.to,
        label: o.kind,
        labelStyle: { fontSize: 10, fill: "#9ca3af" },
        style: { stroke: "#64748b" },
      });
    });
    incoming.forEach((iE, i) => {
      edges.push({
        id: `in-${i}-${iE.from}`,
        source: iE.from,
        target: centerId,
        label: iE.kind,
        labelStyle: { fontSize: 10, fill: "#9ca3af" },
        style: { stroke: "#475569", strokeDasharray: "4 2" },
      });
    });
    return { nodes, edges };
  }, [centerId, centerKind, outgoing, incoming]);

  return (
    <div style={{ width: "100%", height: 480 }} className="border rounded-md">
      <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.2} maxZoom={2}>
        <Background gap={16} size={1} color="#1f2937" />
        <Controls position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

function shortLabel(id: string, kind?: string) {
  const idShort = id.length > 28 ? id.slice(0, 26) + "…" : id;
  return kind ? `${idShort}\n${kind}` : idShort;
}
function nodeStyle(center: boolean): React.CSSProperties {
  return {
    background: center ? "hsl(var(--primary))" : "hsl(var(--card))",
    color: center ? "hsl(var(--primary-foreground))" : "hsl(var(--card-foreground))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 6,
    padding: 6,
    fontSize: 10,
    fontFamily: "ui-monospace, monospace",
    whiteSpace: "pre-line",
    minWidth: 120,
    textAlign: "center",
  };
}
