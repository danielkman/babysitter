import { getClusters } from "@a5c-ai/atlas";
import { jsonResponse, options } from "@/lib/api-helpers";

export const dynamic = "force-static";

export async function OPTIONS() {
  return options();
}

export async function GET() {
  const out = Object.entries(getClusters()).map(([id, c]) => ({
    id,
    nodeKinds: c.nodeKinds,
    recordCount: c.recordCount,
  }));
  return jsonResponse(out);
}
