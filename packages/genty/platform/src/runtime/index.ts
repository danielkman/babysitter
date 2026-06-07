/**
 * Runtime barrel re-exports.
 *
 * Value exports come from the SDK (they are runtime functions).
 * Type exports are sourced from the local types module so that
 * consumers throughout the platform import from a single location.
 *
 * @deprecated Consumers should use the orchestration registry
 * (packages/genty/platform/src/orchestration/) instead of importing
 * SDK runtime functions directly. These re-exports remain for backward
 * compatibility and will be removed when all call sites are migrated.
 */

// ── Value exports from SDK (run-lifecycle, effect-orchestration) ─────────
// @deprecated Use OrchestrationProvider.createRun() etc. via the registry.
export {
  createRun,
  orchestrateIteration,
  commitEffectResult,
  commitEffectCancellation,
  createReplayEngine,
  createProcessContext,
  withProcessContext,
  getActiveProcessContext,
  requireProcessContext,
  STATE_CACHE_SCHEMA_VERSION,
  createStateCacheSnapshot,
  journalHeadsEqual,
  normalizeJournalHead,
  normalizeSnapshot,
  readStateCache,
  rebuildStateCache,
  writeStateCache,
  hashInvocationKey,
  EffectRequestedError,
  EffectPendingError,
  EffectCancelledError,
  ParallelPendingError,
  RunFailedError,
  replaySchemaVersion,
} from "@a5c-ai/babysitter-sdk";

// ── Type exports from local types (centralised) ─────────────────────────
export type {
  OrchestrateOptions,
  IterationResult,
  EffectAction,
  CommitEffectResultOptions,
  CommitEffectResultArtifacts,
  ProcessContext,
  DefinedTask,
  CreateRunOptions,
  CreateRunResult,
  ReplayEngine,
  CreateReplayEngineOptions,
  StateCacheSnapshot,
  StateCacheJournalHead,
  DerivedEffectSummary,
} from "../types";
