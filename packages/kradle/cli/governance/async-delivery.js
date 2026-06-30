/**
 * Async-delivery registry for governed visual tools (G13 bridge layer).
 *
 * ZERO-DEP. A pending-governance-run registry keyed by the deterministic
 * correlationId from the G13 governedToolDescriptor. Each entry carries a single
 * pending decision Promise (_decision) that the run-driver's resolvers.approve
 * awaits; it resolves ONLY when the OWNER approve/deny channel fires — there is
 * NO timeout and NO default auto-approve. The terminal socket command only ever
 * lands in `outcome` via settle(), which the bridge calls with the run-driver's
 * out.value AFTER the run reaches emitSocketCommand (post-approval) — so the
 * command CANNOT appear in get(...) before approval.
 *
 * No fallback anywhere: unknown-id approve/deny/awaitDecision throw; duplicate
 * register throws.
 *
 * @reference docs/research/voice-governance-bridge-spec.md §3.2, §3.3
 */

/**
 * @typedef {Object} DeliveryEntry
 * @property {'waiting-approval'|'approved'|'denied'} status
 * @property {string} [filler]
 * @property {object} [outcome]          terminal payload: {command,...} on approve | {reason} on deny
 * @property {Promise<object>} _decision pending breakpoint-shaped decision the run-driver awaits
 * @property {(decision: object) => void} _resolveDecision
 */

/**
 * Create an async-delivery registry instance.
 * @returns {{
 *   register: (correlationId: string, init?: { filler?: string }) => DeliveryEntry,
 *   awaitDecision: (correlationId: string) => Promise<object>,
 *   approve: (correlationId: string, response?: any) => void,
 *   deny: (correlationId: string, reason?: any) => void,
 *   settle: (correlationId: string, outcome: object) => void,
 *   get: (correlationId: string) => ({ status, filler, outcome } | undefined),
 *   subscribe: (fn: (event: object) => void) => (() => void),
 * }}
 */
export function createAsyncDelivery() {
  /** @type {Map<string, DeliveryEntry>} */
  const entries = new Map();
  /** @type {Set<(event: object) => void>} */
  const subscribers = new Set();

  function register(correlationId, init = {}) {
    if (entries.has(correlationId)) {
      throw new Error(`async-delivery: correlationId already registered: ${correlationId}`);
    }
    let resolveDecision;
    const decision = new Promise((resolve) => {
      resolveDecision = resolve;
    });
    /** @type {DeliveryEntry} */
    const entry = {
      status: 'waiting-approval',
      filler: init.filler,
      outcome: undefined,
      _decision: decision,
      _resolveDecision: resolveDecision,
    };
    entries.set(correlationId, entry);
    return entry;
  }

  function requireEntry(correlationId, op) {
    const entry = entries.get(correlationId);
    if (!entry) {
      throw new Error(`async-delivery: unknown correlationId for ${op}: ${correlationId}`);
    }
    return entry;
  }

  function awaitDecision(correlationId) {
    return requireEntry(correlationId, 'awaitDecision')._decision;
  }

  function approve(correlationId, response) {
    const entry = requireEntry(correlationId, 'approve');
    entry.status = 'approved';
    entry._resolveDecision({ approved: true, response });
  }

  function deny(correlationId, reason) {
    const entry = requireEntry(correlationId, 'deny');
    entry.status = 'denied';
    entry._resolveDecision({ approved: false, reason });
  }

  function settle(correlationId, outcome) {
    const entry = requireEntry(correlationId, 'settle');
    // Idempotent: a second settle is a no-op.
    if (entry.outcome !== undefined) return;
    const out = outcome || {};
    entry.status = out.status === 'denied' ? 'denied' : 'approved';
    entry.outcome = out;
    const event = { correlationId, status: entry.status };
    if (entry.status === 'approved' && out.command !== undefined) {
      event.command = out.command;
    }
    if (entry.status === 'denied' && out.reason !== undefined) {
      event.reason = out.reason;
    }
    for (const fn of subscribers) {
      fn(event);
    }
  }

  function get(correlationId) {
    const entry = entries.get(correlationId);
    if (!entry) return undefined;
    // NEVER expose _decision / _resolveDecision.
    return { status: entry.status, filler: entry.filler, outcome: entry.outcome };
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return function unsubscribe() {
      subscribers.delete(fn);
    };
  }

  return { register, awaitDecision, approve, deny, settle, get, subscribe };
}
