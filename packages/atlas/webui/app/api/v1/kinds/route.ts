import { NextRequest } from "next/server";
import { getNodeKinds } from "@a5c-ai/atlas";
import { jsonResponse, options } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return options();
}

export async function GET(req: NextRequest) {
  const cluster = req.nextUrl.searchParams.get("cluster");
  const all = Object.values(getNodeKinds());
  const filtered = cluster
    ? all.filter((k) => {
        if (!k.cluster) return false;
        if (k.cluster === cluster) return true;
        // tolerate "agent-stack" matching "3-agent-stack" and vice versa
        const stripped = k.cluster.replace(/^\d+-/, "");
        return stripped === cluster.replace(/^\d+-/, "");
      })
    : all;
  const out = filtered.map((k) => ({
    id: k.name,
    displayName: k.name,
    cluster: k.cluster ?? null,
    instanceCount: k.count ?? 0,
  }));
  return jsonResponse(out);
}
