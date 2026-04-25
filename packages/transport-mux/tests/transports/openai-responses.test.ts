import { describe, expect, it } from 'vitest';

import { createTestApp } from '../helpers.js';
import { createMockCompletionEngine } from '../mocks/mock-completion-engine.js';

describe('openai responses transport', () => {
  it('returns responses output text', async () => {
    const app = createTestApp(
      {
        targetProvider: 'anthropic',
        targetModel: 'anthropic/claude',
        exposedTransport: 'openai-responses',
      },
      createMockCompletionEngine({ text: 'Proxy response' }),
    );

    const response = await app.request('/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        input: 'tell me something',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.object).toBe('response');
    expect(body.status).toBe('completed');
    expect(body.output[0].content[0].text).toBe('Proxy response');
  });

  it('streams responses events when requested', async () => {
    const engine = createMockCompletionEngine({ text: 'Proxy response' });
    const app = createTestApp(
      {
        targetProvider: 'anthropic',
        targetModel: 'anthropic/claude',
        exposedTransport: 'openai-responses',
      },
      engine,
    );

    const response = await app.request('/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        stream: true,
        input: 'tell me something',
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(body).toContain('event: response.created');
    expect(body).toContain('event: response.output_text.delta');
    expect(body).toContain('Proxy response');
    expect(body).toContain('event: response.completed');
    expect(engine.requests[0]?.stream).toBe(true);
  });
});
