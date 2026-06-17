// Example custom mcp-channels backend (SPEC §4 — the extension points).
//
// A backend is a plain JS module that default-exports (or named-exports) an
// object implementing the Backend hook interface. Anyone can add a new source
// system this way without touching the framework core.
//
// Reference it from channels.yml by RELATIVE PATH instead of a built-in type:
//
//   sources:
//     - id: my-thing
//       backend: ./examples/custom-backend.js   # resolved by registry.load()
//       pollIntervalSeconds: 30
//       auth:   { token: "${MY_TOKEN}" }
//       config: { endpoint: "https://example.test/api/events" }
//       filter:
//         all:
//           - { field: "kind", op: eq, value: "mention" }
//
// The framework calls validateConfig() at load time, init() once before the
// first poll, poll() on the source's schedule, and reply() when Claude invokes
// the `reply` tool with this event's opaque reply_to token.
//
// IMPORTANT contract notes (SPEC §4):
//   - poll() must be PURE w.r.t. side effects except HTTP via the injected
//     `ctx.http` (tests inject a fake). Never import a real HTTP client here.
//   - poll() must use ctx.state.cursor to ask for "changes since last check"
//     where the API supports it, and must return the next state.
//   - poll() must set `routing` on EVERY event so reply() can reach origin.
//   - The CORE is the authoritative filter + dedup gate. A backend MAY pre-filter
//     for efficiency but MUST NOT rely on it for correctness.

/**
 * @typedef {import('../src/backend.js').Backend} Backend
 * @typedef {import('../src/backend.js').PollContext} PollContext
 * @typedef {import('../src/backend.js').PollResult} PollResult
 */

/** @type {Backend} */
const customBackend = {
  // `type` is the backend's stable identifier (used in logs / registry).
  type: 'example-custom',

  /**
   * Optional. Return an array of human-readable problems; empty array == valid.
   * Runs at config-load time so misconfiguration is a validation error, not a
   * crash at poll time.
   * @param {object} source the normalized source config
   * @returns {string[]}
   */
  validateConfig(source) {
    const errors = [];
    if (!source?.config?.endpoint) {
      errors.push('custom-backend: config.endpoint is required');
    }
    if (!source?.auth?.token) {
      errors.push('custom-backend: auth.token is required');
    }
    return errors;
  },

  /**
   * Optional one-time setup before the first poll (warm caches, etc.).
   * @param {object} _source
   */
  async init(_source) {
    // no-op for this example
  },

  /**
   * Fetch what changed since the last check and turn it into ChannelEvents.
   * @param {PollContext} ctx
   * @returns {Promise<PollResult>}
   */
  async poll(ctx) {
    const { source, state, http, log, now } = ctx;
    const cursor = state?.cursor ?? null;
    const seen = state?.seen ?? [];

    // Ask the upstream API for items strictly after the cursor where possible.
    const url = new URL(source.config.endpoint);
    if (cursor) url.searchParams.set('since', cursor);

    const res = await http(url.toString(), {
      headers: { authorization: `Bearer ${source.auth.token}` }
    });
    const items = Array.isArray(res?.body?.items) ? res.body.items : [];

    // Dedup fallback for APIs without precise changed-since semantics: skip any
    // id already in the seen-set. (The core also dedups; this keeps polls cheap.)
    const seenSet = new Set(seen);
    const fresh = items.filter((it) => !seenSet.has(String(it.id)));

    const events = fresh.map((it) => ({
      // Stable per-item dedup id.
      id: `example:${it.id}`,
      // Text Claude sees inside <channel>…</channel>.
      content: it.text ?? '',
      // meta keys MUST be identifiers ([A-Za-z0-9_]+); `reply_to` is the opaque
      // routing token the core mints — backends just expose enough in `routing`.
      meta: {
        kind: String(it.kind ?? 'event'),
        author: String(it.author ?? 'unknown')
      },
      // Raw upstream object so declarative filters (dot-paths) can match it.
      payload: it,
      // Everything reply() needs to post back to origin.
      routing: { endpoint: source.config.endpoint, itemId: it.id }
    }));

    // Advance the cursor to the newest item timestamp we observed.
    const maxTs = fresh.reduce(
      (acc, it) => (it.updatedAt && it.updatedAt > acc ? it.updatedAt : acc),
      cursor ?? ''
    );
    const nextCursor = maxTs || (now ? now.toISOString() : cursor);

    log?.(`example-custom: ${events.length} new event(s)`);

    return {
      events,
      // Returned state is persisted by the framework (cursor + bounded seen-set).
      state: {
        cursor: nextCursor,
        seen: [...seen, ...fresh.map((it) => String(it.id))]
      }
    };
  },

  /**
   * Post Claude's reply back to the origin item using `routing` + `source.auth`.
   * @param {{ routing: object, text: string, source: object, http: Function }} a
   * @returns {Promise<{ ok: boolean, ref?: string }>}
   */
  async reply({ routing, text, source, http }) {
    const res = await http(`${routing.endpoint}/${routing.itemId}/replies`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${source.auth.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
    return { ok: res?.status >= 200 && res?.status < 300, ref: res?.body?.id };
  }
};

export default customBackend;
