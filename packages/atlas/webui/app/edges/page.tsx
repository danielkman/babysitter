import Link from "next/link";
import { getEdgeKinds } from "@a5c-ai/atlas";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default function EdgesIndexPage() {
  const ek = getEdgeKinds();
  const sorted = Object.values(ek).sort((a, b) => b.count - a.count);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "EdgeKinds" }]} />
      <h1 className="text-xl font-semibold mt-2 mb-4">EdgeKinds ({sorted.length})</h1>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">name</th>
              <th className="px-3 py-2 font-medium">source</th>
              <th className="px-3 py-2 font-medium">target</th>
              <th className="px-3 py-2 font-medium">cardinality</th>
              <th className="px-3 py-2 font-medium text-right">count</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((k) => (
              <tr key={k.name} className="border-t hover:bg-muted/30">
                <td className="px-3 py-1.5">
                  <Link
                    href={`/edges/${encodeURIComponent(k.name)}`}
                    className="font-mono hover:underline"
                  >
                    {k.name}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {Array.isArray(k.source) ? k.source.join(", ") : k.source ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {Array.isArray(k.target) ? k.target.join(", ") : k.target ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {k.cardinality ? <Badge variant="outline">{k.cardinality}</Badge> : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{k.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
