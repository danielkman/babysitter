import { NextResponse } from "next/server";

import { normalizeError } from "@/lib/error-handler";
import { ensureInitialized } from "@/lib/server-init";
import { DispatchContextLabelService } from "@/lib/services/dispatch-context-label-service";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = { "Cache-Control": "no-cache, no-store" };
const service = new DispatchContextLabelService();

export async function PATCH(
  request: Request,
  { params }: { params: { dispatchContextLabelId: string } },
) {
  try {
    await ensureInitialized();
    const body = (await request.json()) as Record<string, unknown>;
    const payload = await service.updateDispatchContextLabel(params.dispatchContextLabelId, {
      key: typeof body.key === "string" ? body.key : undefined,
      label: typeof body.label === "string" ? body.label : undefined,
      instruction: typeof body.instruction === "string" ? body.instruction : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      order: typeof body.order === "number" ? body.order : undefined,
    });
    return NextResponse.json(payload, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.message, code: normalized.code },
      { status: normalized.status },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { dispatchContextLabelId: string } },
) {
  try {
    await ensureInitialized();
    const payload = await service.deleteDispatchContextLabel(params.dispatchContextLabelId);
    return NextResponse.json(payload, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.message, code: normalized.code },
      { status: normalized.status },
    );
  }
}
