// Webhook backend (OPTIONAL, additive — SPEC §4 backend contract, DESIGN §5).
//
// An ADDITIVE built-in backend alongside `github` and `jira`. It does NOT replace
// or alter them. It turns INBOUND WEBHOOK PAYLOADS (GitHub / GitLab / Bitbucket /
// generic) into channel events by delegating the parsing to the genuine
// `@a5c-ai/triggers-adapter` `normalizeEvent(backend, eventName, payload)` — the
// same normalizer the triggers-adapter uses for CI/action triggers — so the
// channels framework reuses that battle-tested webhook-shape knowledge instead of
// re-deriving it.
//
// Channels is POLL-BASED, so this backend reads a QUEUE of already-captured
// webhook payloads from a configured source and normalizes each on every poll:
//   - `config.payloads`: an inline array of captured webhook entries (the
//     injection seam — used by tests and by a caller that buffers receipts itself).
//   - `config.dir`: a directory of captured `*.json` payload files (read through
//     the injected `readDir`/`readFile` so the suite stays offline; defaults to the
//     real node:fs/promises when unset).
// Each queue entry is `{ eventName, payload, id? }` (or a bare payload object, in
// which case `eventName` falls back to `config.eventName`).
//
// LIVE HTTP webhook RECEIPT is intentionally OUT OF SCOPE here (it needs a bound
// HTTP listener / tunnel, mirroring how the spawner documents live agent launch as
// out of offline-test scope, DESIGN §7.7). This backend only normalizes payloads
// that some out-of-band receiver has already captured and queued.
//
// REPLY: a webhook is a one-way notification; there is no generic callback channel
// to post back to. `reply()` therefore surfaces a CLEAR, actionable error rather
// than silently dropping the reply (fallbacks are evil). A caller that wants to
// reply should route through the concrete backend (`github`/`jira`) the payload
// originated from, not through `webhook`.

import { normalizeEvent } from '@a5c-ai/triggers-adapter';
import type { NormalizedTriggerEvent, TriggerBackend } from '@a5c-ai/triggers-adapter';
import { defineBackend } from '../backend.js';
import { deriveNew } from '../dedup.js';
import type { PollContext, PollResult, ChannelEvent, ReplyArgs, ReplyResult } from '../types.js';

type AnySource = Record<string, any>;

/** The webhook backends `normalizeEvent` understands (mirrors TriggerBackend). */
const WEBHOOK_BACKENDS: ReadonlySet<TriggerBackend> = new Set([
  'github',
  'gitlab',
  'bitbucket',
  'generic-webhook'
]);

/** A queued webhook entry: an explicit `{ eventName, payload, id? }` envelope, or a
 *  bare payload object (eventName then falls back to `config.eventName`). */
interface WebhookQueueEntry {
  eventName?: string;
  payload?: unknown;
  id?: string;
}

/** Minimal async fs seam so the dir-queue source stays injectable/offline. */
interface WebhookFs {
  readdir(dir: string): Promise<string[]>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
}

/** Resolve the configured trigger backend, defaulting to the generic shape. */
function backendFor(source: AnySource): TriggerBackend {
  const raw = source?.config?.backend;
  return WEBHOOK_BACKENDS.has(raw as TriggerBackend) ? (raw as TriggerBackend) : 'generic-webhook';
}

/** Coerce one queue item into a normalized `{ eventName, payload, id? }` envelope. */
function asEntry(item: unknown, fallbackEventName: string): WebhookQueueEntry & { payload: unknown } {
  if (item && typeof item === 'object' && 'payload' in (item as Record<string, unknown>)) {
    const e = item as WebhookQueueEntry;
    return { eventName: e.eventName ?? fallbackEventName, payload: e.payload, id: e.id };
  }
  // A bare payload object — the eventName comes from config.eventName.
  return { eventName: fallbackEventName, payload: item };
}

/** Load the inline `config.payloads` queue (the injection seam). */
function inlineQueue(source: AnySource): unknown[] {
  const payloads = source?.config?.payloads;
  return Array.isArray(payloads) ? payloads : [];
}

/** Load + parse the `config.dir` queue of captured `*.json` payload files (sorted
 *  by filename so emit order is stable). A file that fails to parse is skipped with
 *  a log line rather than failing the whole poll. */
async function dirQueue(source: AnySource, ctx: PollContext, fs: WebhookFs): Promise<unknown[]> {
  const dir = source?.config?.dir;
  if (typeof dir !== 'string' || dir === '') return [];
  let names: string[];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.toLowerCase().endsWith('.json')).sort();
  } catch (err) {
    ctx.log(`webhook: failed to read dir "${dir}": ${(err as Error)?.message || err}`);
    return [];
  }
  const out: unknown[] = [];
  for (const name of names) {
    const full = `${dir.replace(/[/\\]+$/, '')}/${name}`;
    try {
      out.push(JSON.parse(await fs.readFile(full, 'utf8')));
    } catch (err) {
      ctx.log(`webhook: skipping unparseable payload "${full}": ${(err as Error)?.message || err}`);
    }
  }
  return out;
}

/**
 * The stable dedup id for a normalized webhook event. Prefer an explicit entry
 * `id` (the receiver's delivery id, e.g. GitHub `X-GitHub-Delivery`), else derive
 * a deterministic id from the normalized shape (backend + event + sha/url/repo).
 */
