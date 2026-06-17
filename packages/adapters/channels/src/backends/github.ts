// GitHub backend (SPEC §4.1 / §5.1, DESIGN §5.1).
//
// Supports two event kinds:
//   - issue_comment: GET /repos/{o}/{r}/issues/comments?sort=updated&direction=asc&since=<cursor>
//     Each comment resolves its parent issue from `issue_url` (one GET, cached
//     per issue within the poll) so filters like `issue.assignee.login` work.
//     Dedup id = gh:comment:<id> (default) or gh:comment:<id>:<updated_at>
//     (config.retriggerOnEdit) so an edit re-triggers only when configured.
//     Cursor = max updated_at observed.
//   - issue_opened: GET /repos/{o}/{r}/issues?state=open&sort=created&direction=asc&since=<cursor>
//     post-filtered to created_at > cursor (GitHub `since` is updated-based).
//     Dedup id = gh:issue:<id>. Cursor = max created_at.
//   - pr_opened: GET /repos/{o}/{r}/pulls?state=open&sort=created&direction=asc
//     post-filtered to created_at >= cursor (the /pulls endpoint has no `since`).
//     Dedup id = gh:pr:<id>. Cursor = max created_at. A PR is an issue for the
//     comments API, so routing uses the PR number and a reply posts to
//     /issues/{number}/comments.
//
// All network access goes through the injected `http` (fetch-like) so tests run
// offline. The core is the authoritative filter + dedup gate; this backend also
// applies the seen-set fallback so a direct `poll` (unit test) is at-most-once
// across overlapping `since` windows on its own.

import { defineBackend } from '../backend.js';
import { deriveNew } from '../dedup.js';
import type { PollContext, PollResult, ChannelEvent, ReplyArgs, ReplyResult } from '../types.js';

const DEFAULT_BASE = 'https://api.github.com';

/** The structural shape of a fetch-like response this backend reads. */
interface HttpResponseLike {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
  headers?: { get(name: string): string | null | undefined };
}

type HttpLike = (url: string | URL, opts?: Record<string, unknown>) => Promise<unknown>;

type AnySource = Record<string, any>;

/** Resolve the API base URL (overridable for GitHub Enterprise). */
function baseUrlFor(source: AnySource): string {
  const cfg = source?.config || {};
  return String(cfg.baseUrl || cfg.apiBaseUrl || DEFAULT_BASE).replace(/\/+$/, '');
}

/** Split "owner/name" into { owner, repo }. */
function splitRepo(repo: unknown): { owner: string; repo: string } {
  const [owner, name] = String(repo || '').split('/');
  return { owner, repo: name };
}

/** Authenticated request headers for the GitHub REST API. */
function ghHeaders(source: AnySource): Record<string, string> {
  return {
    authorization: `Bearer ${source?.auth?.token}`,
    accept: 'application/vnd.github+json'
  };
}

/** Pick the lexicographically-max ISO timestamp (ISO-8601 sorts chronologically). */
function maxTimestamp(values: (string | undefined | null)[], start: string | null): string | null {
  let max: string | null = start ?? null;
  for (const v of values) {
    if (v && (max == null || v > max)) max = v;
  }
  return max;
}

/** Parse the issue number out of a comment's `issue_url`. */
function issueNumberFromUrl(issueUrl: unknown): number | undefined {
  const m = /\/issues\/(\d+)(?:$|\?)/.exec(String(issueUrl || ''));
  return m ? Number(m[1]) : undefined;
}

/** Extract the `rel="next"` URL from a GitHub `Link` header, or null. */
function nextLink(res: HttpResponseLike): string | null {
  const header = res?.headers?.get?.('link') || res?.headers?.get?.('Link');
  if (!header) return null;
  // Link: <https://api.github.com/...?page=2>; rel="next", <...>; rel="last"
  for (const part of String(header).split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(part);
    if (m) return m[1];
  }
  return null;
}

/**
 * Fetch ALL pages of a GitHub list endpoint by following `Link: rel="next"`.
 * Returns `{ ok, items }`. On ANY non-2xx page it returns `{ ok:false }` with the
 * items gathered so far discarded by the caller — a failed poll must NOT advance
 * the cursor or mark items seen (SPEC §5, finding §4/§5). A `maxPages` guard
 * prevents a pathological loop.
 */
