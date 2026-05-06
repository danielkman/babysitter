import Link from "next/link";
import type { Edge } from "@a5c-ai/atlas";
import { getDisplayName, getRecord } from "@a5c-ai/atlas";
import { Badge } from "@/components/ui/badge";

export function EdgeList({
  edges,
  direction,
}: {
  edges: Edge[];
  direction: "outgoing" | "incoming";
}) {
  if (edges.length === 0) {
    return <div className="text-xs text-muted-foreground italic">None.</div>;
  }
  const grouped = new Map<string, Edge[]>();
  for (const e of edges) {
    const arr = grouped.get(e.kind) ?? [];
    arr.push(e);
    grouped.set(e.kind, arr);
  }
  return (
    <div className="space-y-3">
      {Array.from(grouped.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([kind, items]) => (
          <div key={kind} className="border rounded-md">
            <div className="px-3 py-1.5 bg-muted/50 border-b flex items-center justify-between">
              <Badge variant="outline" className="font-mono">{kind}</Badge>
              <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
            </div>
            <ul className="divide-y">
              {items.map((e, i) => {
                const otherId = direction === "outgoing" ? e.to : e.from;
                const other = getRecord(otherId);
                return (
                  <li key={i} className="px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-muted/30">
                    <Link
                      href={`/n/${encodeURIComponent(otherId)}`}
                      className="font-mono text-primary hover:underline truncate"
                    >
                      {otherId}
                    </Link>
                    {other && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground truncate">{other._kind}</span>
                        {getDisplayName(other) !== other.id && (
                          <span className="truncate text-foreground/80">{getDisplayName(other)}</span>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </div>
  );
}
