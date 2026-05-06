import Link from "next/link";
import { getClusters, getNodeKinds } from "@a5c-ai/atlas";

export function Sidebar() {
  const clusters = getClusters();
  const nodeKinds = getNodeKinds();
  const sortedClusters = Object.entries(clusters).sort(
    (a, b) => b[1].recordCount - a[1].recordCount
  );

  return (
    <aside className="w-60 shrink-0 border-r bg-muted/20 overflow-y-auto">
      <div className="p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Clusters
        </div>
        <div className="space-y-3">
          {sortedClusters.map(([cluster, def]) => (
            <div key={cluster}>
              <div className="text-xs font-medium text-foreground/80 px-2 py-1 flex items-center justify-between">
                <span className="truncate">{cluster}</span>
                <span className="text-muted-foreground tabular-nums">{def.recordCount}</span>
              </div>
              <ul className="space-y-px">
                {def.nodeKinds.map((nk) => {
                  const c = nodeKinds[nk]?.count ?? 0;
                  return (
                    <li key={nk}>
                      <Link
                        href={`/kind/${encodeURIComponent(nk)}`}
                        className="flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-accent hover:text-accent-foreground"
                      >
                        <span className="truncate">{nk}</span>
                        <span className="text-muted-foreground tabular-nums">{c}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
