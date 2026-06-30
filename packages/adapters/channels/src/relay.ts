// The opaque, TAMPER-EVIDENT `reply_to` routing token + reply dispatch
// (SPEC §4, DESIGN §4).
//
// A reply must reach the EXACT origin (this repo + issue number, or this Jira
// key). Claude forwards only one small attribute back to us and inbound channel
// text is an untrusted prompt-injection surface, so we must not let model-authored
// text dictate where a write goes. The framework mints a single opaque token per
// event (`meta.reply_to`); Claude treats it as a black box and echoes it back
// when calling the `reply` tool. Only the framework interprets it.
//
// The token is `<base64url(JSON)>.<base64url(HMAC-SHA256)>` — URL-safe, a valid
// meta identifier value (so it survives the meta-key sanitizer), and OPAQUE
// (Claude can't read or mutate the routing target). The HMAC is computed over the
// encoded payload with a PER-PROCESS random secret generated at startup, so a
// forged/tampered token (e.g. a flipped char, or a hand-rolled base64url(JSON))
// fails verification and is rejected. It is a *routing* token, not a bearer
// secret: it carries no credentials (auth lives only in the loaded config, keyed
// by source id) — the HMAC exists purely so the runtime never POSTs under real
// credentials to a routing target it didn't itself mint.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ReplyToken, ReplyResult } from './types.js';

// Per-process signing secret, generated once at module load. It never leaves the
// process and is not derivable from a token, so tokens minted by this process
// cannot be forged by anyone who hasn't seen the secret. A fresh secret each run
// is fine for the single-process model: reply_to tokens are only meaningful
// within the lifetime of the running server (the in-memory source/backend tables
// they reference are process-local).
//
// SPEC §10 AC-21 / DESIGN §7.4: a SHARED secret makes a token portable across
// processes (a spawned child must verify a token its parent minted). When a
// non-empty secret is supplied, the HMAC key is DERIVED from it deterministically
// (sha256(secret) -> 32 bytes) so two processes with the same secret produce
// identical signatures. When no secret is supplied, this per-process random key
// is used and behavior is identical to before (backward compatible).
const REPLY_SECRET = randomBytes(32);

/** Cache of derived 32-byte keys per shared secret string (avoid re-hashing). */
const KEY_CACHE = new Map<string, Buffer>();

/**
 * Resolve the HMAC key: the derived key from a non-empty `secret`, else the
 * per-process random key. A derived key is `sha256(secret)` (32 bytes), cached.
 */
function keyFor(secret: string | undefined): Buffer {
  if (typeof secret === 'string' && secret.length > 0) {
    let key = KEY_CACHE.get(secret);
    if (!key) {
      key = createHash('sha256').update(secret, 'utf8').digest();
      KEY_CACHE.set(secret, key);
    }
    return key;
  }
  return REPLY_SECRET;
}

/** base64url-encode a Buffer/string without padding ambiguity. */
function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

/** Compute the HMAC-SHA256 of `encodedPayload` (under `key`) as base64url. */
function sign(encodedPayload: string, key: Buffer): string {
  return createHmac('sha256', key).update(encodedPayload).digest('base64url');
}

/**
 * Encode a routing record into an opaque, URL-safe, tamper-evident token of the
 * form `<payload>.<sig>` where `payload = base64url(JSON(record))` and
 * `sig = base64url(HMAC-SHA256(payload))`.
 *
 * The optional trailing `secret` (DESIGN §7.4) derives the signing key so a
 * second process with the SAME secret can verify the token. Omitted ⇒ the
 * per-process random key (existing single-arg behavior is unchanged).
 */
export function encodeReplyTo(record: ReplyToken | unknown, secret?: string): string {
  const json = JSON.stringify(record);
  const payload = b64url(Buffer.from(json, 'utf8'));
  return `${payload}.${sign(payload, keyFor(secret))}`;
}

