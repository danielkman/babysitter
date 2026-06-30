import { describe, it, expect, vi } from 'vitest';
import { encodeReplyTo, decodeReplyTo, dispatchReply } from '../index.js';

// SPEC §4 / DESIGN §4: the opaque reply_to routing token.
// encodeReplyTo({ sourceId, backendType, routing }) -> opaque URL-safe string.
// decodeReplyTo(token) -> the original record, or null for garbage (AC-15/16).

const routingRecord = {
  sourceId: 'gh-comments-by-alice',
  backendType: 'github',
  routing: { owner: 'octo', repo: 'app', issue_number: 42 }
};

describe('relay.js — encode/decode round-trip (AC-15)', () => {
  it('AC-15: encode -> decode reconstructs the routing record exactly', () => {
    const token = encodeReplyTo(routingRecord);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    const decoded = decodeReplyTo(token);
    expect(decoded).toEqual(routingRecord);
  });

  it('AC-15: round-trips a Jira-shaped routing object', () => {
    const jira = {
      sourceId: 'jira-crash-bugs',
      backendType: 'jira',
      routing: { key: 'BUG-7' }
    };
    expect(decodeReplyTo(encodeReplyTo(jira))).toEqual(jira);
  });

  it('AC-15: the token is URL-safe/opaque so it survives sanitization', () => {
    // DESIGN §4: reply_to must survive the meta-key sanitizer; the VALUE itself is
    // URL-safe/opaque. The tamper-evident token is `<b64url-payload>.<b64url-sig>`;
    // every character is URL-safe (base64url alphabet plus the `.` separator, both
    // RFC-3986 unreserved), so it cannot break the channel attribute contract.
    const token = encodeReplyTo(routingRecord);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});

describe('relay.js — opacity (DESIGN §4)', () => {
  it('is opaque: the token is NOT plain readable JSON', () => {
    const token = encodeReplyTo(routingRecord);
    // The raw owner/repo/key must not appear verbatim, and it must not parse as JSON.
    expect(token).not.toContain('octo');
    expect(token).not.toContain('issue_number');
    expect(token.trim().startsWith('{')).toBe(false);
    expect(() => JSON.parse(token)).toThrow();
  });

  it('different routing produces different tokens; identical routing is stable', () => {
    const a = encodeReplyTo(routingRecord);
    const b = encodeReplyTo({ ...routingRecord, routing: { ...routingRecord.routing, issue_number: 99 } });
    expect(a).not.toBe(b);
    expect(encodeReplyTo(routingRecord)).toBe(a);
  });
});

describe('relay.js — garbage decode is a clean null, never throws (AC-16)', () => {
  it('AC-16: a non-base64 / garbled token decodes to null', () => {
    expect(() => decodeReplyTo('!!!not a token!!!')).not.toThrow();
    expect(decodeReplyTo('!!!not a token!!!')).toBeNull();
  });

  it('AC-16: valid base64 of non-JSON decodes to null', () => {
    const notJson = Buffer.from('hello world, not json', 'utf8').toString('base64url');
    expect(decodeReplyTo(notJson)).toBeNull();
  });

  it('AC-16: empty / nullish input decodes to null without throwing', () => {
    expect(decodeReplyTo('')).toBeNull();
    expect(decodeReplyTo(undefined)).toBeNull();
    expect(decodeReplyTo(null)).toBeNull();
  });
});

describe('relay.js — tamper-evidence (HMAC; forged token rejected)', () => {
  it('a valid token round-trips, but flipping ONE char anywhere decodes to null', () => {
    const token = encodeReplyTo(routingRecord);
    // Sanity: the untouched token decodes back to the record.
    expect(decodeReplyTo(token)).toEqual(routingRecord);

    // Flip a character in the PAYLOAD half -> signature no longer matches.
    const flipAt = (s, i) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
    const tamperedPayload = flipAt(token, 1);
    expect(tamperedPayload).not.toBe(token);
    expect(decodeReplyTo(tamperedPayload)).toBeNull();

    // Flip a character in the SIGNATURE half -> verification fails.
    const tamperedSig = flipAt(token, token.length - 1);
    expect(tamperedSig).not.toBe(token);
    expect(decodeReplyTo(tamperedSig)).toBeNull();
  });

  it('a correctly-signed token whose payload is a non-object JSON decodes to null', () => {
    // encodeReplyTo signs whatever it is given; a primitive payload round-trips
    // through the HMAC but is rejected by decode (must be an object).
    const token = encodeReplyTo(42);
    expect(token).toMatch(/\./);
    expect(decodeReplyTo(token)).toBeNull();
    expect(decodeReplyTo(encodeReplyTo(null))).toBeNull();
  });

  it('a hand-rolled base64url(JSON) WITHOUT a valid HMAC is rejected (forgery)', () => {
    // An attacker who knows the (plain) encoding but not the per-process secret
    // cannot mint a token: a bare base64url(JSON) payload has no signature.
    const forgedPayload = Buffer.from(
      JSON.stringify({ sourceId: 'x', backendType: 'github', routing: { owner: 'evil', repo: 'x', issue_number: 1 } }),
      'utf8'
    ).toString('base64url');
    expect(decodeReplyTo(forgedPayload)).toBeNull();
    // Even appending a wrong signature is rejected.
    expect(decodeReplyTo(`${forgedPayload}.deadbeef`)).toBeNull();
  });
});

describe('relay.js — dispatchReply (single source of truth for the reply path)', () => {
  const baseDeps = () => {
    const source = { id: 'gh', backend: 'github', auth: { token: 't' } };
    const backend = {
      type: 'github',
      reply: vi.fn(async ({ routing, text }) => ({ ok: true, ref: `posted:${routing.issue_number}:${text}` }))
    };
    return { source, backend };
  };

  it('happy path: decodes a valid token, resolves source+backend, returns the backend result', async () => {
    const { source, backend } = baseDeps();
    const token = encodeReplyTo({ sourceId: 'gh', backendType: 'github', routing: { owner: 'o', repo: 'r', issue_number: 42 } });

    const res = await dispatchReply({
      reply_to: token,
      text: 'thanks',
      resolveSource: (id) => (id === 'gh' ? source : undefined),
      resolveBackend: (type) => (type === 'github' ? backend : undefined),
      http: async () => ({ ok: true })
    });

    expect(res).toEqual({ ok: true, ref: 'posted:42:thanks' });
    // The backend received the decoded routing + the original source/http.
    expect(backend.reply).toHaveBeenCalledTimes(1);
    const arg = backend.reply.mock.calls[0][0];
    expect(arg.routing).toEqual({ owner: 'o', repo: 'r', issue_number: 42 });
    expect(arg.source).toBe(source);
    expect(arg.text).toBe('thanks');
  });

  it('garbled token -> ok:false without calling any backend', async () => {
    const { backend } = baseDeps();
    const res = await dispatchReply({
      reply_to: 'totally-bogus',
      text: 'hi',
      resolveSource: () => ({ id: 'gh' }),
      resolveBackend: () => backend,
      http: async () => ({ ok: true })
    });
    expect(res).toEqual({ ok: false });
    expect(backend.reply).not.toHaveBeenCalled();
  });

  it('unknown source -> ok:false', async () => {
    const { backend } = baseDeps();
    const token = encodeReplyTo({ sourceId: 'missing', backendType: 'github', routing: { key: 'X-1' } });
    const res = await dispatchReply({
      reply_to: token,
      text: 'hi',
      resolveSource: () => undefined, // source not found
      resolveBackend: () => backend,
      http: async () => ({ ok: true })
    });
    expect(res).toEqual({ ok: false });
    expect(backend.reply).not.toHaveBeenCalled();
  });

  it('resolveBackend that REJECTS is contained -> ok:false (no throw out of dispatchReply)', async () => {
    const { backend } = baseDeps();
    const token = encodeReplyTo({ sourceId: 'gh', backendType: 'github', routing: {} });
    const res = await dispatchReply({
      reply_to: token,
      text: 'hi',
      resolveSource: () => ({ id: 'gh' }),
      // The resolver itself throws (e.g. a custom-backend import blew up).
      resolveBackend: async () => {
        throw new Error('import failed');
      },
      http: async () => ({ ok: true })
    });
    expect(res).toEqual({ ok: false });
    expect(backend.reply).not.toHaveBeenCalled();
  });

  it('unknown backend -> ok:false', async () => {
    const token = encodeReplyTo({ sourceId: 'gh', backendType: 'nope', routing: {} });
    const res = await dispatchReply({
      reply_to: token,
      text: 'hi',
      resolveSource: () => ({ id: 'gh' }),
      resolveBackend: () => undefined, // backend not found
      http: async () => ({ ok: true })
    });
    expect(res).toEqual({ ok: false });
  });

  it('a backend that throws is contained -> ok:false (no throw out of dispatchReply)', async () => {
    const token = encodeReplyTo({ sourceId: 'gh', backendType: 'github', routing: {} });
    const res = await dispatchReply({
      reply_to: token,
      text: 'hi',
      resolveSource: () => ({ id: 'gh' }),
      resolveBackend: () => ({ type: 'github', reply: async () => { throw new Error('boom'); } }),
      http: async () => ({ ok: true })
    });
    expect(res).toEqual({ ok: false });
  });
});

// SPEC §10 AC-21 / DESIGN §7.4 — cross-process reply_to portability via a shared
// secret. `encodeReplyTo`/`decodeReplyTo` gain an OPTIONAL trailing secret param:
// with the SAME secret, two SEPARATE encode/decode calls round-trip (a child
// process started with the same secret can verify a token its parent minted);
// with a DIFFERENT secret (or the per-process default), verification fails and
// `decodeReplyTo` returns null. The existing no-arg calls keep working unchanged.
describe('relay.js — shared-secret cross-process portability (AC-21)', () => {
  const record = {
    sourceId: 'gh-triage',
    backendType: 'github',
    routing: { owner: 'octo', repo: 'app', issue_number: 7 }
  };

  it('AC-21: SAME secret round-trips a token across separate encode/decode calls', () => {
    const secret = 'shared-hmac-secret-AAAA';
    // "process A" mints under the secret; "process B" decodes under the same secret.
    const token = encodeReplyTo(record, secret);
    expect(typeof token).toBe('string');
    const decoded = decodeReplyTo(token, secret);
    expect(decoded).toEqual(record);
  });

  it('AC-21: a token minted under secret A does NOT decode under secret B (returns null)', () => {
    const token = encodeReplyTo(record, 'secret-A');
    expect(decodeReplyTo(token, 'secret-B')).toBeNull();
    // ...and still verifies under its own secret (proves the failure is the key,
    // not a malformed token).
    expect(decodeReplyTo(token, 'secret-A')).toEqual(record);
  });

  it('AC-21: a token minted under a secret does NOT verify under the per-process default (no-arg)', () => {
    const token = encodeReplyTo(record, 'secret-A');
    // Decoding with NO secret falls back to the module's per-process random key,
    // which cannot have produced this signature.
    expect(decodeReplyTo(token)).toBeNull();
  });

  it('AC-21: a default (no-secret) token does NOT verify under a provided secret', () => {
    const token = encodeReplyTo(record); // per-process random key
    expect(decodeReplyTo(token, 'secret-A')).toBeNull();
    // Backward compatibility: the default token still round-trips with no secret.
    expect(decodeReplyTo(token)).toEqual(record);
  });

  it('AC-21: the same secret is DETERMINISTIC — identical record+secret yields the identical token', () => {
    const secret = 'deterministic-secret';
    const a = encodeReplyTo(record, secret);
    const b = encodeReplyTo(record, secret);
    // Cross-process interop requires the signature be a pure function of (record, secret).
    expect(a).toBe(b);
    // A different secret produces a different signature for the same record.
    expect(encodeReplyTo(record, 'other-secret')).not.toBe(a);
  });

  it('AC-21: existing no-arg behavior is unchanged (backward compatible)', () => {
    // The default single-arg path still round-trips within one process.
    const token = encodeReplyTo(record);
    expect(decodeReplyTo(token)).toEqual(record);
    // Garbage still returns null, never throws.
    expect(decodeReplyTo('!!!garbage!!!')).toBeNull();
  });
});
