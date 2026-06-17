import { describe, it, expect } from 'vitest';
import github from '../backends/github.js';
import { fakeHttp, urlIncludes, methodAndUrl } from './helpers/fake-http.js';
import { ghComment, ghIssue } from './helpers/fixtures.js';

// SPEC §4.1 / §5.1 GitHub backend.
//   AC-5: issue_comment poll -> event with content, meta.repo/issue_number/author/reply_to,
//         payload.issue.assignee.login; request URL carries since=<cursor>.
//   AC-13: two polls over an overlapping `since` window emit no duplicate.
//   AC-15: reply() POSTs to /repos/{o}/{r}/issues/{n}/comments {body:text}.
//   Plus the issue_opened path.

const source = (events = ['issue_comment']) => ({
  id: 'gh-comments',
  backend: 'github',
  auth: { token: 'ghp_test' },
  config: { repo: 'octo/app', events }
});

const now = new Date('2026-06-16T12:00:00Z');

/** Route set for issue_comment polling: the comments list + the parent issue. */
function commentRoutes(comments, issue = ghIssue({ number: 42, assignee: 'alice' })) {
  return [
    {
      match: urlIncludes('/repos/octo/app/issues/comments'),
      response: { status: 200, body: comments }
    },
    {
      // parent issue resolved from issue_url -> .../issues/42
      match: (url, opts) =>
        (opts.method || 'GET').toUpperCase() === 'GET' &&
        /\/repos\/octo\/app\/issues\/\d+($|\?)/.test(String(url)),
      response: { status: 200, body: issue }
    }
  ];
}

describe('github backend — issue_comment poll (AC-5)', () => {
  it('AC-5: emits an event with content, meta, and parent-issue payload', async () => {
    const comment = ghComment({ id: 1001, issueNumber: 42, body: 'look at this', author: 'bob' });
    const http = fakeHttp(commentRoutes([comment]));

    const { events } = await github.poll({
      source: source(),
      state: { cursor: null, seen: [] },
      http,
      log: () => {},
      now
    });

    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.content).toContain('look at this');
    // meta per SPEC §4.1
    expect(ev.meta.repo).toBe('octo/app');
    expect(String(ev.meta.issue_number)).toBe('42');
    expect(ev.meta.author).toBe('bob');
    expect(ev.meta.reply_to).toBeUndefined(); // reply_to is minted by the CORE, not the backend
    // payload includes the parent issue so filters like issue.assignee.login work
    expect(ev.payload.issue.assignee.login).toBe('alice');
    // routing must be set so a reply can reach origin
    expect(ev.routing).toMatchObject({ owner: 'octo', repo: 'app', issue_number: 42 });
  });

  it('AC-5: the comments request carries sort=updated, direction=asc and since=<cursor>', async () => {
    const http = fakeHttp(commentRoutes([ghComment({ id: 1, issueNumber: 42 })]));
    const cursor = '2026-06-16T09:00:00Z';

    await github.poll({
      source: source(),
      state: { cursor, seen: [] },
      http,
      log: () => {},
      now
    });

    const listCall = http.calls.find((c) => c.url.includes('/issues/comments'));
    expect(listCall).toBeTruthy();
    expect(listCall.url).toContain('sort=updated');
    expect(listCall.url).toContain('direction=asc');
    // since carries the cursor (URL-encoded ':' is acceptable)
    expect(decodeURIComponent(listCall.url)).toContain(`since=${cursor}`);
  });

  it('AC-12: poll returns an advanced cursor = max updated_at observed', async () => {
    const comments = [
      ghComment({ id: 1, issueNumber: 42, updated_at: '2026-06-16T10:00:00Z' }),
      ghComment({ id: 2, issueNumber: 42, updated_at: '2026-06-16T11:30:00Z' })
    ];
    const http = fakeHttp(commentRoutes(comments));
    const { state } = await github.poll({
      source: source(),
      state: { cursor: null, seen: [] },
      http,
      log: () => {},
      now
    });
    expect(state.cursor).toBe('2026-06-16T11:30:00Z');
  });
});