/**
 * Decode an opaque token back into the routing record, VERIFYING the HMAC first.
 * Returns `null` for any garbage (missing/invalid signature, bad base64, non-JSON,
 * empty/nullish, or a tampered payload) — NEVER throws (AC-16).
 *
 * The optional trailing `secret` must match the one used to encode (DESIGN §7.4):
 * a token minted under secret A does not verify under secret B (or the default),
 * yielding `null`. Omitted ⇒ the per-process random key (unchanged behavior).
 */
export function decodeReplyTo(token: unknown, secret?: string): ReplyToken | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;

  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);

  // Verify the signature in constant time. A flipped char in EITHER half makes
  // the buffers differ (or differ in length) and the token is rejected.
  let expectedBuf: Buffer;
  let providedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(sign(payload, keyFor(secret)), 'utf8');
    providedBuf = Buffer.from(provided, 'utf8');
  } catch {
    return null;
  }
  if (expectedBuf.length !== providedBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, providedBuf)) return null;

  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    const obj = JSON.parse(json);
    if (obj == null || typeof obj !== 'object') return null;
    return obj as ReplyToken;
  } catch {
    return null;
  }
}

/** Arguments to `dispatchReply`. */
export interface DispatchArgs {
  reply_to: string;
  text: string;
  resolveSource: (id: string) => Record<string, unknown> | undefined;
  resolveBackend: (
    type: string,
    sourceId?: string
  ) =>
    | Record<string, unknown>
    | undefined
    | Promise<Record<string, unknown> | undefined>;
  http: (url: string | URL, opts?: Record<string, unknown>) => Promise<unknown>;
  /** Shared secret to decode under (DESIGN §7.4). */
  secret?: string;
}

/** A relay bound to an optional shared secret. */
export interface BoundRelay {
  encodeReplyTo: (record: ReplyToken) => string;
  decodeReplyTo: (token: unknown) => ReplyToken | null;
  dispatchReply: (args: Omit<DispatchArgs, 'secret'>) => Promise<ReplyResult>;
}

/**
 * Bind a shared `secret` to a relay instance (DESIGN §7.4). Returns
 * `{ encodeReplyTo, decodeReplyTo, dispatchReply }` whose encode/decode use the
 * derived key (and dispatchReply decodes under it), so the running instance signs
 * AND verifies with the shared key. With no secret, this is exactly the
 * per-process behavior of the module-level functions.
 */
export function createRelay(secret?: string): BoundRelay {
  return {
    encodeReplyTo: (record) => encodeReplyTo(record, secret),
    decodeReplyTo: (token) => decodeReplyTo(token, secret),
    dispatchReply: (args) => dispatchReply({ ...args, secret })
  };
}

/**
 * Decode a reply token, look up the owning source + backend, and dispatch the
 * reply to that backend. The single source of truth for the reply path; the
 * runtime's reply handler delegates here. Returns the backend's `{ ok, ref? }`;
 * an unknown/garbled/forged token or a missing source/backend yields
 * `{ ok: false }` WITHOUT throwing (AC-16).
 *
 * The token's `sourceId` is passed as the second argument to `resolveBackend` so
 * the caller can route to the EXACT owning source's backend (rather than the
 * first backend matching `type`), which keeps two custom backends that share a
 * `type` from cross-dispatching.
 */
export async function dispatchReply({
  reply_to,
  text,
  resolveSource,
  resolveBackend,
  http,
  secret
}: DispatchArgs): Promise<ReplyResult> {
  const decoded = decodeReplyTo(reply_to, secret);
  if (!decoded || !decoded.backendType) return { ok: false };

  const source = resolveSource(decoded.sourceId);
  if (!source) return { ok: false };

  let backend: Record<string, unknown> | undefined;
  try {
    backend = await resolveBackend(decoded.backendType, decoded.sourceId);
  } catch {
    return { ok: false };
  }
  if (!backend || typeof backend.reply !== 'function') return { ok: false };

  try {
    const result = await (backend.reply as (a: {
      routing: Record<string, unknown>;
      text: string;
      source: Record<string, unknown>;
      http: DispatchArgs['http'];
    }) => Promise<ReplyResult>)({
      routing: decoded.routing,
      text,
      source,
      http
    });
    return result || { ok: false };
  } catch {
    return { ok: false };
  }
}
