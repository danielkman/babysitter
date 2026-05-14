import { createKrateApiController, orgNamespaceName } from '@a5c-ai/krate-sdk';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  const { org, name } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'grant';
  try {
    const controller = createKrateApiController({ namespace: orgNamespaceName(org) });

    if (type === 'secret') {
      const result = await controller.deleteResource('Secret', name);
      return Response.json(result);
    }

    if (type === 'configmap') {
      const result = await controller.deleteResource('ConfigMap', name);
      return Response.json(result);
    }

    // Default: delete AgentSecretGrant
    const result = await controller.deleteResource('AgentSecretGrant', name);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: 'operation_failed', message: error.message }, { status: 500 });
  }
}
