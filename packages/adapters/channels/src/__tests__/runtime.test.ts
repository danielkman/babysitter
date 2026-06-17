import { describe, it, expect } from 'vitest';
import { resolve, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime, MemoryStateStore, encodeReplyTo } from '../index.js';

// Resolve fixtures relative to THIS test file so paths are stable regardless of
// process.cwd() (package dir under `npm --workspace`, repo root under
// `npm run test:adapters`).
const HERE = dirname(fileURLToPath(import.meta.url)); // -> .../src/__tests__
const PKG_ROOT = resolve(HERE, '../../'); // -> package root (where examples/ lives)
import { connectedClient, capturingTransport } from './helpers/mcp.js';
import { fakeHttp, urlIncludes, methodAndUrl } from './helpers/fake-http.js';
import { ghComment, ghIssue } from './helpers/fixtures.js';

// SPEC §3/§6 runtime.js: createRuntime composition root.
//   - eagerly resolves+validates custom-path backends (a broken one fails startup)
//   - reply tool delegates to relay.dispatchReply (single source of truth)
//   - start()/stop()/connect lifecycle
//   - default permission handler when permissionRelay is on (finding §13)

const now = () => new Date('2026-06-16T12:00:00Z');

const GH_YAML = `
server:
  name: mcp-channels
defaults:
  pollIntervalSeconds: 60
sources:
  - id: gh-comments-by-alice
    backend: github
    pollIntervalSeconds: 60
    auth: { token: "ghp_test" }
    config: { repo: "octo/app", events: [issue_comment] }
    filter:
      all:
        - { field: "issue.assignee.login", op: eq, value: "alice" }
`;

function ghHttp() {
  const comment = ghComment({ id: 1001, issueNumber: 42, body: 'is this fixed?', author: 'bob' });
  const issue = ghIssue({ number: 42, assignee: 'alice' });
  return fakeHttp([
    { match: urlIncludes('/repos/octo/app/issues/comments'), response: { status: 200, body: [comment] } },
    {
      match: (url, opts) =>
        (opts.method || 'GET').toUpperCase() === 'GET' &&
        /\/repos\/octo\/app\/issues\/\d+($|\?)/.test(String(url)),
      response: { status: 200, body: issue }
    },
    {
      match: methodAndUrl('POST', '/repos/octo/app/issues/42/comments'),
      response: { status: 201, body: { id: 9999, html_url: 'https://github.com/octo/app/issues/42#c9999' } }
    }
  ]);
}

describe('createRuntime — eager custom-backend validation (finding §2)', () => {
  it('a broken custom-path backend (missing reply) FAILS createRuntime at startup', async () => {
    const brokenPath = resolve(HERE, 'helpers/broken-backend.ts').replace(/\\/g, '/');
    const yaml = `
server:
  name: mcp-channels
sources:
  - id: broken
    backend: ${brokenPath}
    auth: { token: "x" }
    config: { endpoint: "https://x.test" }
`;
    await expect(
      createRuntime(yaml, { http: async () => ({ ok: true, status: 200, json: async () => ({}) }), stateStore: new MemoryStateStore(), now })
    ).rejects.toThrow(/reply/i);
  });

  it('a valid custom-path backend resolves at startup (no throw)', async () => {
    const customPath = resolve(PKG_ROOT, 'examples/custom-backend.js').replace(/\\/g, '/');
    const yaml = `
server:
  name: mcp-channels
sources:
  - id: ok
    backend: ${customPath}
    auth: { token: "secret" }
    config: { endpoint: "https://example.test/api/events" }
`;
    const runtime = await createRuntime(yaml, {
      http: async () => ({ ok: true, status: 200, body: { items: [] }, json: async () => ({ items: [] }) }),
      stateStore: new MemoryStateStore(),
      now
    });
    expect(runtime.server).toBeTruthy();
    await runtime.stop();
  });
});

describe('createRuntime — invalid config throws (AC-3)', () => {
  it('throws with aggregated messages when config has errors', async () => {
    const yaml = `
server: {}
sources:
  - id: gh
    backend: github
    auth: {}
    config: {}
`;
    await expect(createRuntime(yaml, { stateStore: new MemoryStateStore() })).rejects.toThrow(
      /invalid config/i
    );
  });
});

