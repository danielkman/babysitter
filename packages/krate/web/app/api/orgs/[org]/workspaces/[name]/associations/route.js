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
    const result = wsController.listAssociations(workspace);
    if (result.error) {
      return Response.json(result, { status: 400 });
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: true, message: err.message || 'Failed to list associations' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { org, name } = await params;
  const namespace = orgNamespaceName(org);
  const controller = createKrateApiController({ namespace });
  try {
    const body = await request.json();
    if (!body.kind || !body.name) {
      return Response.json({ error: true, message: 'kind and name are required' }, { status: 400 });
    }
    const workspace = await controller.getResource('KrateWorkspace', name, namespace);
    if (!workspace) {
      return Response.json({ error: true, message: `Workspace not found: ${name}` }, { status: 404 });
    }
    const wsController = controller.workspaceController();
    const result = wsController.addAssociation(workspace, { kind: body.kind, name: body.name });
    if (result.error) {
      return Response.json(result, { status: 400 });
    }
    // Persist updated workspace
    await controller.applyResource(result.workspace);
    return Response.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: true, message: err.message || 'Failed to add association' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { org, name } = await params;
  const namespace = orgNamespaceName(org);
  const controller = createKrateApiController({ namespace });
  try {
    const body = await request.json();
    if (!body.kind || !body.name) {
      return Response.json({ error: true, message: 'kind and name are required' }, { status: 400 });
    }
    const workspace = await controller.getResource('KrateWorkspace', name, namespace);
    if (!workspace) {
      return Response.json({ error: true, message: `Workspace not found: ${name}` }, { status: 404 });
    }
    const wsController = controller.workspaceController();
    const result = wsController.removeAssociation(workspace, { kind: body.kind, name: body.name });
    if (result.error) {
      return Response.json(result, { status: 400 });
    }
    // Persist updated workspace
    await controller.applyResource(result.workspace);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: true, message: err.message || 'Failed to remove association' }, { status: 500 });
  }
}
