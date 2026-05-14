import { createKrateApiController, orgNamespaceName } from '@a5c-ai/krate-sdk';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { org } = await params;
  const namespace = orgNamespaceName(org);
  const controller = createKrateApiController({ namespace });
  try {
    const body = await request.json();
    // Accept either stackRef (from run-actions) or agentStack (from dispatch-button)
    const agentStack = body.agentStack || body.stackRef;
    if (!agentStack) {
      return Response.json({ error: true, message: 'stackRef or agentStack is required' }, { status: 400 });
    }
    const result = await controller.dispatchAgent({
      agentStack,
      repository: body.repository || 'default',
      ref: body.ref || 'main',
      taskKind: body.taskKind || 'diagnostic',
      actor: body.actor || 'owner',
      namespace,
      organizationRef: org,
    });
    if (result.error) {
      return Response.json(result, { status: 400 });
    }
    return Response.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: true, message: err.message || 'Dispatch failed' }, { status: 500 });
  }
}