describe('github backend — pagination follows Link: rel="next" (finding §4)', () => {
  it('accumulates comments across ALL pages before computing the cursor', async () => {
    const page1 = [
      ghComment({ id: 1, issueNumber: 42, updated_at: '2026-06-16T10:00:00Z' }),
      ghComment({ id: 2, issueNumber: 42, updated_at: '2026-06-16T10:30:00Z' })
    ];
    const page2 = [
      ghComment({ id: 3, issueNumber: 42, updated_at: '2026-06-16T11:00:00Z' }),
      ghComment({ id: 4, issueNumber: 42, updated_at: '2026-06-16T11:30:00Z' })
    ];
    const issue = ghIssue({ number: 42, assignee: 'alice' });
    const http = fakeHttp([
      {
        // page 1 has no `page` param; respond with a Link header to page 2.
        match: (url) => url.includes('/issues/comments') && !url.includes('page=2'),
        response: {
          status: 200,
          body: page1,
          headers: { Link: '<https://api.github.com/repos/octo/app/issues/comments?page=2>; rel="next"' }
        }
      },
      {
        match: (url) => url.includes('/issues/comments') && url.includes('page=2'),
        response: { status: 200, body: page2 } // no next -> last page
      },
      {
        match: (url, opts) =>
          (opts.method || 'GET').toUpperCase() === 'GET' &&
          /\/repos\/octo\/app\/issues\/\d+($|\?)/.test(String(url)),
        response: { status: 200, body: issue }
      }
    ]);

    const { events, state } = await github.poll({
      source: source(),
      state: { cursor: null, seen: [] },
      http,
      log: () => {},
      now
    });

    // All four comments (across both pages) became events.
    expect(events.map((e) => e.id).sort()).toEqual(
      ['gh:comment:1', 'gh:comment:2', 'gh:comment:3', 'gh:comment:4'].sort()
    );
    // Cursor is the max updated_at across BOTH pages (not just page 1).
    expect(state.cursor).toBe('2026-06-16T11:30:00Z');
    // Both pages were actually fetched.
    expect(http.calls.some((c) => c.url.includes('page=2'))).toBe(true);
  });
});

describe('github backend — failed poll does not advance the cursor (finding §5)', () => {
  it('a non-2xx comments response leaves the cursor + seen unchanged and emits nothing', async () => {
    const http = fakeHttp([
      { match: urlIncludes('/issues/comments'), response: { status: 500, body: { message: 'server error' } } }
    ]);
    const prior = { cursor: '2026-06-16T09:00:00Z', seen: ['gh:comment:99'] };
    const { events, state } = await github.poll({ source: source(), state: prior, http, log: () => {}, now });

    expect(events).toHaveLength(0);
    expect(state.cursor).toBe('2026-06-16T09:00:00Z'); // NOT advanced
    expect(state.seen).toEqual(['gh:comment:99']); // unchanged
  });

  it('a failed PARENT-issue fetch holds the comment for retry (not dropped, cursor held)', async () => {
    const comment = ghComment({ id: 7, issueNumber: 42, updated_at: '2026-06-16T10:00:00Z' });
    const http = fakeHttp([
      { match: urlIncludes('/issues/comments'), response: { status: 200, body: [comment] } },
      {
        // parent issue fetch FAILS
        match: (url, opts) =>
          (opts.method || 'GET').toUpperCase() === 'GET' &&
          /\/repos\/octo\/app\/issues\/\d+($|\?)/.test(String(url)),
        response: { status: 503, body: { message: 'unavailable' } }
      }
    ]);

    const { events, state } = await github.poll({
      source: source(),
      state: { cursor: null, seen: [] },
      http,
      log: () => {},
      now
    });

    // The comment is NOT emitted (parent unavailable) ...
    expect(events).toHaveLength(0);
    // ... NOT marked seen ...
    expect(state.seen).not.toContain('gh:comment:7');
    // ... and the cursor is held below its updated_at so the next poll retries it.
    expect(state.cursor == null || state.cursor < '2026-06-16T10:00:00Z').toBe(true);
  });
});

