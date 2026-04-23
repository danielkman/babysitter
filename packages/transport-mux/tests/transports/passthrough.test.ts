import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestApp } from '../helpers.js';

describe('passthrough transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing auth', async () => {
    const app = createTestApp({
      targetProvider: 'anthropic',
      targetModel: 'anthropic/claude-sonnet-4-20250514',
      exposedTransport: 'passthrough',
    });

    const response = await app.request('/passthrough/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
  });

  it('forwards upstream request with valid auth', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ type: 'message' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const app = createTestApp({
      targetProvider: 'anthropic',
      targetModel: 'anthropic/claude-sonnet-4-20250514',
      exposedTransport: 'passthrough',
      apiBase: 'https://example.test',
    });

    const response = await app.request('/passthrough/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-token',
      },
      body: JSON.stringify({ model: 'claude', messages: [] }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
