import { createKrateApiController, orgNamespaceName } from '@a5c-ai/krate-sdk';

export const dynamic = 'force-dynamic';

export async function POST(_request, { params }) {
  const { org, name } = await params;
  const namespace = orgNamespaceName(org);
  const controller = createKrateApiController({ namespace });
  try {
    // Fetch the current run resource and patch its phase to Cancelled
    const existing = await controller.getResource('AgentDispatchRun', name);
    const run = existing?.resource || existing;
    if (!run) {
      return Response.json({ error: true, message: `Run '${name}' not found` }, { status: 404 });
    }
    const patched = {
      ...run,
      status: {
        ...(run.status || {}),
        phase: 'Cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'owner',
      },
    };
    const result = await controller.applyResource(patched);
    return Response.json({ error: false, run: result }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: true, message: err.message || 'Cancel failed' }, { status: 500 });
  }
}