describe('github backend — dedup across overlapping polls (AC-13)', () => {
  it('AC-13: a comment on the inclusive `since` boundary is not re-emitted', async () => {
    const c1 = ghComment({ id: 1, issueNumber: 42, updated_at: '2026-06-16T10:00:00Z' });
    const c2 = ghComment({ id: 2, issueNumber: 42, updated_at: '2026-06-16T11:00:00Z' });

    // First poll sees both comments.
    const http1 = fakeHttp(commentRoutes([c1, c2]));
    const r1 = await github.poll({
      source: source(),
      state: { cursor: null, seen: [] },
      http: http1,
      log: () => {},
      now
    });
    expect(r1.events).toHaveLength(2);

    // Second poll: GitHub's `since` is inclusive, so c2 reappears at the boundary,
    // plus a genuinely new c3. Carry forward the returned state (cursor + seen).
    const c3 = ghComment({ id: 3, issueNumber: 42, updated_at: '2026-06-16T12:00:00Z' });
    const http2 = fakeHttp(commentRoutes([c2, c3]));
    const r2 = await github.poll({
      source: source(),
      state: r1.state,
      http: http2,
      log: () => {},
      now
    });

    const ids = r2.events.map((e) => e.id);
    // c2 already emitted -> only c3 is fresh. Assert the EXACT surviving id set.
    expect(ids).toEqual(['gh:comment:3']);
    // And r1 emitted exactly c1 + c2.
    expect(r1.events.map((e) => e.id)).toEqual(['gh:comment:1', 'gh:comment:2']);
  });

  it('AC-14: a comment id repeated with a new updated_at (edit) does not re-trigger by default', async () => {
    const original = ghComment({ id: 7, issueNumber: 42, updated_at: '2026-06-16T10:00:00Z', body: 'orig' });
    const http1 = fakeHttp(commentRoutes([original]));
    const r1 = await github.poll({
      source: source(),
      state: { cursor: null, seen: [] },
      http: http1,
      log: () => {},
      now
    });
    expect(r1.events).toHaveLength(1);

    const edited = ghComment({ id: 7, issueNumber: 42, updated_at: '2026-06-16T11:00:00Z', body: 'EDITED' });
    const http2 = fakeHttp(commentRoutes([edited]));
    const r2 = await github.poll({
      source: source(),
      state: r1.state,
      http: http2,
      log: () => {},
      now
    });
    // default dedup id = gh:comment:<id> (no updated_at) => edit is NOT re-emitted.
    expect(r2.events).toHaveLength(0);
  });
});

