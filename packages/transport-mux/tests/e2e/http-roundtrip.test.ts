import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createProxyConfig } from '../../src/config.js';
import { startProxyServer, type RunningProxyServer } from '../../src/server.js';
import { startMockUpstream, type MockUpstream } from '../mocks/mock-upstream.js';

describe('transport-mux e2e http roundtrip', () => {
  let upstream: MockUpstream;
  let server: RunningProxyServer;

  beforeEach(async () => {
    upstream = await startMockUpstream();
    server = await startProxyServer(
      createProxyConfig({
        targetProvider: 'openai',
        targetModel: 'openai/gpt-4o',
        exposedTransport: 'openai-chat',
        authToken: 'test-token',
        apiBase: upstream.url,
        port: 0,
      }),
    );
  });

  afterEach(async () => {
    await server.stop();
    await upstream.close();
  });

  it('serves real HTTP requests through a live listener', async () => {
    const response = await fetch(`${server.url}/v1/chat/completions`, {
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
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message.content).toBe('Hello from upstream');
    expect(upstream.requests[0]?.path).toContain('/v1/chat/completions');
  });
});
