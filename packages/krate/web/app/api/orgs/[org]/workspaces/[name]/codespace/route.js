import { createKrateApiController, orgNamespaceName } from '@a5c-ai/krate-sdk';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { org, name } = await params;
  const namespace = orgNamespaceName(org);
  const controller = createKrateApiController({ namespace });
  try {
    const workspace = await controller.getResource('KrateWorkspace', name, namespace);
    if (!workspace) {
      return Response.json({ error: true, message: `Workspace not found: ${name}` }, { status: 404 });
    }
    const wsController = controller.workspaceController();
    const podStatus = workspace.status?.codespace || null;
    const result = wsController.getCodespaceStatus(workspace, podStatus);
    if (result.error) {
      return Response.json(result, { status: 400 });
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: true, message: err.message || 'Failed to get codespace status' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { org, name } = await params;
  const namespace = orgNamespaceName(org);
  const controller = createKrateApiController({ namespace });
  try {
    const body = await request.json();
    const workspace = await controller.getResource('KrateWorkspace', name, namespace);
    if (!workspace) {
      return Response.json({ error: true, message: `Workspace not found: ${name}` }, { status: 404 });
    }
    const wsController = controller.workspaceController();
    const result = wsController.launchCodespace(workspace, {
      image: body.image || undefined,
      cpu: body.cpu || undefined,
      memory: body.memory || undefined,
      passwordSecretRef: body.passwordSecretRef || undefined,
      gitAuthorName: body.gitAuthorName || undefined,
      gitAuthorEmail: body.gitAuthorEmail || undefined,
    });
    if (result.error) {
      return Response.json(result, { status: 400 });
    }
    return Response.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: true, message: err.message || 'Failed to launch codespace' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { org, name } = await params;
  const namespace = orgNamespaceName(org);
  const controller = createKrateApiController({ namespace });
  try {
    const workspace = await controller.getResource('KrateWorkspace', name, namespace);
    if (!workspace) {
      return Response.json({ error: true, message: `Workspace not found: ${name}` }, { status: 404 });
    }
    const wsController = controller.workspaceController();
    const result = wsController.stopCodespace(workspace);
    if (result.error) {
      return Response.json(result, { status: 400 });
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: true, message: err.message || 'Failed to stop codespace' }, { status: 500 });
  }
}