describe('github backend — issue_opened poll (AC-5)', () => {
  it('AC-5: issue_opened emits a new issue event and queries the issues endpoint', async () => {
    const issue = ghIssue({ id: 9001, number: 77, assignee: 'alice', created_at: '2026-06-16T11:00:00Z' });
    const http = fakeHttp([
      {
        match: (url) => /\/repos\/octo\/app\/issues(\?|$)/.test(String(url)) && !String(url).includes('/comments'),
        response: { status: 200, body: [issue] }
      }
    ]);

    const { events } = await github.poll({
      source: source(['issue_opened']),
      state: { cursor: '2026-06-16T09:00:00Z', seen: [] },
      http,
      log: () => {},
      now
    });

    expect(events).toHaveLength(1);
    expect(events[0].payload.assignee.login).toBe('alice');
    expect(String(events[0].meta.issue_number)).toBe('77');
    // issues list query carries sort=created & direction=asc
    const call = http.calls.find((c) => /\/issues(\?|$)/.test(c.url) && !c.url.includes('/comments'));
    expect(call.url).toContain('sort=created');
    expect(call.url).toContain('direction=asc');
  });

  it('AC-13: issue_opened post-filters to created_at > cursor (older items dropped)', async () => {
    const stale = ghIssue({ id: 1, number: 1, created_at: '2026-06-16T08:00:00Z' });
    const fresh = ghIssue({ id: 2, number: 2, created_at: '2026-06-16T11:00:00Z' });
    const http = fakeHttp([
      {
        match: (url) => /\/repos\/octo\/app\/issues(\?|$)/.test(String(url)) && !String(url).includes('/comments'),
        response: { status: 200, body: [stale, fresh] }
      }
    ]);
    const { events } = await github.poll({
      source: source(['issue_opened']),
      state: { cursor: '2026-06-16T10:00:00Z', seen: [] },
      http,
      log: () => {},
      now
    });
    // only the issue created AFTER the cursor survives
    expect(events).toHaveLength(1);
    expect(String(events[0].meta.issue_number)).toBe('2');
  });

  it('issue_opened uses created_at >= cursor so an equal-timestamp creation is not dropped, and dedup prevents re-emit (finding §7)', async () => {
    // An issue created EXACTLY at the cursor must still emit (>= not strict >).
    const atCursor = ghIssue({ id: 5, number: 5, created_at: '2026-06-16T10:00:00Z' });
    const routes = (body) => [
      {
        match: (url) => /\/repos\/octo\/app\/issues(\?|$)/.test(String(url)) && !String(url).includes('/comments'),
        response: { status: 200, body }
      }
    ];
    const r1 = await github.poll({
      source: source(['issue_opened']),
      state: { cursor: '2026-06-16T10:00:00Z', seen: [] },
      http: fakeHttp(routes([atCursor])),
      log: () => {},
      now
    });
    // Emitted despite created_at == cursor.
    expect(r1.events.map((e) => e.id)).toEqual(['gh:issue:5']);

    // Re-poll: the inclusive >= re-returns the same boundary issue; the seen-set
    // must drop it (no duplicate).
    const r2 = await github.poll({
      source: source(['issue_opened']),
      state: r1.state,
      http: fakeHttp(routes([atCursor])),
      log: () => {},
      now
    });
    expect(r2.events).toHaveLength(0);
  });
});

describe('github backend — issue_opened pagination + failed poll (findings §4/§5)', () => {
  const issuesRoute = (pages) => {
    // pages: array of { body, next? }
    let i = 0;
    return [
      {
        match: (url) => /\/repos\/octo\/app\/issues(\?|$)/.test(String(url)) && !String(url).includes('/comments'),
        response: () => {
          const page = pages[Math.min(i, pages.length - 1)];
          i += 1;
          const headers = page.next ? { Link: `<${page.next}>; rel="next"` } : {};
          return { status: 200, body: page.body, headers };
        }
      }
    ];
  };

  it('issue_opened accumulates across pages', async () => {
    const p1 = [ghIssue({ id: 1, number: 1, created_at: '2026-06-16T10:00:00Z' })];
    const p2 = [ghIssue({ id: 2, number: 2, created_at: '2026-06-16T11:00:00Z' })];
    const http = fakeHttp(
      issuesRoute([
        { body: p1, next: 'https://api.github.com/repos/octo/app/issues?page=2' },
        { body: p2 }
      ])
    );
    const { events } = await github.poll({
      source: source(['issue_opened']),
      state: { cursor: '2026-06-16T09:00:00Z', seen: [] },
      http,
      log: () => {},
      now
    });
    expect(events.map((e) => e.id).sort()).toEqual(['gh:issue:1', 'gh:issue:2'].sort());
  });

  it('a non-2xx issues response does not advance the cursor', async () => {
    const http = fakeHttp([
      {
        match: (url) => /\/repos\/octo\/app\/issues(\?|$)/.test(String(url)) && !String(url).includes('/comments'),
        response: { status: 500, body: { message: 'err' } }
      }
    ]);
    const prior = { cursor: '2026-06-16T09:00:00Z', seen: ['gh:issue:50'] };
    const { events, state } = await github.poll({
      source: source(['issue_opened']),
      state: prior,
      http,
      log: () => {},
      now
    });
    expect(events).toHaveLength(0);
    expect(state.cursor).toBe('2026-06-16T09:00:00Z');
    expect(state.seen).toEqual(['gh:issue:50']);
  });
});

