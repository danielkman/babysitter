import { describe, it, expect } from 'vitest';
import { generateKeyPair, signPayload, verifySignature } from './signing.js';
import type { SignedEnvelope } from './types.js';

describe('trust/signing', () => {
  it('generates a valid Ed25519 key pair with fingerprint', () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(kp.privateKey).toContain('BEGIN PRIVATE KEY');
    expect(kp.fingerprint).toHaveLength(16);
    expect(kp.fingerprint).toMatch(/^[a-f0-9]+$/);
  });

  it('signs and verifies a payload', () => {
    const kp = generateKeyPair();
    const payload = { tool: 'Bash', command: 'ls', output: 'file.ts', exitCode: 0 };
    const envelope = signPayload(kp.privateKey, kp.fingerprint, payload);

    expect(envelope.signature).toBeTruthy();
    expect(envelope.publicKeyFingerprint).toBe(kp.fingerprint);
    expect(envelope.algorithm).toBe('Ed25519');
    expect(envelope.signedFields).toContain('tool');
    expect(envelope.signedFields).toContain('output');
    expect(envelope.signedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(verifySignature(kp.publicKey, envelope)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const kp = generateKeyPair();
    const payload = { tool: 'Bash', output: 'real output' };
    const envelope = signPayload(kp.privateKey, kp.fingerprint, payload);

    const tampered: SignedEnvelope<typeof payload> = {
      ...envelope,
      payload: { ...envelope.payload, output: 'tampered output' },
    };

    expect(verifySignature(kp.publicKey, tampered)).toBe(false);
  });

  it('rejects verification with wrong public key', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const payload = { data: 'test' };
    const envelope = signPayload(kp1.privateKey, kp1.fingerprint, payload);

    expect(verifySignature(kp2.publicKey, envelope)).toBe(false);
  });

  it('signs only specified fields', () => {
    const kp = generateKeyPair();
    const payload = { tool: 'Read', path: '/etc/passwd', content: 'root:x:0:0' };
    const envelope = signPayload(kp.privateKey, kp.fingerprint, payload, ['tool', 'path']);

    expect(envelope.signedFields).toEqual(['tool', 'path']);
    expect(verifySignature(kp.publicKey, envelope)).toBe(true);

    // Modifying an unsigned field doesn't break verification
    const modified: SignedEnvelope<typeof payload> = {
      ...envelope,
      payload: { ...envelope.payload, content: 'different' },
    };
    expect(verifySignature(kp.publicKey, modified)).toBe(true);

    // Modifying a signed field breaks it
    const tampered: SignedEnvelope<typeof payload> = {
      ...envelope,
      payload: { ...envelope.payload, tool: 'Write' },
    };
    expect(verifySignature(kp.publicKey, tampered)).toBe(false);
  });

  it('produces different fingerprints for different keys', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    expect(kp1.fingerprint).not.toBe(kp2.fingerprint);
  });
});
