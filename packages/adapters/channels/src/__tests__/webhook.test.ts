import { describe, it, expect, vi } from 'vitest';
import webhook from '../backends/webhook.js';
import { registry } from '../index.js';
import type { PollContext } from '../types.js';

// OPTIONAL additive webhook backend (built on @a5c-ai/triggers-adapter
// normalizeEvent). It is registered alongside github + jira and does NOT alter
// them.
//   - poll: queued GitHub webhook payload -> a channel event whose content/meta/
//     routing come from the triggers-adapter normalization.
//   - validateConfig: backend + a queue source required.
//   - dir-queue source: reads captured *.json payloads through an injected fs.
//   - dedup: a payload already emitted is not re-emitted on the next poll.
//   - reply: a webhook has no callback channel -> a clear error (no silent no-op).

const ctx = (source: Record<string, unknown>, seen: string[] = []): PollContext => ({
  source,
  state: { cursor: null, seen },
  http: async () => {
    throw new Error('webhook backend must not perform network I/O during poll');
  },
  log: () => {},
  now: new Date('2026-06-17T00:00:00Z')
});

/** A representative GitHub issue_comment webhook payload (the shape a receiver
 *  captures from a GitHub delivery). */
function ghIssueCommentPayload(overrides: Record<string, any> = {}) {
  return {
    action: 'created',
    issue: { number: 7, title: 'Investigate flaky test', html_url: 'https://github.com/octo/app/issues/7' },
    comment: { body: '@agent please look', html_url: 'https://github.com/octo/app/issues/7#issuecomment-1' },
    repository: { full_name: 'octo/app' },
    sender: { login: 'alice' },
    ...overrides
  };
}

describe('webhook backend — poll normalizes via triggers-adapter (Task B)', () => {
  it('turns a queued GitHub webhook payload into a channel event using normalizeEvent', async () => {
    const source = {
      id: 'wh-github',
      backend: 'webhook',
      config: {
        backend: 'github',
        payloads: [
          { eventName: 'issue_comment', id: 'delivery-abc', payload: ghIssueCommentPayload() }
        ]
      }
    };

    const { events } = await webhook.poll(ctx(source));

    expect(events).toHaveLength(1);
    const ev = events[0];

    // Content comes from the normalized title/body (triggers-adapter prefers the
    // comment body for issue_comment).
    expect(ev.content).toContain('@agent please look');
    expect(ev.content).toContain('Investigate flaky test');

    // meta is derived from the NORMALIZED shape (proving normalizeEvent ran).
    expect(ev.meta.backend).toBe('github');
    expect(ev.meta.event).toBe('issue_comment');
    expect(ev.meta.action).toBe('created');
    expect(ev.meta.repo).toBe('octo/app');
    expect(ev.meta.author).toBe('alice');
    expect(ev.meta.url).toBe('https://github.com/octo/app/issues/7#issuecomment-1');

    // payload is the raw upstream object so dot-path filters can match.
    expect((ev.payload as any).issue.number).toBe(7);

    // routing carries the normalized identity (used for diagnostics — reply is
    // unsupported, see below).
    expect(ev.routing.backend).toBe('github');
    expect(ev.routing.repository).toBe('octo/app');

    // The explicit delivery id is honored in the dedup id.
    expect(ev.id).toBe('webhook:github:delivery-abc');
  });

  it('uses the configured eventName fallback for a bare payload (no envelope)', async () => {
    const source = {
      id: 'wh-generic',
      backend: 'webhook',
      config: {
        backend: 'generic-webhook',
        eventName: 'deployment',
        payloads: [{ event: 'deployment', actor: 'bot', repository: 'team/repo' }]
      }
    };

    const { events } = await webhook.poll(ctx(source));
    expect(events).toHaveLength(1);
    expect(events[0].meta.backend).toBe('generic-webhook');
    // generic-webhook reads eventName from the payload's `event` field.
    expect(events[0].meta.event).toBe('deployment');
    expect(events[0].meta.repo).toBe('team/repo');
  });

  it('reads captured *.json payloads from config.dir through an injected fs', async () => {
    const readdir = vi.fn(async () => ['02-second.json', '01-first.json', 'ignore.txt']);
    const readFile = vi.fn(async (path: string) => {
      if (path.endsWith('01-first.json')) {
        return JSON.stringify(ghIssueCommentPayload({ comment: { body: 'first', html_url: 'u1' } }));
      }
      return JSON.stringify(ghIssueCommentPayload({ comment: { body: 'second', html_url: 'u2' } }));
    });

    const source = {
      id: 'wh-dir',
      backend: 'webhook',
      config: { backend: 'github', eventName: 'issue_comment', dir: '/captured', fs: { readdir, readFile } }
    };

    const { events } = await webhook.poll(ctx(source));

    // Only the two *.json files are read (the .txt is ignored), sorted by name.
    expect(readFile).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(2);
    expect(events[0].content).toContain('first');
    expect(events[1].content).toContain('second');
  });

  it('skips an unparseable dir payload without failing the whole poll', async () => {
    const readdir = vi.fn(async () => ['bad.json', 'good.json']);
    const readFile = vi.fn(async (path: string) =>
      path.endsWith('bad.json') ? '{not json' : JSON.stringify(ghIssueCommentPayload())
    );
    const logs: string[] = [];
    const source = {
      id: 'wh-dir',
      backend: 'webhook',
      config: { backend: 'github', eventName: 'issue_comment', dir: '/captured', fs: { readdir, readFile } }
    };
    const c = ctx(source);
    c.log = (...args: unknown[]) => logs.push(args.join(' '));

    const { events } = await webhook.poll(c);
    expect(events).toHaveLength(1);
    expect(logs.join('\n')).toMatch(/skipping unparseable/);
  });

  it('returns empty + logs when config.dir cannot be read', async () => {
    const readdir = vi.fn(async () => {
      throw new Error('ENOENT');
    });
    const logs: string[] = [];
    const source = {
      id: 'wh-dir',
      backend: 'webhook',
      config: { backend: 'github', dir: '/missing', fs: { readdir, readFile: vi.fn() } }
    };
    const c = ctx(source);
    c.log = (...args: unknown[]) => logs.push(args.join(' '));

    const { events } = await webhook.poll(c);
    expect(events).toEqual([]);
    expect(logs.join('\n')).toMatch(/failed to read dir/);
  });

  it('dedups: a payload already in seen is not re-emitted', async () => {
    const source = {
      id: 'wh-dedup',
      backend: 'webhook',
      config: {
        backend: 'github',
        payloads: [{ eventName: 'issue_comment', id: 'd1', payload: ghIssueCommentPayload() }]
      }
    };

    const first = await webhook.poll(ctx(source));
    expect(first.events).toHaveLength(1);
    const seen = first.state.seen ?? [];
    expect(seen).toContain('webhook:github:d1');

    // Second poll with the carried-forward seen-set emits nothing.
    const second = await webhook.poll(ctx(source, seen));
    expect(second.events).toHaveLength(0);
  });

  it('derives a stable dedup id from the normalized shape when no explicit id is given', async () => {
    const source = {
      id: 'wh-id',
      backend: 'webhook',
      config: { backend: 'github', payloads: [{ eventName: 'push', payload: { after: 'sha123', repository: { full_name: 'o/r' } } }] }
    };
    const { events } = await webhook.poll(ctx(source));
    expect(events[0].id).toContain('webhook:github:push');
    expect(events[0].id).toContain('sha123');
  });

  it('defaults an unknown/missing config.backend to generic-webhook', async () => {
    const source = {
      id: 'wh-default',
      backend: 'webhook',
      config: { payloads: [{ eventName: 'ping', payload: { event: 'ping' } }] }
    };
    const { events } = await webhook.poll(ctx(source));
    expect(events[0].meta.backend).toBe('generic-webhook');
  });
});

