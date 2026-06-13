/**
 * Backend mode + config resolution (SPEC-LIVE-BACKEND §5).
 *
 * `resolveBackendConfig(env, search)` is a PURE function: it reads the Vite
 * `import.meta.env` and the URL query string and produces a `BackendConfig`.
 * URL params win over env (§5.2) so a deploy can default to real while a
 * `?backend=mock` debug URL forces the mock (and vice-versa).
 *
 * DEFAULT mode is `'mock'` (AC1/AC10). A real mode that is missing its
 * `gatewayUrl`/`token` fails safe back to mock rather than booting a dead
 * socket — the deterministic mock is always the safe default.
 */

import { DEFAULT_SEED } from './mock/mockBackend';
import { seedFromSearch } from './mock/prng';

export type BackendMode = 'mock' | 'real';

export interface BackendConfig {
  mode: BackendMode;
  /** Mock-only: PRNG seed (default 42). Ignored when mode === 'real'. */
  seed: number;
  /** Real-only: ws/wss gateway URL. Required when mode === 'real'. */
  gatewayUrl?: string;
  /** Real-only: bearer/auth token. Required when mode === 'real'. */
  token?: string;
  /** Real-only keepalive/backoff knobs (all optional; defaults in §2). */
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxReconnectAttempts?: number;
}

/**
 * Minimal structural view of `import.meta.env` for resolution. Mirrors the
 * `ImportMetaEnv` shape declared in `src/vite-env.d.ts` (§5.4); typed locally
 * as `Readonly<...>` so callers may pass `import.meta.env` directly and tests
 * may pass a plain object — neither needs `any`.
 */
export interface BackendEnv {
  readonly VITE_BACKEND?: string;
  readonly VITE_GATEWAY_URL?: string;
  readonly VITE_GATEWAY_TOKEN?: string;
}

function normalizeMode(raw: string | null | undefined): BackendMode | null {
  if (raw === 'mock' || raw === 'real') return raw;
  return null;
}

function nonEmpty(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve a `BackendConfig` from Vite env + URL params (§5.2). Pure; no I/O.
 */
export function resolveBackendConfig(env: BackendEnv, search: string): BackendConfig {
  const params = new URLSearchParams(search);

  // Seed is always resolved so the mock branch has it regardless of mode
  // (reuse the canonical parser — never re-implement seed parsing).
  const seed = seedFromSearch(search, DEFAULT_SEED);

  // URL params win over env for every overlapping key.
  const requestedMode =
    normalizeMode(params.get('backend')) ?? normalizeMode(env.VITE_BACKEND) ?? 'mock';
  const gatewayUrl = nonEmpty(params.get('gateway')) ?? nonEmpty(env.VITE_GATEWAY_URL);
  const token = nonEmpty(params.get('token')) ?? nonEmpty(env.VITE_GATEWAY_TOKEN);

  // Fail-safe: a real mode missing its url/token degrades to the mock so a
  // misconfigured deploy boots the deterministic sim, not a dead socket (AC1).
  if (requestedMode === 'real' && gatewayUrl !== undefined && token !== undefined) {
    return { mode: 'real', seed, gatewayUrl, token };
  }

  return { mode: 'mock', seed };
}