describe('github backend — pr_opened poll + reply (SPEC §4.1)', () => {
  // A PR object as returned by GET /repos/{o}/{r}/pulls. PRs are shaped like
  // issues (number/user/created_at) for the comments API.
  const ghPull = (o = {}) => ({
    id: o.id ?? 7001,
    number: o.number ?? 88,
    title: o.title ?? 'Add a feature',
    body: o.body ?? 'this PR does things',
    state: o.state ?? 'open',
    user: { login: o.author ?? 'devvy' },
    created_at: o.created_at ?? '2026-06-16T11:00:00Z',
    updated_at: o.updated_at ?? '2026-06-16T11:00:00Z'
  });

  const pullsRoute = (body) => [
    {
      match: (url) => /\/repos\/octo\/app\/pulls(\?|$)/.test(String(url)),
      response: { status: 200, body }
    }
  ];

  it('queries /pulls with state=open, sort=created, direction=asc and emits a pr_opened event', async () => {
    const pr = ghPull({ id: 7001, number: 88, author: 'devvy', created_at: '2026-06-16T11:00:00Z' });
    const http = fakeHttp(pullsRoute([pr]));

    const { events } = await github.poll({
      source: source(['pr_opened']),
      state: { cursor: '2026-06-16T09:00:00Z', seen: [] },
      http,
      log: () => {},
      now
    });

    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.id).toBe('gh:pr:7001');
    expect(ev.meta.repo).toBe('octo/app');
    expect(String(ev.meta.issue_number)).toBe('88'); // PR number serves as issue_number
    expect(ev.meta.kind).toBe('pr_opened');
    expect(ev.meta.author).toBe('devvy');
    expect(ev.payload.number).toBe(88);
    // routing posts a reply to /issues/{number}/comments (PRs are issues for comments).
    expect(ev.routing).toMatchObject({ owner: 'octo', repo: 'app', issue_number: 88 });

    // The list query hit /pulls (NOT /issues/comments) with the right params.
    const call = http.calls.find((c) => /\/pulls(\?|$)/.test(c.url));
    expect(call).toBeTruthy();
    expect(call.url).toContain('state=open');
    expect(call.url).toContain('sort=created');
    expect(call.url).toContain('direction=asc');
    // A pr_opened-only source must NOT silently fall through to issue comments.
    expect(http.calls.some((c) => c.url.includes('/issues/comments'))).toBe(false);
  });

  it('post-filters to created_at >= cursor and dedups across overlapping polls', async () => {
    const stale = ghPull({ id: 1, number: 1, created_at: '2026-06-16T08:00:00Z' });
    const boundary = ghPull({ id: 2, number: 2, created_at: '2026-06-16T10:00:00Z' });
    const r1 = await github.poll({
      source: source(['pr_opened']),
      state: { cursor: '2026-06-16T10:00:00Z', seen: [] },
      http: fakeHttp(pullsRoute([stale, boundary])),
      log: () => {},
      now
    });
    // stale (before cursor) dropped; the boundary PR (== cursor, >=) survives.
    expect(r1.events.map((e) => e.id)).toEqual(['gh:pr:2']);

    // Re-poll: the inclusive >= re-returns the boundary PR; the seen-set drops it.
    const r2 = await github.poll({
      source: source(['pr_opened']),
      state: r1.state,
      http: fakeHttp(pullsRoute([boundary])),
      log: () => {},
      now
    });
    expect(r2.events).toHaveLength(0);
  });

  it('advances the cursor to the max created_at and does not advance on a failed poll', async () => {
    const prs = [
      ghPull({ id: 1, number: 1, created_at: '2026-06-16T10:00:00Z' }),
      ghPull({ id: 2, number: 2, created_at: '2026-06-16T11:30:00Z' })
    ];
    const { state } = await github.poll({
      source: source(['pr_opened']),
      state: { cursor: null, seen: [] },
      http: fakeHttp(pullsRoute(prs)),
      log: () => {},
      now
    });
    expect(state.cursor).toBe('2026-06-16T11:30:00Z');

    // A non-2xx /pulls response leaves cursor + seen untouched and emits nothing.
    const prior = { cursor: '2026-06-16T09:00:00Z', seen: ['gh:pr:50'] };
    const failed = await github.poll({
      source: source(['pr_opened']),
      state: prior,
      http: fakeHttp([
        { match: (url) => /\/pulls(\?|$)/.test(String(url)), response: { status: 500, body: { message: 'err' } } }
      ]),
      log: () => {},
      now
    });
    expect(failed.events).toHaveLength(0);
    expect(failed.state.cursor).toBe('2026-06-16T09:00:00Z');
    expect(failed.state.seen).toEqual(['gh:pr:50']);
  });

  it('AC-15: reply() to a pr_opened routing posts to /issues/{number}/comments', async () => {
    const http = fakeHttp([
      {
        match: methodAndUrl('POST', '/repos/octo/app/issues/88/comments'),
        response: { status: 201, body: { id: 600, html_url: 'https://github.com/octo/app/pull/88#c600' } }
      }
    ]);
    const result = await github.reply({
      routing: { owner: 'octo', repo: 'app', issue_number: 88 },
      text: 'LGTM',
      source: source(['pr_opened']),
      http
    });
    expect(result.ok).toBe(true);
    const post = http.calls.find((c) => c.method === 'POST');
    expect(post.url).toContain('/repos/octo/app/issues/88/comments');
    expect(JSON.parse(post.opts.body)).toEqual({ body: 'LGTM' });
  });
});

