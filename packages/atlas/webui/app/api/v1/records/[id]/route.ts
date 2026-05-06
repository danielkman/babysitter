import { NextRequest } from "next/server";
import {
  getRecord,
  getOutgoing,
  getIncoming,
  getDisplayName,
} from "@a5c-ai/atlas";
import { jsonResponse, notFound, options } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return options();
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const decoded = decodeURIComponent(id);
  const rec = getRecord(decoded);
  if (!rec) return notFound(`record '${decoded}' not found`);

  const expand = req.nextUrl.searchParams.get("expand");

  const outgoing = getOutgoing(decoded).map((e) => ({
    kind: e.kind,
    to: e.to,
  }));
  const incoming = getIncoming(decoded).map((e) => ({
    kind: e.kind,
    from: e.from,
  }));

  // Strip _kind/_file/_cluster from attributes payload.
  const {
    _kind,
    _file,
    _cluster,
    id: _id,
    ...attributes
  } = rec as Record<string, unknown> & {
    _kind: string;
    _file: string;
    _cluster: string;
    id: string;
  };

  const body: Record<string, unknown> = {
    id: rec.id,
    nodeKind: _kind,
    file: _file,
    cluster: _cluster,
    displayName: getDisplayName(rec),
    attributes,
    outgoingEdges: outgoing,
    incomingEdges: incoming,
  };

  if (expand === "neighbors") {
    const seen = new Set<string>();
    const expandRec = (rid: string) => {
      if (seen.has(rid)) return null;
      seen.add(rid);
      const r = getRecord(rid);
      if (!r) return { id: rid, missing: true };
      return {
        id: r.id,
        nodeKind: r._kind,
        displayName: getDisplayName(r),
        cluster: r._cluster,
      };
    };
    body.expandedNeighbors = {
      outgoing: outgoing.map((e) => ({ ...e, record: expandRec(e.to) })),
      incoming: incoming.map((e) => ({ ...e, record: expandRec(e.from) })),
    };
  }

  return jsonResponse(body);
}
