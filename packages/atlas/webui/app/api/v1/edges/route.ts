import { getEdgeKinds, getIndex } from "@a5c-ai/atlas";
import { jsonResponse, options } from "@/lib/api-helpers";

export const dynamic = "force-static";

export async function OPTIONS() {
  return options();
}

export async function GET() {
  const ek = getEdgeKinds();
  const counts = new Map<string, number>();
  for (const e of getIndex().edges) {
    counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  }
  const toArr = (s: string | string[] | undefined): string[] =>
    !s ? [] : Array.isArray(s) ? s : [s];
  const out = Object.values(ek).map((k) => ({
    id: k.name,
    sourceKinds: toArr(k.source),
    targetKinds: toArr(k.target),
    wiredPairCount: counts.get(k.name) ?? k.count ?? 0,
  }));
  return jsonResponse(out);
}