async function fetchAllPages(
  firstUrl: string,
  { http, source, maxPages = 50 }: { http: HttpLike; source: AnySource; maxPages?: number }
): Promise<{ ok: boolean; items: any[] }> {
  const items: any[] = [];
  let url: string | null = firstUrl;
  let pages = 0;
  while (url && pages < maxPages) {
    const res = (await http(url, { method: 'GET', headers: ghHeaders(source) })) as HttpResponseLike;
    if (!res || !res.ok) return { ok: false, items: [] };
    const page = await res.json().catch(() => null);
    if (Array.isArray(page)) items.push(...page);
    url = nextLink(res);
    pages += 1;
  }
  return { ok: true, items };
}

/**
 * Fetch a parent issue object, caching by issue_url within a single poll so two
 * comments on the same issue cost one GET. On a FAILED fetch we return null but
 * do NOT cache it, so the comment is retried on the next poll instead of being
 * permanently dropped (finding §5).
 */
async function resolveIssue(
  issueUrl: string,
  { http, source, cache }: { http: HttpLike; source: AnySource; cache: Map<string, any> }
): Promise<any> {
  if (cache.has(issueUrl)) return cache.get(issueUrl);
  const res = (await http(issueUrl, { method: 'GET', headers: ghHeaders(source) })) as HttpResponseLike;
  if (!res || !res.ok) return null; // do NOT cache a failure
  const issue = await res.json().catch(() => null);
  if (issue != null) cache.set(issueUrl, issue);
  return issue;
}

/** Poll the issue_comment endpoint. */
async function pollIssueComments(ctx: PollContext): Promise<PollResult> {
  const { source: srcRaw, state, http } = ctx;
  const source = srcRaw as AnySource;
  const cursor: string | null = (state?.cursor as string) ?? null;
  const seen: string[] = state?.seen ?? [];
  const { owner, repo } = splitRepo(source.config.repo);
  const retriggerOnEdit = !!source.config.retriggerOnEdit;

  const url = new URL(`${baseUrlFor(source)}/repos/${owner}/${repo}/issues/comments`);
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('direction', 'asc');
  if (cursor) url.searchParams.set('since', cursor);

  // Fetch ALL pages (follow Link: rel="next") so events past page 1 aren't lost.
  const { ok, items } = await fetchAllPages(url.toString(), { http: http as HttpLike, source });
  // On a failed poll, advance NOTHING: keep the prior cursor + seen, emit nothing.
  if (!ok) return { events: [], state: { cursor, seen } };
  const list = items;

  // Dedup id derivation; the seen-set drops already-emitted (boundary/edit) items.
  const idOf = (c: any) =>
    retriggerOnEdit ? `gh:comment:${c.id}:${c.updated_at}` : `gh:comment:${c.id}`;
  const { fresh } = deriveNew(list, { idOf, seen });

  // Resolve parent issues (cached per issue_url) and build events. A comment whose
  // parent fetch FAILS is left unprocessed: it is not emitted, not marked seen,
  // and the cursor is held below its updated_at so the next poll retries it
  // (finding §5).
  const cache = new Map<string, any>();
  const events: ChannelEvent[] = [];
  const emittedIds: string[] = [];
  // The cursor may only advance up to the newest comment we fully processed
  // (every comment <= it succeeded). Track the failure boundary.
  let failureBoundary: string | null = null; // earliest updated_at we could NOT process
  for (const c of fresh) {
    const issue = await resolveIssue(c.issue_url, { http: http as HttpLike, source, cache });
    if (issue == null) {
      // Parent fetch failed → hold the cursor below this comment.
      if (c.updated_at && (failureBoundary == null || c.updated_at < failureBoundary)) {
        failureBoundary = c.updated_at;
      }
      continue;
    }
    const issueNumber = issueNumberFromUrl(c.issue_url);
    const author = c.user?.login;
    const payload = { ...c, issue };
    events.push({
      id: idOf(c),
      content: contentForComment(c, issue),
      meta: {
        repo: source.config.repo,
        issue_number: String(issueNumber),
        kind: 'issue_comment',
        author: author == null ? '' : String(author)
      },
      payload,
      routing: { owner, repo, issue_number: issueNumber }
    });
    emittedIds.push(idOf(c));
  }

  // seen grows only with the comments we actually emitted (so a held-back comment
  // is reconsidered next poll).
  const nextSeen = [...seen, ...emittedIds];

  // Cursor = max updated_at observed, but never at/after a failed-parent comment
  // (so `since` re-includes it next poll). When no failure, advance to the max.
  const observed: string[] = list.map((c: any) => c.updated_at).filter(Boolean);
  let nextCursor = maxTimestamp(observed, cursor);
  if (failureBoundary != null) {
    // Clamp to strictly-before the failure boundary; fall back to prior cursor.
    const safe = observed.filter((t) => t < failureBoundary!);
    nextCursor = maxTimestamp(safe, cursor);
    // Guard: never advance to or past the boundary.
    if (nextCursor != null && nextCursor >= failureBoundary) nextCursor = cursor;
  }

  return { events, state: { cursor: nextCursor, seen: nextSeen } };
}