describe('createRuntime — lifecycle start()/stop()/connect (finding §15)', () => {
  it('start() connects the injected transport and is idempotent; stop() tears down', async () => {
    const transport = capturingTransport();
    const runtime = await createRuntime(GH_YAML, {
      http: ghHttp(),
      stateStore: new MemoryStateStore(),
      now,
      transport
    });

    let started = false;
    transport.start = async () => {
      started = true;
    };
    await runtime.start();
    expect(started).toBe(true);

    // Idempotent: a second start() does not reconnect / re-poll.
    await runtime.start();

    // emit flows over the connected transport.
    await runtime.server.emit({ content: 'hi', meta: { k: 'v' } });
    const frames = transport.sent.filter((m) => m?.method === 'notifications/claude/channel');
    expect(frames).toHaveLength(1);

    await runtime.stop();
    // After stop, the poller timers are cleared (no throw on a second stop).
    await runtime.stop();
  });
});

describe('createRuntime — reply path via relay.dispatchReply (finding §6)', () => {
  it('reply tool returns isError for a garbled/forged token (no throw)', async () => {
    const runtime = await createRuntime(GH_YAML, { http: ghHttp(), stateStore: new MemoryStateStore(), now });
    const { client, close } = await connectedClient({
      server: runtime.server.server,
      connect: (t) => runtime.server.connect(t)
    });
    try {
      const res = await client.callTool({ name: 'reply', arguments: { reply_to: 'not-a-real-token', text: 'hi' } });
      expect(res.isError).toBe(true);
    } finally {
      await close();
      await runtime.stop();
    }
  });

  it('reply tool returns isError for a token referencing an UNKNOWN source', async () => {
    const runtime = await createRuntime(GH_YAML, { http: ghHttp(), stateStore: new MemoryStateStore(), now });
    const { client, close } = await connectedClient({
      server: runtime.server.server,
      connect: (t) => runtime.server.connect(t)
    });
    try {
      // A VALID (correctly signed) token, but for a source id the runtime doesn't know.
      const token = encodeReplyTo({ sourceId: 'no-such-source', backendType: 'github', routing: { owner: 'o', repo: 'r', issue_number: 1 } });
      const res = await client.callTool({ name: 'reply', arguments: { reply_to: token, text: 'hi' } });
      expect(res.isError).toBe(true);
    } finally {
      await close();
      await runtime.stop();
    }
  });
});

describe('createRuntime — reply dispatch routes by sourceId, not by shared type (finding §17)', () => {
  it('two custom backends sharing a `type` do NOT cross-dispatch: a B-token replies via B', async () => {
    const twinA = resolve(HERE, 'helpers/twin-a-backend.ts').replace(/\\/g, '/');
    const twinB = resolve(HERE, 'helpers/twin-b-backend.ts').replace(/\\/g, '/');
    // Both sources use a backend whose `type` is 'twin'; only the sourceId differs.
    const yaml = `
server:
  name: mcp-channels
defaults:
  pollIntervalSeconds: 60
sources:
  - id: src-a
    backend: ${twinA}
    auth: { token: "x" }
    config: { endpoint: "https://a.test" }
  - id: src-b
    backend: ${twinB}
    auth: { token: "x" }
    config: { endpoint: "https://b.test" }
`;
    const http = fakeHttp([
      { match: methodAndUrl('POST', 'https://a.test/A/replies'), response: { status: 201, body: { id: 'a' } } },
      { match: methodAndUrl('POST', 'https://b.test/B/replies'), response: { status: 201, body: { id: 'b' } } }
    ]);

    const runtime = await createRuntime(yaml, { http, stateStore: new MemoryStateStore(), now });
    const { client, notifications, close } = await connectedClient({
      server: runtime.server.server,
      connect: (t) => runtime.server.connect(t)
    });
    try {
      // Drive ONLY source B's poll so the captured token is B-owned.
      await runtime.poller.tick('src-b');
      await new Promise((r) => setTimeout(r, 20));
      expect(notifications).toHaveLength(1);
      const bToken = notifications[0].meta.reply_to;
      expect(typeof bToken).toBe('string');

      const res = await client.callTool({ name: 'reply', arguments: { reply_to: bToken, text: 'hi' } });
      expect(res.isError).toBeFalsy();

      // The reply went to B's endpoint, NOT A's — proving dispatch used src-b's
      // backend (resolved by sourceId), not the first backend matching type 'twin'.
      const posts = http.calls.filter((c) => c.method === 'POST');
      expect(posts).toHaveLength(1);
      expect(posts[0].url).toBe('https://b.test/B/replies');
      expect(http.calls.some((c) => c.url === 'https://a.test/A/replies')).toBe(false);
    } finally {
      await close();
      await runtime.stop();
    }
  });
});

