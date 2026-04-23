import { describe, expect, it } from 'vitest';

import { createTestApp } from '../helpers.js';
import { createMockCompletionEngine } from '../mocks/mock-completion-engine.js';

describe('openai chat transport', () => {
  it('returns chat completions', async () => {
    const app = createTestApp(
      {
        targetProvider: 'anthropic',
        targetModel: 'anthropic/claude',
        exposedTransport: 'openai-chat',
      },
      createMockCompletionEngine({ text: 'Test reply' }),
    );

    const response = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBeDefined();
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message.content).toBe('Test reply');
  });

  it('rejects missing auth', async () => {
    const app = createTestApp(
      {
        targetProvider: 'anthropic',
        targetModel: 'anthropic/claude',
        exposedTransport: 'openai-chat',
      },
      createMockCompletionEngine(),
    );

    const response = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    expect(response.status).toBe(401);
  });
});