/** Build the channel content for a comment (body + short issue context). */
function contentForComment(comment: any, issue: any): string {
  const body = comment?.body ?? '';
  const title = issue?.title ?? '';
  return `${body}\n\n(on issue #${issue?.number ?? ''}: ${title})`;
}

/** Poll the issue_opened endpoint. */
async function pollIssuesOpened(ctx: PollContext): Promise<PollResult> {
  const { source: srcRaw, state, http } = ctx;
  const source = srcRaw as AnySource;
  const cursor: string | null = (state?.cursor as string) ?? null;
  const seen: string[] = state?.seen ?? [];
  const { owner, repo } = splitRepo(source.config.repo);

  const url = new URL(`${baseUrlFor(source)}/repos/${owner}/${repo}/issues`);
  url.searchParams.set('state', 'open');
  url.searchParams.set('sort', 'created');
  url.searchParams.set('direction', 'asc');
  if (cursor) url.searchParams.set('since', cursor);

  // Fetch ALL pages (follow Link: rel="next") so issues past page 1 aren't lost.
  const { ok, items } = await fetchAllPages(url.toString(), { http: http as HttpLike, source });
  // On a failed poll, advance NOTHING: keep the prior cursor + seen, emit nothing.
  if (!ok) return { events: [], state: { cursor, seen } };
  const list = items;

  // GitHub `since` is updated-based; post-filter to genuinely-new creations.
  // Use created_at >= cursor (not strict >) + the seen-set so equal-timestamp
  // creations on the boundary aren't dropped (finding §7); dedup drops repeats.
  const created = list.filter((i: any) => !cursor || (i.created_at && i.created_at >= cursor));

  const idOf = (i: any) => `gh:issue:${i.id}`;
  const { fresh, seen: nextSeen } = deriveNew(created, { idOf, seen });

  const events: ChannelEvent[] = fresh.map((issue: any) => {
    const author = issue.user?.login;
    return {
      id: idOf(issue),
      content: contentForIssue(issue),
      meta: {
        repo: source.config.repo,
        issue_number: String(issue.number),
        kind: 'issue_opened',
        author: author == null ? '' : String(author)
      },
      payload: issue,
      routing: { owner, repo, issue_number: issue.number }
    };
  });

  // Cursor = max created_at observed (across all returned, so we never re-window).
  const nextCursor = maxTimestamp(list.map((i: any) => i.created_at), cursor);

  return { events, state: { cursor: nextCursor, seen: nextSeen } };
}

/** Build the channel content for an opened issue (title + body). */
function contentForIssue(issue: any): string {
  const title = issue?.title ?? '';
  const body = issue?.body ?? '';
  return `${title}\n\n${body}`;
}

/**
 * Poll the pr_opened endpoint: GET /repos/{o}/{r}/pulls?state=open&sort=created&
 * direction=asc. The /pulls endpoint has no `since` param, so (consistent with
 * issue_opened) we post-filter to created_at >= cursor + lean on the seen-set so a
 * boundary creation isn't dropped, dedup by `gh:pr:<id>`, and advance the cursor to
 * the max created_at observed. A PR is an issue for the comments API, so routing
 * uses the PR `number` as issue_number and a reply still posts to
 * /issues/{n}/comments (SPEC §4.1).
 */