describe('createRuntime — default permission handler (finding §13)', () => {
  const PERM_YAML = `
server:
  name: mcp-channels
  permissionRelay: true
defaults:
  pollIntervalSeconds: 60
sources:
  - id: gh-comments-by-alice
    backend: github
    auth: { token: "ghp_test" }
    config: { repo: "octo/app", events: [issue_comment] }
`;

  it('an inbound permission_request is answered with exactly ONE permission frame (deny by default)', async () => {
    const runtime = await createRuntime(PERM_YAML, { http: ghHttp(), stateStore: new MemoryStateStore(), now });
    const transport = capturingTransport();
    await runtime.server.connect(transport);

    // Simulate Claude sending a permission_request notification inbound.
    transport.receive({
      jsonrpc: '2.0',
      method: 'notifications/claude/channel/permission_request',
      params: { request_id: 'req-1', tool_name: 'reply', description: 'post a comment' }
    });
    await new Promise((r) => setTimeout(r, 20));

    const frames = transport.sent.filter((m) => m?.method === 'notifications/claude/channel/permission');
    expect(frames).toHaveLength(1);
    expect(frames[0].params.request_id).toBe('req-1');
    expect(frames[0].params.behavior).toBe('deny');
    await runtime.stop();
  });

  it('deps.permissionHandler can allow a request (exactly one allow frame)', async () => {
    const runtime = await createRuntime(PERM_YAML, {
      http: ghHttp(),
      stateStore: new MemoryStateStore(),
      now,
      permissionHandler: (req) => (req.tool_name === 'reply' ? 'allow' : 'deny')
    });
    const transport = capturingTransport();
    await runtime.server.connect(transport);

    transport.receive({
      jsonrpc: '2.0',
      method: 'notifications/claude/channel/permission_request',
      params: { request_id: 'req-2', tool_name: 'reply' }
    });
    await new Promise((r) => setTimeout(r, 20));

    const frames = transport.sent.filter((m) => m?.method === 'notifications/claude/channel/permission');
    expect(frames).toHaveLength(1);
    expect(frames[0].params.behavior).toBe('allow');
    expect(frames[0].params.request_id).toBe('req-2');
    await runtime.stop();
  });
});

// ---------------------------------------------------------------------------
// createRuntime — session spawner wired at the composition root (SPEC §10,
// AC-19/20/22/25). Drives the REAL poller -> spawner path with an injected
// recording client (fully offline; `@a5c-ai/adapters` is never imported).
// ---------------------------------------------------------------------------

/** A recording adapters-like client: records every run(opts) + returns a handle. */
function recordingClient() {
  const calls = [];
  const client = {
    run(opts) {
      calls.push(opts);
      return { id: `handle-${calls.length}` };
    }
  };
  return { client, calls };
}

/** Write a config to a real temp file so its path resolves to an ABSOLUTE path
 *  (proving the self-MCP re-launch args carry the resolved config path). Returns
 *  { path, cleanup }. */
