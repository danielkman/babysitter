import { NextResponse } from "next/server";

import { normalizeError } from "@/lib/error-handler";
import { ensureInitialized } from "@/lib/server-init";
import { DispatchContextLabelService } from "@/lib/services/dispatch-context-label-service";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = { "Cache-Control": "no-cache, no-store" };
const service = new DispatchContextLabelService();

export async function GET() {
  try {
    await ensureInitialized();
    return NextResponse.json(
      { dispatchContextLabels: await service.listDispatchContextLabels() },
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
    const payload = await service.createDispatchContextLabel({
      key: body.key as string,
      label: body.label as string,
      instruction: body.instruction as string,
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