async function pollPullsOpened(ctx: PollContext): Promise<PollResult> {
  const { source: srcRaw, state, http } = ctx;
  const source = srcRaw as AnySource;
  const cursor: string | null = (state?.cursor as string) ?? null;
  const seen: string[] = state?.seen ?? [];
  const { owner, repo } = splitRepo(source.config.repo);

  const url = new URL(`${baseUrlFor(source)}/repos/${owner}/${repo}/pulls`);
  url.searchParams.set('state', 'open');
  url.searchParams.set('sort', 'created');
  url.searchParams.set('direction', 'asc');

  // Fetch ALL pages (follow Link: rel="next") so PRs past page 1 aren't lost.
  const { ok, items } = await fetchAllPages(url.toString(), { http: http as HttpLike, source });
  // On a failed poll, advance NOTHING: keep the prior cursor + seen, emit nothing.
  if (!ok) return { events: [], state: { cursor, seen } };
  const list = items;

  // created_at >= cursor (not strict >) + the seen-set so an equal-timestamp
  // creation on the boundary isn't dropped (mirrors issue_opened, finding §7).
  const created = list.filter((p: any) => !cursor || (p.created_at && p.created_at >= cursor));

  const idOf = (p: any) => `gh:pr:${p.id}`;
  const { fresh, seen: nextSeen } = deriveNew(created, { idOf, seen });

  const events: ChannelEvent[] = fresh.map((pr: any) => {
    const author = pr.user?.login;
    return {
      id: idOf(pr),
      content: contentForIssue(pr),
      meta: {
        repo: source.config.repo,
        issue_number: String(pr.number),
        kind: 'pr_opened',
        author: author == null ? '' : String(author)
      },
      payload: pr,
      // A PR is an issue for the comments API: reply posts to /issues/{number}/comments.
      routing: { owner, repo, issue_number: pr.number }
    };
  });

  // Cursor = max created_at observed (across all returned, so we never re-window).
  const nextCursor = maxTimestamp(list.map((p: any) => p.created_at), cursor);

  return { events, state: { cursor: nextCursor, seen: nextSeen } };
}

/** The GitHub event kinds this backend understands. */
const GH_EVENT_KINDS = new Set(['issue_comment', 'issue_opened', 'pr_opened']);

export default defineBackend({
  type: 'github',

  /**
   * Validate a GitHub source at config-load time so misconfiguration is a clear
   * validation error rather than a crash at poll time (SPEC §4.1, AC-3). Requires
   * config.repo as "owner/name", a non-empty events list, and auth.token.
   */
  validateConfig(source: Record<string, unknown>): string[] {
    const s = source as AnySource;
    const errors: string[] = [];
    const id = s?.id ?? '(unknown)';
    const cfg = s?.config || {};

    const repo = cfg.repo;
    if (typeof repo !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
      errors.push(`Source "${id}": github config.repo must be "owner/name".`);
    }

    const events = cfg.events;
    if (!Array.isArray(events) || events.length === 0) {
      errors.push(`Source "${id}": github config.events must be a non-empty array.`);
    } else {
      const bad = events.filter((e: unknown) => !GH_EVENT_KINDS.has(e as string));
      if (bad.length) {
        errors.push(
          `Source "${id}": github config.events has unknown kind(s) ${JSON.stringify(bad)} ` +
            `(valid: ${[...GH_EVENT_KINDS].join(', ')}).`
        );
      }
    }

    if (!s?.auth?.token) {
      errors.push(`Source "${id}": github auth.token is required.`);
    }

    return errors;
  },

  async poll(ctx: PollContext): Promise<PollResult> {
    const events = (ctx?.source as AnySource)?.config?.events || [];
    if (events.includes('issue_opened')) {
      return pollIssuesOpened(ctx);
    }
    if (events.includes('pr_opened')) {
      return pollPullsOpened(ctx);
    }
    // Default to the issue_comment path.
    return pollIssueComments(ctx);
  },

  /**
   * Post a comment back to the originating issue/PR.
   */
  async reply({ routing, text, source, http }: ReplyArgs): Promise<ReplyResult> {
    const r = routing as AnySource;
    const owner = r?.owner;
    const repo = r?.repo;
    const issueNumber = r?.issue_number;
    const url = `${baseUrlFor(source as AnySource)}/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    const res = (await http(url, {
      method: 'POST',
      headers: { ...ghHeaders(source as AnySource), 'content-type': 'application/json' },
      body: JSON.stringify({ body: text })
    })) as HttpResponseLike;
    if (res && res.ok) {
      const created = (await res.json().catch(() => null)) as any;
      return { ok: true, ref: created ? String(created.html_url ?? created.id ?? '') : undefined };
    }
    return { ok: false };
  }
});
