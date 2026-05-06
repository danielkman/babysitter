import { NextRequest } from "next/server";
import Fuse from "fuse.js";
import { getAllRecords, getDisplayName } from "@a5c-ai/atlas";
import { badRequest, jsonResponse, options } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Doc = {
  id: string;
  _kind: string;
  _cluster: string;
  displayName: string;
  description: string;
};

let _corpus: Doc[] | null = null;
let _fuse: Fuse<Doc> | null = null;

function corpus(): Doc[] {
  if (_corpus) return _corpus;
  _corpus = getAllRecords().map((r) => {
    const desc = (r as Record<string, unknown>).description;
    return {
      id: r.id,
      _kind: r._kind,
      _cluster: r._cluster,
      displayName: getDisplayName(r),
      description: typeof desc === "string" ? desc : "",
    };
  });
  return _corpus;
}

function fuse(): Fuse<Doc> {
  if (_fuse) return _fuse;
  _fuse = new Fuse(corpus(), {
    keys: [
      { name: "id", weight: 0.4 },
      { name: "displayName", weight: 0.3 },
      { name: "description", weight: 0.2 },
      { name: "_kind", weight: 0.1 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
  });
  return _fuse;
}

function snippetOf(doc: Doc, q: string): string {
  const text = doc.description || doc.displayName || doc.id;
  if (!text) return "";
  const lower = text.toLowerCase();
  const needle = q.toLowerCase().split(/\s+/)[0] ?? "";
  const idx = needle ? lower.indexOf(needle) : -1;
  if (idx < 0) return text.slice(0, 160);
  const start = Math.max(0, idx - 60);
  return (start > 0 ? "…" : "") + text.slice(start, start + 160);
}

export async function OPTIONS() {
  return options();
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  if (!q) return badRequest("query parameter 'q' is required");

  const kind = sp.get("kind");
  const cluster = sp.get("cluster");
  const limit = Math.min(
    Math.max(parseInt(sp.get("limit") ?? "25", 10) || 25, 1),
    200,
  );
  const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);

  const all = fuse().search(q);
  const filtered = all.filter((r) => {
    if (kind && r.item._kind !== kind) return false;
    if (cluster && r.item._cluster !== cluster) return false;
    return true;
  });

  const page = filtered.slice(offset, offset + limit).map((r) => ({
    id: r.item.id,
    nodeKind: r.item._kind,
    displayName: r.item.displayName,
    cluster: r.item._cluster,
    score: r.score ?? 0,
    snippet: snippetOf(r.item, q),
  }));

  return jsonResponse({ total: filtered.length, hits: page });
}