describe('github backend — validateConfig accepts all valid kinds', () => {
  it('accepts pr_opened and rejects unknown kinds', () => {
    expect(
      github.validateConfig({ id: 'x', config: { repo: 'o/r', events: ['pr_opened'] }, auth: { token: 't' } })
    ).toEqual([]);
    const bad = github.validateConfig({ id: 'x', config: { repo: 'o/r', events: ['nonsense'] }, auth: { token: 't' } });
    expect(bad.join('\n')).toMatch(/unknown kind/i);
  });
});

describe('github backend — reply (AC-15)', () => {
  it('AC-15: reply() POSTs to /repos/{o}/{r}/issues/{n}/comments with {body:text}', async () => {
    const http = fakeHttp([
      {
        match: methodAndUrl('POST', '/repos/octo/app/issues/42/comments'),
        response: { status: 201, body: { id: 555, html_url: 'https://github.com/octo/app/issues/42#c555' } }
      }
    ]);

    const result = await github.reply({
      routing: { owner: 'octo', repo: 'app', issue_number: 42 },
      text: 'thanks for the report',
      source: source(),
      http
    });

    expect(result.ok).toBe(true);
    const post = http.calls.find((c) => c.method === 'POST');
    expect(post).toBeTruthy();
    expect(post.url).toContain('/repos/octo/app/issues/42/comments');
    const sentBody = JSON.parse(post.opts.body);
    expect(sentBody).toEqual({ body: 'thanks for the report' });
  });

  it('AC-15: reply() reports ok:false on a non-2xx response', async () => {
    const http = fakeHttp([
      {
        match: methodAndUrl('POST', '/issues/42/comments'),
        response: { status: 404, body: { message: 'Not Found' } }
      }
    ]);
    const result = await github.reply({
      routing: { owner: 'octo', repo: 'app', issue_number: 42 },
      text: 'hi',
      source: source(),
      http
    });
    expect(result.ok).toBe(false);
  });
});
