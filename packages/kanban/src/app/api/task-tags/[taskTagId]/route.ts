import { NextResponse } from "next/server";

import { normalizeError } from "@/lib/error-handler";
import { ensureInitialized } from "@/lib/server-init";
import { TaskTagService } from "@/lib/services/task-tag-service";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = { "Cache-Control": "no-cache, no-store" };
const service = new TaskTagService();

export async function PATCH(
  request: Request,
  { params }: { params: { taskTagId: string } },
) {
  try {
    await ensureInitialized();
    const body = (await request.json()) as Record<string, unknown>;
    const payload = await service.updateTaskTag(params.taskTagId, {
      key: typeof body.key === "string" ? body.key : undefined,
      label: typeof body.label === "string" ? body.label : undefined,
      content: typeof body.content === "string" ? body.content : undefined,
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
  { params }: { params: { taskTagId: string } },
) {
  try {
    await ensureInitialized();
    const payload = await service.deleteTaskTag(params.taskTagId);
    return NextResponse.json(payload, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.message, code: normalized.code },
      { status: normalized.status },
    );
  }
}
