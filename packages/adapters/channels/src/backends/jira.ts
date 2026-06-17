// Jira backend (SPEC §4.2 / §5.2, DESIGN §5.2).
//
// Poll: POST {baseUrl}/rest/api/3/search with JQL
//   project = "<P>" AND created >= "<cursor>" ORDER BY created ASC
// (uses `updated` for the issue_updated event), plus any config.jql extra clause.
// The `created >=` clause is omitted when the cursor is null (first poll).
//
// The catch: Jira JQL datetime comparisons are minute-granularity, so two issues
// created in the same minute as the cursor both re-match `created >= "<cursor>"`
// on the next poll. The cursor alone cannot guarantee at-most-once, so we combine
// it with a seen-set keyed by `jira:<key>:<created>` (issue key + full timestamp).
// Re-matched same-minute issues are recognized as already-seen and dropped.
//
// All network access goes through the injected `http` (fetch-like) so tests run
// offline. Auth is HTTP Basic: base64(email:token).

import { defineBackend } from '../backend.js';
import { deriveNew } from '../dedup.js';
import type { PollContext, PollResult, ChannelEvent, ReplyArgs, ReplyResult } from '../types.js';

interface HttpResponseLike {
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
}

type HttpLike = (url: string | URL, opts?: Record<string, unknown>) => Promise<unknown>;
type AnySource = Record<string, any>;

/** Resolve the Jira site base URL. */
function baseUrlFor(source: AnySource): string {
  return String(source?.auth?.baseUrl || source?.config?.baseUrl || '').replace(/\/+$/, '');
}

/** Authenticated request headers for the Jira Cloud REST API (Basic auth). */
function jiraHeaders(source: AnySource): Record<string, string> {
  const email = source?.auth?.email ?? '';
  const token = source?.auth?.token ?? '';
  const basic = Buffer.from(`${email}:${token}`, 'utf8').toString('base64');
  return {
    authorization: `Basic ${basic}`,
    accept: 'application/json',
    'content-type': 'application/json'
  };
}

/** Which timestamp field this event kind orders/filters on. */
function timeField(events: unknown): string {
  return Array.isArray(events) && events.includes('issue_updated') ? 'updated' : 'created';
}

/** The event kind label for meta. */
function kindFor(events: unknown): string {
  return Array.isArray(events) && events.includes('issue_updated')
    ? 'issue_updated'
    : 'issue_created';
}

/** A Jira project key must be a safe identifier so it can't inject into the JQL. */
const PROJECT_RE = /^[A-Za-z0-9_]+$/;

/**
 * Format a stored cursor (a full-precision Jira/ISO timestamp) into the
 * JQL-accepted quoted `"yyyy-MM-dd HH:mm"` literal (minute granularity). Jira
 * rejects sub-minute precision in datetime comparisons, so we down-convert for
 * the QUERY only; the full-precision timestamp is kept in the cursor + seen-set
 * key so same-minute dedup still works (SPEC §5.2, finding §10).
 * Returns null if the cursor can't be parsed (the clause is then omitted).
 */
function jqlDateLiteral(cursor: string | null): string | null {
  if (!cursor) return null;
  const d = new Date(cursor);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  // Use UTC so the literal is stable regardless of the host timezone.
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  );
}

/**
 * Build the JQL string for this poll. The project is validated against
 * [A-Za-z0-9_]+ (defensive: validateConfig already enforces this) and any
 * config.jql extra clause is wrapped + quote-escaped so neither can inject into
 * the query.
 */
