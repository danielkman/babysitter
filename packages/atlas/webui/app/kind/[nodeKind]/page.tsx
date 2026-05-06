import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getNodeKinds,
  getRecordsByKind,
  getDisplayName,
} from "@a5c-ai/atlas";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import type { Record_ } from "@a5c-ai/atlas";

type SearchParams = {
  page?: string;
  sort?: string;
  q?: string;
  [key: string]: string | string[] | undefined;
};

const PAGE_SIZE = 50;

export const dynamicParams = true;

export default async function KindPage({
  params,
  searchParams,
}: {
  params: Promise<{ nodeKind: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { nodeKind: rawKind } = await params;
  const sp = await searchParams;
  const nodeKind = decodeURIComponent(rawKind);
  const def = getNodeKinds()[nodeKind];
  if (!def) notFound();

  const all = getRecordsByKind(nodeKind);

  // Build facets from populated string/array attributes
  const facetCandidates = new Map<string, Map<string, number>>();
  for (const r of all) {
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith("_") || k === "id") continue;
      const ingest = (val: unknown) => {
        if (val == null) return;
        if (typeof val === "string" && val.length < 80) {
          const m = facetCandidates.get(k) ?? new Map<string, number>();
          m.set(val, (m.get(val) ?? 0) + 1);
          facetCandidates.set(k, m);
        }
      };
      if (Array.isArray(v)) v.forEach(ingest);
      else if (typeof v === "string") ingest(v);
      else if (typeof v === "boolean") ingest(String(v));
    }
  }
  const facets = Array.from(facetCandidates.entries())
    .filter(([, m]) => m.size > 1 && m.size < all.length)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 8)
    .map(([key, m]) => ({
      key,
      values: Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    }));

  // Apply filters from searchParams (?attr.X=Y)
  const activeFilters: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(sp)) {
    if (k.startsWith("attr.") && typeof v === "string") {
      activeFilters.push([k.slice(5), v]);
    }
  }
  const q = typeof sp.q === "string" ? sp.q.toLowerCase() : "";

  let filtered = all;
  for (const [fk, fv] of activeFilters) {
    filtered = filtered.filter((r) => {
      const v = (r as Record<string, unknown>)[fk];
      if (typeof v === "string") return v === fv;
      if (Array.isArray(v)) return v.includes(fv);
      if (typeof v === "boolean") return String(v) === fv;
      return false;
    });
  }
  if (q) {
    filtered = filtered.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        getDisplayName(r).toLowerCase().includes(q)
    );
  }

  // Sort
  const sort = sp.sort || "id-asc";
  const sortFn: Record<string, (a: Record_, b: Record_) => number> = {
    "id-asc": (a, b) => a.id.localeCompare(b.id),
    "id-desc": (a, b) => b.id.localeCompare(a.id),
    "name-asc": (a, b) => getDisplayName(a).localeCompare(getDisplayName(b)),
    "name-desc": (a, b) => getDisplayName(b).localeCompare(getDisplayName(a)),
  };
  filtered = filtered.slice().sort(sortFn[sort] ?? sortFn["id-asc"]);

  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageRecords = filtered.slice(start, start + PAGE_SIZE);

  // Build URL helpers
  const baseQuery = new URLSearchParams();
  for (const [fk, fv] of activeFilters) baseQuery.set(`attr.${fk}`, fv);
  if (q) baseQuery.set("q", q);
  if (sort) baseQuery.set("sort", sort);
  const buildHref = (overrides: Record<string, string | undefined>) => {
    const u = new URLSearchParams(baseQuery);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) u.delete(k);
      else u.set(k, v);
    }
    const s = u.toString();
    return `/kind/${encodeURIComponent(nodeKind)}${s ? `?${s}` : ""}`;
  };

  const cluster = all[0]?._cluster;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          ...(cluster ? [{ label: cluster }] : []),
          { label: nodeKind },
        ]}
      />
      <div className="mt-2 mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{nodeKind}</h1>
          {def.description && (
            <p className="text-xs text-muted-foreground mt-1 max-w-3xl line-clamp-3">
              {String(def.description).slice(0, 400)}
            </p>
          )}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {filtered.length.toLocaleString()} of {all.length.toLocaleString()} records
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <aside className="col-span-12 md:col-span-3 space-y-4">
          {activeFilters.length > 0 && (
            <div className="border rounded-md p-2 bg-muted/40">
              <div className="text-xs font-semibold mb-1">Active filters</div>
              <div className="flex flex-wrap gap-1">
                {activeFilters.map(([k, v]) => (
                  <Link
                    key={`${k}=${v}`}
                    href={buildHref({ [`attr.${k}`]: undefined, page: undefined })}
                    className="text-xs"
                  >
                    <Badge variant="outline" className="hover:bg-destructive/20 cursor-pointer">
                      {k}: {v} ✕
                    </Badge>
                  </Link>
                ))}
                <Link
                  href={`/kind/${encodeURIComponent(nodeKind)}`}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  clear all
                </Link>
              </div>
            </div>
          )}
          {facets.map((f) => (
            <div key={f.key} className="border rounded-md p-2">
              <div className="text-xs font-semibold mb-1 truncate">{f.key}</div>
              <ul className="space-y-px">
                {f.values.map(([val, count]) => {
                  const active = activeFilters.some(([k, v]) => k === f.key && v === val);
                  return (
                    <li key={val}>
                      <Link
                        href={buildHref({
                          [`attr.${f.key}`]: active ? undefined : val,
                          page: undefined,
                        })}
                        className={`flex items-center justify-between text-xs px-1.5 py-0.5 rounded hover:bg-accent ${
                          active ? "bg-accent" : ""
                        }`}
                      >
                        <span className="truncate">{val}</span>
                        <span className="text-muted-foreground tabular-nums ml-2">{count}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        <div className="col-span-12 md:col-span-9">
          <div className="flex items-center justify-between mb-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Sort:</span>
              {(["id-asc", "id-desc", "name-asc", "name-desc"] as const).map((s) => (
                <Link
                  key={s}
                  href={buildHref({ sort: s, page: undefined })}
                  className={`px-2 py-0.5 rounded ${sort === s ? "bg-accent" : "hover:bg-accent"}`}
                >
                  {s}
                </Link>
              ))}
            </div>
          </div>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">id</th>
                  <th className="px-3 py-2 font-medium">displayName</th>
                  <th className="px-3 py-2 font-medium">cluster</th>
                </tr>
              </thead>
              <tbody>
                {pageRecords.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-mono">
                      <Link
                        href={`/n/${encodeURIComponent(r.id)}`}
                        className="hover:underline text-foreground"
                      >
                        {r.id}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 truncate max-w-[24rem]">{getDisplayName(r)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r._cluster}</td>
                  </tr>
                ))}
                {pageRecords.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground italic">
                      No records match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-xs">
              <div className="text-muted-foreground">
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={buildHref({ page: String(page - 1) })}
                    className="px-2 py-1 border rounded hover:bg-accent"
                  >
                    Prev
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={buildHref({ page: String(page + 1) })}
                    className="px-2 py-1 border rounded hover:bg-accent"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
