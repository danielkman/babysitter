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
});
