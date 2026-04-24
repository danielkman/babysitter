import { NextResponse } from 'next/server';

import { normalizeError } from '@/lib/error-handler';
import { ensureInitialized } from '@/lib/server-init';
import { BacklogQueryService } from '@/lib/services/backlog-query-service';

export const dynamic = 'force-dynamic';

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-cache, no-store' };

const service = new BacklogQueryService();

export async function GET() {
  try {
    await ensureInitialized();
    const overview = await service.getOverview();
    return NextResponse.json(overview, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.message, code: normalized.code },
      { status: normalized.status },
    );
  }
}
