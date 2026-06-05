import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { IdentityKeyPair, SignedEnvelope } from './types.js';

export function generateKeyPair(): IdentityKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const fingerprint = createHash('sha256')
    .update(publicKey)
    .digest('hex')
    .slice(0, 16);
  return { publicKey, privateKey, fingerprint };
}

export function signPayload<T>(
  privateKey: string,
  fingerprint: string,
  payload: T,
  fields?: string[],
): SignedEnvelope<T> {
  const signedFields = fields ?? Object.keys(payload as Record<string, unknown>);
  const canonical = canonicalize(payload, signedFields);
  const signature = sign(null, Buffer.from(canonical), privateKey).toString('base64');
  return {
    payload,
    signature,
    publicKeyFingerprint: fingerprint,
    signedAt: new Date().toISOString(),
    signedFields,
    algorithm: 'Ed25519',
  };
}

export function verifySignature<T>(
  publicKey: string,
  envelope: SignedEnvelope<T>,
): boolean {
  const canonical = canonicalize(envelope.payload, envelope.signedFields);
  return verify(
    null,
    Buffer.from(canonical),
    publicKey,
    Buffer.from(envelope.signature, 'base64'),
  );
}

function canonicalize<T>(payload: T, fields: string[]): string {
  const obj = payload as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of [...fields].sort()) {
    if (key in obj) sorted[key] = obj[key];
  }
  return JSON.stringify(sorted);
}
