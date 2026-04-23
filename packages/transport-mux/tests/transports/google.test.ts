import { describe, expect, it } from 'vitest';

import { createTestApp } from '../helpers.js';
import { createMockCompletionEngine } from '../mocks/mock-completion-engine.js';

describe('google transport', () => {
  it('returns generateContent response', async () => {
    const app = createTestApp(
      {
        targetProvider: 'openai',
        targetModel: 'openai/gpt-4o',
        exposedTransport: 'google',
      },
      createMockCompletionEngine({ text: 'Gemini reply' }),
    );

    const response = await app.request('/v1beta/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'test-token',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.candidates[0].content.role).toBe('model');
    expect(body.candidates[0].content.parts[0].text).toBe('Gemini reply');
    expect(body.usageMetadata.totalTokenCount).toBe(15);
  });
});
