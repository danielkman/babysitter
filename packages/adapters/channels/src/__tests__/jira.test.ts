import { describe, it, expect } from 'vitest';
import jira from '../backends/jira.js';
import { fakeHttp, urlIncludes, methodAndUrl } from './helpers/fake-http.js';
import { jiraIssue } from './helpers/fixtures.js';

// SPEC §4.2 / §5.2 Jira backend.
//   AC-6: issue_created poll -> event with meta.issue_key, payload.fields.labels;
//         JQL contains project = "BUG" and created >=.
//   AC-13: same-minute re-match deduped by <key>:<created> seen-set.
//   AC-15: reply() POSTs to /rest/api/3/issue/{key}/comment.

const source = (events = ['issue_created']) => ({
  id: 'jira-bugs',
  backend: 'jira',
  auth: { baseUrl: 'https://x.atlassian.net', email: 'me@example.test', token: 'jira_test' },
  config: { project: 'BUG', events }
});

const now = new Date('2026-06-16T12:00:00Z');

/** Capture the JQL string sent in a /search POST body (supports `jql` field). */
function jqlFromCall(call) {
  try {
    const body = JSON.parse(call.opts.body);
    return body.jql || '';
  } catch {
    return '';
  }
}

describe('jira backend — issue_created poll (AC-6)', () => {
  it('AC-6: emits an event with meta.issue_key and payload.fields.labels', async () => {
    const issue = jiraIssue({ key: 'BUG-7', labels: ['needs-triage'], summary: 'App crash on launch' });
    const http = fakeHttp([
      {
        match: urlIncludes('/rest/api/3/search'),
        response: { status: 200, body: { issues: [issue] } }
      }
    ]);

    const { events } = await jira.poll({
      source: source(),
      state: { cursor: null, seen: [] },
      http,
      log: () => {},
      now
    });

    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.meta.issue_key).toBe('BUG-7');
    expect(ev.meta.project).toBe('BUG');
    expect(ev.payload.fields.labels).toEqual(['needs-triage']);
    expect(ev.content).toContain('App crash on launch');
    // routing must let reply reach origin (the issue key).
    expect(ev.routing).toMatchObject({ key: 'BUG-7' });
  });

  it('AC-6: the JQL contains project = "BUG" and a created >= cursor clause, ordered by created ASC', async () => {
    const http = fakeHttp([
      { match: urlIncludes('/rest/api/3/search'), response: { status: 200, body: { issues: [] } } }
    ]);
    const cursor = '2026-06-16T08:00:00.000+0000';

    await jira.poll({
      source: source(),
      state: { cursor, seen: [] },
      http,
      log: () => {},
      now
    });

    const call = http.calls.find((c) => c.url.includes('/rest/api/3/search'));
    expect(call).toBeTruthy();
    expect(call.method).toBe('POST');
    const jql = jqlFromCall(call);
    expect(jql).toContain('project = "BUG"');
    expect(jql).toContain('created >=');
    expect(jql).toMatch(/ORDER BY created ASC/i);
  });

  it('AC-12: cursor advances to the max created observed', async () => {
    const issues = [
      jiraIssue({ key: 'BUG-1', created: '2026-06-16T08:10:00.000+0000' }),
      jiraIssue({ key: 'BUG-2', created: '2026-06-16T08:45:00.000+0000' })
    ];
    const http = fakeHttp([
      { match: urlIncludes('/rest/api/3/search'), response: { status: 200, body: { issues } } }
    ]);
    const { state } = await jira.poll({
      source: source(),
      state: { cursor: null, seen: [] },
      http,
      log: () => {},
      now
    });
    expect(state.cursor).toBe('2026-06-16T08:45:00.000+0000');
  });
});