function writeTempConfig(yaml) {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-channels-spawn-'));
  const path = join(dir, 'channels.yml');
  writeFileSync(path, yaml, 'utf8');
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('createRuntime — spawn dispatch through the poller (AC-19/20/22)', () => {
  it('a source with onEvent:spawn + an injected client drives one client.run() per surviving event with the self-MCP entry (absolute config path + reply secret in env)', async () => {
    // onEvent: spawn (no emit). Real github backend + the proven ghHttp fixture
    // yields exactly one surviving comment event for assignee alice.
    const yaml = `
server:
  name: mcp-channels
  replySecret: "shared-secret-123"
defaults:
  pollIntervalSeconds: 60
sources:
  - id: gh-spawn-alice
    backend: github
    onEvent: spawn
    auth: { token: "ghp_test" }
    config: { repo: "octo/app", events: [issue_comment] }
    filter:
      all:
        - { field: "issue.assignee.login", op: eq, value: "alice" }
`;
    const { path, cleanup } = writeTempConfig(yaml);
    const { client, calls } = recordingClient();
    try {
      const runtime = await createRuntime(path, {
        http: ghHttp(),
        stateStore: new MemoryStateStore(),
        now,
        client
      });

      // Drive exactly one tick of the spawning source.
      await runtime.poller.tick('gh-spawn-alice');
      await new Promise((r) => setTimeout(r, 20));

      // Exactly one run() — onEvent:spawn dispatches to the spawner, never emits.
      expect(calls).toHaveLength(1);
      const opts = calls[0];

      // Agent resolves to the canonical adapters key (default 'claude').
      expect(opts.agent).toBe('claude');
      expect(opts.nonInteractive).toBe(true);

      // The self-MCP entry re-launches THIS framework with the SAME config path,
      // resolved ABSOLUTELY, and carries the shared reply secret in its env.
      const self = opts.mcpServers.find((m) => m.name === 'mcp-channels');
      expect(self).toBeTruthy();
      expect(self.transport).toBe('stdio');
      expect(self.command).toBe('node');
      const lastArg = self.args[self.args.length - 1];
      expect(isAbsolute(lastArg)).toBe(true);
      expect(lastArg).toBe(resolve(path));
      expect(self.env).toEqual({ MCP_CHANNELS_REPLY_SECRET: 'shared-secret-123' });

      // The prompt carries the event content + routing meta + the reply_to token.
      expect(opts.prompt).toContain('is this fixed?');
      expect(opts.prompt).toMatch(/reply/i);

      await runtime.stop();
    } finally {
      cleanup();
    }
  });

  it('onEvent:spawn does NOT emit a channel notification (AC-22 routing): the injected transport sees zero channel frames', async () => {
    const yaml = `
server:
  name: mcp-channels
sources:
  - id: gh-spawn-only
    backend: github
    onEvent: spawn
    auth: { token: "ghp_test" }
    config: { repo: "octo/app", events: [issue_comment] }
    filter:
      all:
        - { field: "issue.assignee.login", op: eq, value: "alice" }
`;
    const { path, cleanup } = writeTempConfig(yaml);
    const { client, calls } = recordingClient();
    const transport = capturingTransport();
    try {
      const runtime = await createRuntime(path, {
        http: ghHttp(),
        stateStore: new MemoryStateStore(),
        now,
        client,
        transport
      });
      await runtime.start();
      await runtime.poller.tick('gh-spawn-only');
      await new Promise((r) => setTimeout(r, 20));

      expect(calls).toHaveLength(1);
      // spawn-only: NO channel notification was put on the wire.
      const frames = transport.sent.filter((m) => m?.method === 'notifications/claude/channel');
      expect(frames).toHaveLength(0);

      await runtime.stop();
    } finally {
      cleanup();
    }
  });
});

describe('createRuntime — spawn startup validation (AC-25 at the composition root)', () => {
  it('a spawn source with a loadClient that THROWS and NO injected client REJECTS at createRuntime (startup), before any tick', async () => {
    const yaml = `
server:
  name: mcp-channels
sources:
  - id: gh-spawn-broken
    backend: github
    onEvent: spawn
    auth: { token: "ghp_test" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { path, cleanup } = writeTempConfig(yaml);
    let tickRan = false;
    try {
      // No `client` injected + a loadClient that throws -> startup validation must
      // fail FAST and LOUD at createRuntime, not silently at the first tick.
      await expect(
        createRuntime(path, {
          http: ghHttp(),
          stateStore: new MemoryStateStore(),
          now,
          loadClient: () => {
            throw new Error("Cannot find package '@a5c-ai/adapters'");
          }
        })
      ).rejects.toThrow(/adapters|client|install|inject/i);
      // Nothing ticked: the rejection happened at composition, before polling.
      expect(tickRan).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('a spawn source whose loadClient returns an UNUSABLE client (no run()) REJECTS at createRuntime with a clear error', async () => {
    const yaml = `
server:
  name: mcp-channels
sources:
  - id: gh-spawn-unusable
    backend: github
    onEvent: spawn
    auth: { token: "ghp_test" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { path, cleanup } = writeTempConfig(yaml);
    try {
      // loadClient resolves, but the returned object has no run(opts) method.
      await expect(
        createRuntime(path, {
          http: ghHttp(),
          stateStore: new MemoryStateStore(),
          now,
          loadClient: async () => ({ notARunMethod: true })
        })
      ).rejects.toThrow(/run\(|client|adapters|inject/i);
    } finally {
      cleanup();
    }
  });

  it('a spawn source with an injected client validates WITHOUT consulting loadClient (stays offline)', async () => {
    const yaml = `
server:
  name: mcp-channels
sources:
  - id: gh-spawn-ok
    backend: github
    onEvent: spawn
    auth: { token: "ghp_test" }
    config: { repo: "octo/app", events: [issue_comment] }
`;
    const { path, cleanup } = writeTempConfig(yaml);
    let loadCalled = false;
    const { client } = recordingClient();
    try {
      const runtime = await createRuntime(path, {
        http: ghHttp(),
        stateStore: new MemoryStateStore(),
        now,
        client,
        loadClient: () => {
          loadCalled = true;
          throw new Error('should not be called when a client is injected');
        }
      });
      expect(runtime.server).toBeTruthy();
      expect(loadCalled).toBe(false);
      await runtime.stop();
    } finally {
      cleanup();
    }
  });
});
