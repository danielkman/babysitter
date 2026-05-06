import { NextResponse } from "next/server";
import { getAllRecords, getIndex, getDisplayName } from "@a5c-ai/atlas";

export const dynamic = "force-static";

export function GET() {
  const records: Record<string, { _kind: string; displayName: string }> = {};
  for (const r of getAllRecords()) {
    records[r.id] = { _kind: r._kind, displayName: getDisplayName(r) };
  }
  return NextResponse.json({
    records,
    edges: getIndex().edges,
  });
}
