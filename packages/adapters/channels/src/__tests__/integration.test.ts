import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '../index.js';

// Resolve fixtures relative to THIS test file so paths are stable regardless of
// process.cwd() (package dir vs repo root).
const HERE = dirname(fileURLToPath(import.meta.url)); // -> .../src/__tests__
const PKG_ROOT = resolve(HERE, '../../'); // -> package root (where examples/ lives)
import { connectedClient } from './helpers/mcp.js';
import { fakeHttp, urlIncludes, methodAndUrl } from './helpers/fake-http.js';
import { ghComment, ghIssue, jiraIssue } from './helpers/fixtures.js';
import { MemoryStateStore } from '../index.js';

// SPEC §6 R7 / §7 integration.
//   AC-17: createRuntime end-to-end — config -> mocked poll -> captured
//          notification -> reply tool -> mocked origin POST.
//   AC-4: a custom backend authored in examples/custom-backend.js works
//          end-to-end through the same pipeline (emit + reply).
//
// We inject the server side of a linked in-memory transport so a REAL MCP Client
// can both capture the channel notification AND invoke the `reply` tool.

const now = () => new Date('2026-06-16T12:00:00Z');

const GH_YAML = `
server:
  name: mcp-channels
state:
  maxSeenPerSource: 100
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

const JIRA_YAML = `
server:
  name: mcp-channels
defaults:
  pollIntervalSeconds: 60
sources:
  - id: jira-crash-bugs
    backend: jira
    auth: { baseUrl: "https://x.atlassian.net", email: "me@example.test", token: "jira_test" }
    config: { project: "BUG", events: [issue_created] }
    filter:
      all:
        - { field: "fields.labels", op: includes, value: "needs-triage" }
        - { field: "fields.summary", op: contains, value: "crash", ignoreCase: true }
`;

/** Build a ChannelServer-compatible wrapper around runtime.server for the client helper. */
function asChannelServer(runtime) {
  // runtime.server IS the ChannelServer; we want connectedClient to drive its
  // underlying transport. Provide a thin adapter exposing connect + .server.
  return {
    server: runtime.server.server ?? runtime.server,
    connect: (t) => runtime.server.connect(t)
  };
}

describe('integration — GitHub end-to-end (AC-17)', () => {
  it('AC-17: config -> tick -> channel notification -> reply tool -> origin POST', async () => {
    const comment = ghComment({ id: 1001, issueNumber: 42, body: 'is this fixed?', author: 'bob' });
    const issue = ghIssue({ number: 42, assignee: 'alice' });
    const http = fakeHttp([
      {
        match: urlIncludes('/repos/octo/app/issues/comments'),
        response: { status: 200, body: [comment] }
      },
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

    const runtime = await createRuntime(GH_YAML, {
      http,
      stateStore: new MemoryStateStore(),
      now
    });

    const { client, notifications, close } = await connectedClient(asChannelServer(runtime));
    try {
      // Drive exactly one github poll deterministically.
      await runtime.poller.tick('gh-comments-by-alice');
      await new Promise((r) => setTimeout(r, 30));

      // --- Inbound assertion: the exact channel notification params -----------
      expect(notifications).toHaveLength(1);
      const note = notifications[0];
      expect(note.content).toContain('is this fixed?');
      expect(note.meta.repo).toBe('octo/app');
      expect(String(note.meta.issue_number)).toBe('42');
      expect(note.meta.author).toBe('bob');
      // The opaque reply_to token is present and is a valid identifier value.
      expect(typeof note.meta.reply_to).toBe('string');
      expect(note.meta.reply_to.length).toBeGreaterThan(0);
      // source is never injected by the framework.
      expect(note.meta.source).toBeUndefined();

      // --- Outbound assertion: reply tool -> origin POST ----------------------
      const res = await client.callTool({
        name: 'reply',
        arguments: { reply_to: note.meta.reply_to, text: 'yes, fixed in #43' }
      });
      expect(res.isError).toBeFalsy();

      const post = http.calls.find((c) => c.method === 'POST');
      expect(post).toBeTruthy();
      expect(post.url).toContain('/repos/octo/app/issues/42/comments');
      expect(JSON.parse(post.opts.body)).toEqual({ body: 'yes, fixed in #43' });
    } finally {
      await close();
      await runtime.stop?.();
    }
  });

  it('AC-17: the filter gates emission — a comment on an issue NOT assigned to alice yields nothing', async () => {
    const comment = ghComment({ id: 2002, issueNumber: 7, author: 'bob' });
    const issue = ghIssue({ number: 7, assignee: 'someone-else' });
    const http = fakeHttp([
      { match: urlIncludes('/repos/octo/app/issues/comments'), response: { status: 200, body: [comment] } },
      {
        match: (url, opts) =>
          (opts.method || 'GET').toUpperCase() === 'GET' && /\/issues\/\d+($|\?)/.test(String(url)),
        response: { status: 200, body: issue }
      }
    ]);

    const runtime = await createRuntime(GH_YAML, { http, stateStore: new MemoryStateStore(), now });
    const { notifications, close } = await connectedClient(asChannelServer(runtime));
    try {
      await runtime.poller.tick('gh-comments-by-alice');
      await new Promise((r) => setTimeout(r, 30));
      expect(notifications).toHaveLength(0);
    } finally {
      await close();
      await runtime.stop?.();
    }
  });
});

describe('integration — Jira end-to-end (AC-17)', () => {
  it('AC-17: jira config -> tick -> channel notification -> reply tool -> origin POST', async () => {
    const issue = jiraIssue({ key: 'BUG-7', labels: ['needs-triage'], summary: 'App crash on launch' });
    const http = fakeHttp([
      { match: urlIncludes('/rest/api/3/search'), response: { status: 200, body: { issues: [issue] } } },
      {
        match: methodAndUrl('POST', '/rest/api/3/issue/BUG-7/comment'),
        response: { status: 201, body: { id: '5500' } }
      }
    ]);

    const runtime = await createRuntime(JIRA_YAML, { http, stateStore: new MemoryStateStore(), now });
    const { client, notifications, close } = await connectedClient(asChannelServer(runtime));
    try {
      await runtime.poller.tick('jira-crash-bugs');
      await new Promise((r) => setTimeout(r, 30));

      expect(notifications).toHaveLength(1);
      const note = notifications[0];
      expect(note.meta.issue_key).toBe('BUG-7');
      expect(note.content).toContain('App crash on launch');
      expect(typeof note.meta.reply_to).toBe('string');

      const res = await client.callTool({
        name: 'reply',
        arguments: { reply_to: note.meta.reply_to, text: 'triaged' }
      });
      expect(res.isError).toBeFalsy();

      const post = http.calls.find((c) => c.method === 'POST' && c.url.includes('/comment'));
      expect(post).toBeTruthy();
      expect(post.url).toContain('/rest/api/3/issue/BUG-7/comment');
      expect(post.opts.body).toContain('triaged');
    } finally {
      await close();
      await runtime.stop?.();
    }
  });
});

describe('integration — custom backend end-to-end (AC-4)', () => {
  it('AC-4: examples/custom-backend.js emits + replies through the same pipeline', async () => {
    const customPath = resolve(PKG_ROOT, 'examples/custom-backend.js');
    const yaml = `