function buildJql(source: AnySource, cursor: string | null, field: string): string {
  const project = source.config.project;
  if (!PROJECT_RE.test(String(project))) {
    // Defensive: should be unreachable (validateConfig rejects this at load).
    throw new Error(`jira: unsafe project key ${JSON.stringify(project)}`);
  }
  const clauses = [`project = "${project}"`];

  const dateLiteral = jqlDateLiteral(cursor);
  if (dateLiteral) clauses.push(`${field} >= "${dateLiteral}"`);

  if (source.config.jql) {
    // config.jql is OPERATOR-supplied input from the trusted YAML config (NOT
    // external/attacker-controlled channel data), so it is trusted JQL-operator
    // input. The quote/backslash/semicolon strip below is therefore
    // DEFENSE-IN-DEPTH only — a belt-and-suspenders guard so an accidental stray
    // quote in a hand-written clause can't terminate the surrounding string and
    // smuggle a trailing clause — not a sanitizer for untrusted input. The
    // fragment is wrapped in parentheses so it composes as a single AND term.
    const jql = String(source.config.jql).replace(/["\\;]/g, '');
    if (jql.trim().length) clauses.push(`(${jql})`);
  }

  return `${clauses.join(' AND ')} ORDER BY ${field} ASC`;
}

/** Wrap plain reply text in a minimal Atlassian Document Format (ADF) body. */
function adfBody(text: unknown): { body: Record<string, unknown> } {
  return {
    body: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: String(text ?? '') }]
        }
      ]
    }
  };
}

/** Pick the lexicographically-max timestamp (ISO-ish strings sort chronologically). */
function maxTimestamp(values: (string | undefined | null)[], start: string | null): string | null {
  let max: string | null = start ?? null;
  for (const v of values) {
    if (v && (max == null || v > max)) max = v;
  }
  return max;
}

/** Build the channel content for an issue (summary + key context). */
function contentForIssue(issue: any): string {
  const summary = issue?.fields?.summary ?? '';
  return `${summary}\n\n(${issue?.key ?? ''})`;
}

/** The Jira event kinds this backend understands. */
const JIRA_EVENT_KINDS = new Set(['issue_created', 'issue_updated']);

/** Page size for the paginated /search loop. */
const PAGE_SIZE = 50;

/**
 * Run the Jira /search query across ALL pages by looping `startAt` until
 * `startAt + len >= total`, accumulating every issue before the caller computes
 * the cursor (so the cursor never advances past unfetched issues — finding §4).
 * On ANY non-2xx page returns `{ ok:false, issues:[] }` so a failed poll advances
 * nothing (finding §5). A `maxPages` guard bounds a pathological loop.
 */
async function searchAll(
  url: string,
  jql: string,
  source: AnySource,
  http: HttpLike,
  maxPages = 200
): Promise<{ ok: boolean; issues: any[] }> {
  const all: any[] = [];
  let startAt = 0;
  let pages = 0;
  // total defaults to +Inf until the first page tells us the real count.
  let total = Infinity;
  while (startAt < total && pages < maxPages) {
    const res = (await http(url, {
      method: 'POST',
      headers: jiraHeaders(source),
      body: JSON.stringify({ jql, startAt, maxResults: PAGE_SIZE })
    })) as HttpResponseLike;
    if (!res || !res.ok) return { ok: false, issues: [] };
    const data = (await res.json().catch(() => null)) as any;
    const issues = Array.isArray(data?.issues) ? data.issues : [];
    all.push(...issues);

    total = typeof data?.total === 'number' ? data.total : all.length;
    pages += 1;
    // Advance by what we actually received; stop if a page came back empty.
    if (issues.length === 0) break;
    startAt += issues.length;
  }
  return { ok: true, issues: all };
}

