import { NextResponse } from "next/server";
import { getAllRecords, getDisplayName } from "@a5c-ai/atlas";

export const dynamic = "force-static";

export function GET() {
  const records = getAllRecords();
  const slim = records.map((r) => ({
    id: r.id,
    _kind: r._kind,
    _cluster: r._cluster,
    displayName: getDisplayName(r),
    description: typeof (r as Record<string, unknown>).description === "string"
      ? String((r as Record<string, unknown>).description).slice(0, 280)
      : "",
  }));
  return NextResponse.json(slim);
}