describe('jira backend — pagination via startAt (finding §4)', () => {
  it('loops startAt until startAt+len >= total, accumulating ALL pages before the cursor', async () => {
    const page1 = [
      jiraIssue({ key: 'BUG-1', created: '2026-06-16T08:10:00.000+0000' }),
      jiraIssue({ key: 'BUG-2', created: '2026-06-16T08:20:00.000+0000' })
    ];
    const page2 = [
      jiraIssue({ key: 'BUG-3', created: '2026-06-16T08:30:00.000+0000' }),
      jiraIssue({ key: 'BUG-4', created: '2026-06-16T08:40:00.000+0000' })
    ];
    const http = fakeHttp([
      {
        match: urlIncludes('/rest/api/3/search'),
        response: (url, opts) => {
          const body = JSON.parse(opts.body);
          // total=4 across two pages of 2.
          if (body.startAt === 0) return { status: 200, body: { issues: page1, total: 4, startAt: 0 } };
          return { status: 200, body: { issues: page2, total: 4, startAt: 2 } };
        }
      }
    ]);

    const { events, state } = await jira.poll({
      source: source(),
      state: { cursor: null, seen: [] },
      http,
      log: () => {},
      now
    });

    // All four issues across both pages became events.
    expect(events.map((e) => e.meta.issue_key).sort()).toEqual(['BUG-1', 'BUG-2', 'BUG-3', 'BUG-4']);
    // Cursor = max created across BOTH pages.
    expect(state.cursor).toBe('2026-06-16T08:40:00.000+0000');
    // Two search calls were made (startAt 0 then 2).
    const searchCalls = http.calls.filter((c) => c.url.includes('/rest/api/3/search'));
    expect(searchCalls.length).toBe(2);
    expect(JSON.parse(searchCalls[1].opts.body).startAt).toBe(2);
  });
});

describe('jira backend — failed poll does not advance the cursor (finding §5)', () => {
  it('a non-2xx /search response leaves cursor + seen unchanged and emits nothing', async () => {
    const http = fakeHttp([
      { match: urlIncludes('/rest/api/3/search'), response: { status: 500, body: { errorMessages: ['boom'] } } }
    ]);
    const prior = { cursor: '2026-06-16T08:00:00.000+0000', seen: ['jira:BUG-9:2026-06-16T08:00:00.000+0000'] };
    const { events, state } = await jira.poll({ source: source(), state: prior, http, log: () => {}, now });

    expect(events).toHaveLength(0);
    expect(state.cursor).toBe('2026-06-16T08:00:00.000+0000'); // NOT advanced
    expect(state.seen).toEqual(prior.seen); // unchanged
  });
});

describe('jira backend — JQL cursor formatting + injection hardening (findings §9/§10)', () => {
  it('the JQL date literal is the quoted "yyyy-MM-dd HH:mm" minute form (not the full timestamp)', async () => {
    const http = fakeHttp([
      { match: urlIncludes('/rest/api/3/search'), response: { status: 200, body: { issues: [] } } }
    ]);
    // A full-precision stored cursor.
    await jira.poll({
      source: source(),
      state: { cursor: '2026-06-16T08:45:30.500+0000', seen: [] },
      http,
      log: () => {},
      now
    });
    const jql = jqlFromCall(http.calls.find((c) => c.url.includes('/rest/api/3/search')));
    // Down-converted to minute granularity, quoted.
    expect(jql).toContain('created >= "2026-06-16 08:45"');
    // The sub-minute precision is NOT in the query.
    expect(jql).not.toContain('08:45:30');
    expect(jql).not.toContain('.500');
  });

  it('the full-precision timestamp is kept in the seen-set key (so same-minute dedup still works)', async () => {
    const issue = jiraIssue({ key: 'BUG-7', created: '2026-06-16T08:45:30.500+0000' });
    const http = fakeHttp([
      { match: urlIncludes('/rest/api/3/search'), response: { status: 200, body: { issues: [issue] } } }
    ]);
    const { events, state } = await jira.poll({
      source: source(),
      state: { cursor: null, seen: [] },
      http,
      log: () => {},
      now
    });
    expect(events[0].id).toBe('jira:BUG-7:2026-06-16T08:45:30.500+0000');
    expect(state.seen).toContain('jira:BUG-7:2026-06-16T08:45:30.500+0000');
    // Cursor retains full precision (only the QUERY is down-converted).
    expect(state.cursor).toBe('2026-06-16T08:45:30.500+0000');
  });

  it('a config.jql extra clause cannot break out of the query (quote/semicolon stripped)', async () => {
    const http = fakeHttp([
      { match: urlIncludes('/rest/api/3/search'), response: { status: 200, body: { issues: [] } } }
    ]);
    const malicious = {
      ...source(),
      config: { project: 'BUG', events: ['issue_created'], jql: 'status = Open" OR project = "SECRET' }
    };
    await jira.poll({ source: malicious, state: { cursor: null, seen: [] }, http, log: () => {}, now });
    const jql = jqlFromCall(http.calls.find((c) => c.url.includes('/rest/api/3/search')));
    // The injected closing quote is stripped, so no second project clause leaks in.
    expect(jql).not.toContain('"SECRET"');
    expect(jql).not.toMatch(/project = "SECRET"/);
    // The project clause is still the configured one.
    expect(jql).toContain('project = "BUG"');
  });
});

