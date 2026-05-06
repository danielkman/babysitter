import { NextRequest } from "next/server";
import { getEdgeKinds, getIndex } from "@a5c-ai/atlas";
import { jsonResponse, notFound, options, paginate } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return options();
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ edgeKindId: string }> },
) {
  const { edgeKindId } = await ctx.params;
  const def = getEdgeKinds()[edgeKindId];
  if (!def) return notFound(`EdgeKind '${edgeKindId}' not found`);

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(
    Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1),
    500,
  );
  const cursor = sp.get("cursor");

  const pairs = getIndex()
    .edges.filter((e) => e.kind === edgeKindId)
    .map((e) => ({ from: e.from, to: e.to }))
    .sort((a, b) =>
      a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from),
    );

  const { page, nextCursor } = paginate(
    pairs,
    cursor,
    limit,
    (p) => `${p.from}|${p.to}`,
  );

  const toArr = (s: string | string[] | undefined): string[] =>
    !s ? [] : Array.isArray(s) ? s : [s];

  return jsonResponse({
    id: def.name,
    description: def.description ?? "",
    cardinality: def.cardinality ?? "",
    sourceKinds: toArr(def.source),
    targetKinds: toArr(def.target),
    wiredPairCount: pairs.length,
    pairs: page,
    nextCursor,
  });
}