describe('webhook backend — validateConfig (Task B)', () => {
  it('reports a missing/invalid backend and a missing queue source', () => {
    const problems = webhook.validateConfig!({ id: 'x', config: {} });
    expect(problems.join('\n')).toMatch(/config\.backend must be one of/);
    expect(problems.join('\n')).toMatch(/config\.payloads.*or config\.dir/);
  });

  it('accepts a valid inline-queue config', () => {
    expect(
      webhook.validateConfig!({ id: 'x', config: { backend: 'github', payloads: [] } })
    ).toEqual([]);
  });

  it('accepts a valid dir-queue config', () => {
    expect(
      webhook.validateConfig!({ id: 'x', config: { backend: 'gitlab', dir: '/captured' } })
    ).toEqual([]);
  });

  it('flags a non-string eventName', () => {
    const problems = webhook.validateConfig!({
      id: 'x',
      config: { backend: 'github', payloads: [], eventName: 123 }
    });
    expect(problems.join('\n')).toMatch(/eventName must be a string/);
  });
});

describe('webhook backend — reply is unsupported (no silent fallback)', () => {
  it('throws a clear, actionable error rather than no-op succeeding', async () => {
    await expect(
      webhook.reply({
        routing: { backend: 'github', eventName: 'issue_comment', repository: 'octo/app' },
        text: 'hi',
        source: {},
        http: async () => ({})
      })
    ).rejects.toThrow(/does not support reply/i);
  });
});

describe('webhook backend — registered alongside github + jira', () => {
  it('registry.get("webhook") returns the real built-in (github + jira intact)', () => {
    expect(registry.get('webhook')).toBe(webhook);
    expect(registry.get('github')).toBeTruthy();
    expect(registry.get('jira')).toBeTruthy();
    expect(registry.get('webhook')!.type).toBe('webhook');
  });
});
