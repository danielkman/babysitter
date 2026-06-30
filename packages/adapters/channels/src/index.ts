// Public package surface (SPEC §3, DESIGN §1).
//
// This is what library consumers import. It re-exports the channel server, the
// runtime bootstrap, the backend authoring helper + registry, and the filter,
// state, dedup, and relay primitives.

export { ChannelServer, DEFAULT_INSTRUCTIONS } from './server.js';
export { createRuntime } from './runtime.js';
export { Poller } from './poller.js';

export { defineBackend } from './backend.js';
export { registry, Registry } from './registry.js';

// SPEC §4 — the OPTIONAL additive webhook-ingest backend (built on
// `@a5c-ai/triggers-adapter`'s `normalizeEvent`). Alongside github/jira.
export { default as webhookBackend } from './backends/webhook.js';
// Re-export the triggers-adapter normalization contract so consumers configuring a
// webhook source get the typed `backend` values + the normalized event shape.
export type { NormalizedTriggerEvent, TriggerBackend } from '@a5c-ai/triggers-adapter';

export { loadConfig } from './config.js';

export { compileFilter, filterMatch } from './filter.js';
export { StateStore, MemoryStateStore } from './state.js';
export { deriveNew, boundSeen } from './dedup.js';
export { encodeReplyTo, decodeReplyTo, dispatchReply, createRelay } from './relay.js';

// SPEC §10 / DESIGN §7 — the event-triggered session spawner.
export { SessionSpawner, buildSpawnRunOptions } from './spawner.js';

// Expose the data interfaces so consumers get the typed contract.
export type * from './types.js';