describe('jira backend — JQL project injection guard in buildJql (defense-in-depth)', () => {
  it('poll throws on an unsafe project key that bypassed validateConfig (never builds the query)', async () => {
    // validateConfig normally rejects this at load; poll()'s buildJql is the
    // in-code backstop. Feed an unsafe project straight to poll() and assert it
    // refuses rather than emitting an injected JQL query.
    const http = fakeHttp([
      { match: urlIncludes('/rest/api/3/search'), response: { status: 200, body: { issues: [] } } }
    ]);
    const malicious = {
      ...source(),
      config: { project: 'BUG" OR project = "SECRET', events: ['issue_created'] }
    };
    await expect(
      jira.poll({ source: malicious, state: { cursor: null, seen: [] }, http, log: () => {}, now })
    ).rejects.toThrow(/unsafe project key/i);
    // The guard fires BEFORE any /search request is issued.
    expect(http.calls.some((c) => c.url.includes('/rest/api/3/search'))).toBe(false);
  });
});

describe('jira backend — same-minute dedup (AC-13)', () => {
  it('AC-13: a same-minute re-match is deduped by <key>:<created> across two polls', async () => {
    const a = jiraIssue({ key: 'BUG-10', created: '2026-06-16T08:30:00.000+0000' });
    const b = jiraIssue({ key: 'BUG-11', created: '2026-06-16T08:30:30.000+0000' });

    // Poll 1: both issues, both within the 08:30 minute.
    const http1 = fakeHttp([
      { match: urlIncludes('/rest/api/3/search'), response: { status: 200, body: { issues: [a, b] } } }
    ]);
    const r1 = await jira.poll({
      source: source(),
      state: { cursor: null, seen: [] },
      http: http1,
      log: () => {},
      now
    });
    expect(r1.events).toHaveLength(2);

    // Poll 2: JQL `created >= "08:30"` re-returns BOTH same-minute issues plus a
    // new one. The <key>:<created> seen-set must drop the two already-emitted.
    const c = jiraIssue({ key: 'BUG-12', created: '2026-06-16T08:31:00.000+0000' });
    const http2 = fakeHttp([
      { match: urlIncludes('/rest/api/3/search'), response: { status: 200, body: { issues: [a, b, c] } } }
    ]);
    const r2 = await jira.poll({
      source: source(),
      state: r1.state,
      http: http2,
      log: () => {},
      now
    });
    expect(r2.events).toHaveLength(1);
    expect(r2.events[0].meta.issue_key).toBe('BUG-12');
  });
});

