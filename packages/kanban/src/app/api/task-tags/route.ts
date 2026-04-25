import { NextResponse } from "next/server";

import { normalizeError } from "@/lib/error-handler";
import { ensureInitialized } from "@/lib/server-init";
import { TaskTagService } from "@/lib/services/task-tag-service";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = { "Cache-Control": "no-cache, no-store" };
const service = new TaskTagService();

export async function GET() {
  try {
    await ensureInitialized();
    return NextResponse.json(
      { taskTags: await service.listTaskTags() },
      { headers: NO_CACHE_HEADERS },
    );
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.message, code: normalized.code },
      { status: normalized.status },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureInitialized();
    const body = (await request.json()) as Record<string, unknown>;
    const payload = await service.createTaskTag({
      key: body.key as string,
      label: body.label as string,
      content: body.content as string,
      description: body.description as string | undefined,
      order: body.order as number | undefined,
    });
    return NextResponse.json(payload, { status: 201, headers: NO_CACHE_HEADERS });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.message, code: normalized.code },
      { status: normalized.status },
    );
  }
}