function dedupId(entryId: string | undefined, n: NormalizedTriggerEvent): string {
  if (entryId != null && entryId !== '') return `webhook:${n.backend}:${entryId}`;
  const discriminator = n.sha || n.url || `${n.repository ?? ''}#${n.ref ?? ''}`;
  return `webhook:${n.backend}:${n.eventName}:${n.action ?? ''}:${discriminator}`;
}

/** Build the channel content from the normalized trigger event (title + body, or
 *  the normalizer's collected `text` when neither is present). */
function contentFor(n: NormalizedTriggerEvent): string {
  const parts = [n.title, n.body].filter((p): p is string => typeof p === 'string' && p !== '');
  if (parts.length > 0) return parts.join('\n\n');
  return n.text ?? '';
}

/** meta keys MUST be `[A-Za-z0-9_]+`; values are stringified, empties dropped. */
function metaFor(n: NormalizedTriggerEvent): Record<string, string> {
  const meta: Record<string, string> = {
    backend: n.backend,
    event: n.eventName
  };
  const optional: Record<string, unknown> = {
    action: n.action,
    repo: n.repository,
    author: n.actor,
    ref: n.ref,
    sha: n.sha,
    source_branch: n.sourceBranch,
    target_branch: n.targetBranch,
    url: n.url
  };
  for (const [k, v] of Object.entries(optional)) {
    if (v != null && v !== '') meta[k] = String(v);
  }
  return meta;
}

export default defineBackend({
  type: 'webhook',

  /**
   * Validate a webhook source at config-load time (SPEC §4 contract). Requires a
   * recognized `config.backend`, and at least one configured queue source
   * (`config.payloads` or `config.dir`). Surfaces clear, per-source messages.
   */
  validateConfig(source: Record<string, unknown>): string[] {
    const s = source as AnySource;
    const errors: string[] = [];
    const id = s?.id ?? '(unknown)';
    const cfg = s?.config || {};

    if (!WEBHOOK_BACKENDS.has(cfg.backend as TriggerBackend)) {
      errors.push(
        `Source "${id}": webhook config.backend must be one of ${[...WEBHOOK_BACKENDS].join(', ')}.`
      );
    }

    const hasInline = Array.isArray(cfg.payloads);
    const hasDir = typeof cfg.dir === 'string' && cfg.dir !== '';
    if (!hasInline && !hasDir) {
      errors.push(
        `Source "${id}": webhook needs a queue source — set config.payloads (array) or config.dir (path).`
      );
    }

    if (cfg.eventName != null && typeof cfg.eventName !== 'string') {
      errors.push(`Source "${id}": webhook config.eventName must be a string when set.`);
    }

    return errors;
  },

  /**
   * Read the configured queue of captured webhook payloads, normalize each via the
   * triggers-adapter `normalizeEvent(backend, eventName, payload)`, and emit a
   * channel event per genuinely-new payload (dedup by stable id). The cursor is
   * unused (the queue source owns ordering); `seen` carries the dedup set.
   */
  async poll(ctx: PollContext): Promise<PollResult> {
    const source = ctx.source as AnySource;
    const state = ctx.state || { cursor: null, seen: [] };
    const seen: string[] = state.seen ?? [];
    const backend = backendFor(source);
    const fallbackEventName = String(source?.config?.eventName ?? backend);

    // The fs seam defaults to node:fs/promises; tests inject `config.fs`.
    const fs: WebhookFs = (source?.config?.fs as WebhookFs) || (await import('node:fs/promises'));

    const raw = [...inlineQueue(source), ...(await dirQueue(source, ctx, fs))];

    // Normalize each queued payload into a (entry, normalized) pair.
    const normalized = raw.map((item) => {
      const entry = asEntry(item, fallbackEventName);
      const n = normalizeEvent(backend, String(entry.eventName ?? backend), entry.payload);
      return { id: dedupId(entry.id, n), n };
    });

    const { fresh, seen: nextSeen } = deriveNew(normalized, { idOf: (x) => x.id, seen });

    const events: ChannelEvent[] = fresh.map(({ id, n }) => ({
      id,
      content: contentFor(n),
      meta: metaFor(n),
      // The raw upstream payload, so declarative dot-path filters can match.
      payload: (n.raw && typeof n.raw === 'object' ? (n.raw as Record<string, unknown>) : { raw: n.raw }),
      // Origin coordinates for a reply: the normalized identity. There is no live
      // callback channel, so reply() is unsupported (see below) — this is recorded
      // for diagnostics / downstream routing only.
      routing: {
        backend: n.backend,
        eventName: n.eventName,
        repository: n.repository,
        url: n.url
      }
    }));

    return { events, state: { cursor: state.cursor ?? null, seen: nextSeen } };
  },

  /**
   * A webhook is a one-way inbound notification with no generic callback channel,
   * so a reply cannot be routed back. Surface a CLEAR error rather than silently
   * succeeding or no-op'ing (fallbacks are evil): a caller wanting to reply should
   * route through the concrete `github`/`jira` backend the payload originated from.
   */
  async reply({ routing }: ReplyArgs): Promise<ReplyResult> {
    const r = routing as AnySource;
    throw new Error(
      `webhook backend does not support reply: a webhook is a one-way inbound ` +
        `notification with no callback channel (origin backend="${r?.backend ?? 'unknown'}", ` +
        `event="${r?.eventName ?? 'unknown'}"). Reply through the concrete backend instead.`
    );
  }
});