export default defineBackend({
  type: 'jira',

  /**
   * Validate a Jira source at config-load time so misconfiguration is a clear
   * validation error rather than a crash at poll time (SPEC §4.2, AC-3). Requires
   * config.project (safe identifier), a non-empty events list, and
   * auth.baseUrl/email/token. Also rejects a project value that could inject into
   * the JQL string (SPEC §9 security).
   */
  validateConfig(source: Record<string, unknown>): string[] {
    const s = source as AnySource;
    const errors: string[] = [];
    const id = s?.id ?? '(unknown)';
    const cfg = s?.config || {};
    const auth = s?.auth || {};

    const project = cfg.project;
    if (typeof project !== 'string' || project.length === 0) {
      errors.push(`Source "${id}": jira config.project is required.`);
    } else if (!PROJECT_RE.test(project)) {
      errors.push(
        `Source "${id}": jira config.project must match [A-Za-z0-9_]+ ` +
          `(got ${JSON.stringify(project)}).`
      );
    }

    const events = cfg.events;
    if (!Array.isArray(events) || events.length === 0) {
      errors.push(`Source "${id}": jira config.events must be a non-empty array.`);
    } else {
      const bad = events.filter((e: unknown) => !JIRA_EVENT_KINDS.has(e as string));
      if (bad.length) {
        errors.push(
          `Source "${id}": jira config.events has unknown kind(s) ${JSON.stringify(bad)} ` +
            `(valid: ${[...JIRA_EVENT_KINDS].join(', ')}).`
        );
      }
    }

    if (!auth.baseUrl) errors.push(`Source "${id}": jira auth.baseUrl is required.`);
    if (!auth.email) errors.push(`Source "${id}": jira auth.email is required.`);
    if (!auth.token) errors.push(`Source "${id}": jira auth.token is required.`);

    return errors;
  },

  async poll(ctx: PollContext): Promise<PollResult> {
    const { source: srcRaw, state, http } = ctx;
    const source = srcRaw as AnySource;
    const cursor: string | null = (state?.cursor as string) ?? null;
    const seen: string[] = state?.seen ?? [];
    const events = source?.config?.events;
    const field = timeField(events);
    const kind = kindFor(events);

    const jql = buildJql(source, cursor, field);
    const url = `${baseUrlFor(source)}/rest/api/3/search`;

    // Fetch ALL pages (loop startAt until startAt+len >= total) so issues beyond
    // the first page aren't lost and the cursor never advances past them.
    const { ok, issues } = await searchAll(url, jql, source, http as HttpLike);
    // On a failed poll, advance NOTHING: keep the prior cursor + seen, emit nothing.
    if (!ok) return { events: [], state: { cursor, seen } };

    // Seen-set keyed by <key>:<created> (full timestamp) defeats minute-granularity
    // JQL re-matches: a same-minute issue re-returned next poll is already seen.
    const fieldOf = (issue: any) => issue?.fields?.[field];
    const idOf = (issue: any) => `jira:${issue.key}:${fieldOf(issue)}`;
    const { fresh, seen: nextSeen } = deriveNew(issues, { idOf, seen });

    const channelEvents: ChannelEvent[] = fresh.map((issue: any) => ({
      id: idOf(issue),
      content: contentForIssue(issue),
      meta: {
        project: issue?.fields?.project?.key ?? source.config.project,
        issue_key: issue.key,
        kind
      },
      payload: issue,
      routing: { key: issue.key }
    }));

    // Cursor = max created/updated observed across the returned issues.
    const nextCursor = maxTimestamp(issues.map(fieldOf), cursor);

    return { events: channelEvents, state: { cursor: nextCursor, seen: nextSeen } };
  },

  /**
   * Post a comment back to the originating Jira issue (ADF body).
   */
  async reply({ routing, text, source, http }: ReplyArgs): Promise<ReplyResult> {
    const key = (routing as AnySource)?.key;
    const url = `${baseUrlFor(source as AnySource)}/rest/api/3/issue/${key}/comment`;
    const res = (await http(url, {
      method: 'POST',
      headers: jiraHeaders(source as AnySource),
      body: JSON.stringify(adfBody(text))
    })) as HttpResponseLike;
    if (res && res.ok) {
      const created = (await res.json().catch(() => null)) as any;
      return { ok: true, ref: created ? String(created.id ?? '') : undefined };
    }
    return { ok: false };
  }
});