server:
  name: mcp-channels
defaults:
  pollIntervalSeconds: 60
sources:
  - id: my-thing
    backend: ${customPath.replace(/\\/g, '/')}
    pollIntervalSeconds: 60
    auth: { token: "secret-token" }
    config: { endpoint: "https://example.test/api/events" }
    filter:
      all:
        - { field: "kind", op: eq, value: "mention" }
`;

    // The custom backend reads res.body.items (poll) and posts to
    // `${endpoint}/${itemId}/replies` (reply). It checks res.status 2xx.
    const http = fakeHttp([
      {
        match: methodAndUrl('GET', 'https://example.test/api/events'),
        response: {
          status: 200,
          body: {
            items: [
              { id: 'm1', text: 'hey @me', kind: 'mention', author: 'dana', updatedAt: '2026-06-16T10:00:00Z' },
              { id: 'm2', text: 'unrelated', kind: 'note', author: 'erin', updatedAt: '2026-06-16T10:05:00Z' }
            ]
          }
        }
      },
      {
        match: methodAndUrl('POST', 'https://example.test/api/events/m1/replies'),
        response: { status: 201, body: { id: 'reply-1' } }
      }
    ]);

    const runtime = await createRuntime(yaml, { http, stateStore: new MemoryStateStore(), now });
    const { client, notifications, close } = await connectedClient(asChannelServer(runtime));
    try {
      await runtime.poller.tick('my-thing');
      await new Promise((r) => setTimeout(r, 30));

      // Only the `mention` (m1) survives the filter; the `note` (m2) is gated out.
      expect(notifications).toHaveLength(1);
      const note = notifications[0];
      expect(note.content).toContain('hey @me');
      expect(note.meta.kind).toBe('mention');
      expect(note.meta.author).toBe('dana');
      expect(typeof note.meta.reply_to).toBe('string');

      // Reply round-trips to the custom origin endpoint.
      const res = await client.callTool({
        name: 'reply',
        arguments: { reply_to: note.meta.reply_to, text: 'on it' }
      });
      expect(res.isError).toBeFalsy();

      const post = http.calls.find((c) => c.method === 'POST');
      expect(post).toBeTruthy();
      expect(post.url).toBe('https://example.test/api/events/m1/replies');
      expect(JSON.parse(post.opts.body)).toEqual({ text: 'on it' });
    } finally {
      await close();
      await runtime.stop?.();
    }
  });
});
