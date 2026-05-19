import { createControllerUiModel, createKrateApiController } from '@a5c-ai/krate-sdk';

export const dynamic = 'force-dynamic';

export async function GET() {
  const controller = createKrateApiController();
  try {
    const model = createControllerUiModel(await controller.snapshot());
    return Response.json({ organizations: model.orgs }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: 'operation_failed', message: error.message }, { status: error.message?.includes('not found') ? 404 : 500 });
  }
}

export async function POST(request) {
  const controller = createKrateApiController();
  try {
    const input = await request.json();
    return Response.json(await controller.createOrganization(input), { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: 'operation_failed', message: error.message }, { status: error.message?.includes('not found') ? 404 : 500 });
  }
}
