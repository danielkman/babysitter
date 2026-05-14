import { createControllerUiModel, createKrateApiController } from '@a5c-ai/krate-sdk';

export const dynamic = 'force-dynamic';

const controller = createKrateApiController();

export async function GET(request) {
  const organization = new URL(request.url).searchParams.get('org');
  try {
    return Response.json(createControllerUiModel(await controller.snapshot(), { organization }), {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return Response.json({ error: 'operation_failed', message: error.message }, { status: error.message?.includes('not found') ? 404 : 500 });
  }
}