describe('jira backend — issue_updated path (updated field)', () => {
  it('orders/filters on `updated` and labels the event kind issue_updated', async () => {
    const issue = jiraIssue({ key: 'BUG-20', updated: '2026-06-16T09:00:00.000+0000' });
    const http = fakeHttp([
      { match: urlIncludes('/rest/api/3/search'), response: { status: 200, body: { issues: [issue] } } }
    ]);
    const { events, state } = await jira.poll({
      source: source(['issue_updated']),
      state: { cursor: '2026-06-16T08:00:00.000+0000', seen: [] },
      http,
      log: () => {},
      now
    });
    expect(events[0].meta.kind).toBe('issue_updated');
    // dedup id + cursor use the `updated` field.
    expect(events[0].id).toBe('jira:BUG-20:2026-06-16T09:00:00.000+0000');
    expect(state.cursor).toBe('2026-06-16T09:00:00.000+0000');

    const jql = jqlFromCall(http.calls.find((c) => c.url.includes('/rest/api/3/search')));
    expect(jql).toMatch(/updated >= "/);
    expect(jql).toMatch(/ORDER BY updated ASC/i);
  });
});

describe('jira backend — validateConfig (mirrors github)', () => {
  const valid = { id: 'x', config: { project: 'BUG', events: ['issue_created'] }, auth: { baseUrl: 'https://x.atlassian.net', email: 'm@e.test', token: 't' } };

  it('accepts a valid issue_created/issue_updated config with zero problems', () => {
    expect(jira.validateConfig(valid)).toEqual([]);
    expect(jira.validateConfig({ ...valid, config: { ...valid.config, events: ['issue_updated'] } })).toEqual([]);
  });

  it('rejects an unknown event kind', () => {
    const bad = jira.validateConfig({ ...valid, config: { project: 'BUG', events: ['nonsense'] } });
    expect(bad.join('\n')).toMatch(/unknown kind/i);
  });

  it('rejects an empty events array', () => {
    const bad = jira.validateConfig({ ...valid, config: { project: 'BUG', events: [] } });
    expect(bad.join('\n')).toMatch(/events must be a non-empty array/i);
  });
});

describe('jira backend — reply ref + ADF body shape', () => {
  it('reply returns the created comment id as ref and sends a valid ADF doc', async () => {
    const http = fakeHttp([
      {
        match: methodAndUrl('POST', '/rest/api/3/issue/BUG-7/comment'),
        response: { status: 201, body: { id: '90042' } }
      }
    ]);
    const result = await jira.reply({ routing: { key: 'BUG-7' }, text: 'hello', source: source(), http });
    expect(result).toEqual({ ok: true, ref: '90042' });
    const body = JSON.parse(http.calls.find((c) => c.method === 'POST').opts.body);
    expect(body.body.type).toBe('doc');
    expect(body.body.content[0].content[0].text).toBe('hello');
  });
});

describe('jira backend — reply (AC-15)', () => {
  it('AC-15: reply() POSTs to /rest/api/3/issue/{key}/comment', async () => {
    const http = fakeHttp([
      {
        match: methodAndUrl('POST', '/rest/api/3/issue/BUG-7/comment'),
        response: { status: 201, body: { id: '90001' } }
      }
    ]);

    const result = await jira.reply({
      routing: { key: 'BUG-7' },
      text: 'triaged, thanks',
      source: source(),
      http
    });

    expect(result.ok).toBe(true);
    const post = http.calls.find((c) => c.method === 'POST');
    expect(post).toBeTruthy();
    expect(post.url).toContain('/rest/api/3/issue/BUG-7/comment');
    // body carries the reply text somewhere (ADF body); assert the text is present.
    expect(post.opts.body).toContain('triaged, thanks');
  });

  it('AC-15: reply() reports ok:false on a non-2xx response', async () => {
    const http = fakeHttp([
      {
        match: methodAndUrl('POST', '/rest/api/3/issue/BUG-7/comment'),
        response: { status: 403, body: { errorMessages: ['Forbidden'] } }
      }
    ]);
    const result = await jira.reply({
      routing: { key: 'BUG-7' },
      text: 'hi',
      source: source(),
      http
    });
    expect(result.ok).toBe(false);
  });
});
