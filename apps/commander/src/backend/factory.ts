/**
 * Backend factory (SPEC-LIVE-BACKEND §5.3). The ONLY place that knows which
 * concrete implementation exists; returns the `CommanderBackend` interface so
 * the boot seam and UI stay implementation-agnostic.
 *
 * The mock branch constructs `new MockBackend({ seed })` — the exact constructor
 * path `createMockBackendFromSearch` uses — so the byte-identical-default
 * guarantee (AC1) is structural, not re-derived.
 */

import type { BackendConfig } from './config';
import type { CommanderBackend } from './types';
import { MockBackend } from './mock/mockBackend';
import { RealBackend, type RealBackendDeps } from './real/realBackend';

export function createBackend(config: BackendConfig, deps?: RealBackendDeps): CommanderBackend {
  if (config.mode === 'real') {
    // gatewayUrl & token are guaranteed present by resolveBackendConfig (§5.2);
    // RealBackend re-asserts them defensively.
    return new RealBackend(config, deps);
  }
  return new MockBackend({ seed: config.seed });
}
