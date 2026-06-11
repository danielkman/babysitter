/**
 * Mirrored kradle resource contracts (SPEC §2).
 *
 * Faithful mirror of the kradle CRD schema spec
 * (`packages/kradle/core/docs/agents/crd-schema-spec.md`):
 *   - Shared resource shape: `apiVersion: kradle.a5c.ai/v1alpha1`, `metadata`,
 *     `spec`, `status { storage, phase, conditions[], observedGeneration }`.
 *   - `AgentStack.spec` essentials (required: baseAgent, adapter, runtimeIdentity).
 *   - `AgentDispatchRun.spec` (required: repository, sourceRefs, agentStack,
 *     taskKind) — the shape backing `CommanderTask`.
 *
 * UI-only metadata (world positions, progress rings, icons) stays OUT of these
 * mirrored types and lives in the game layer keyed by entity id.
 */

// ---------------------------------------------------------------------------
// Shared schema conventions
// ---------------------------------------------------------------------------

export const KRADLE_API_VERSION = 'kradle.a5c.ai/v1alpha1' as const;
export type KradleApiVersion = typeof KRADLE_API_VERSION;

/** Summary state for UI tables. */
export type KradlePhase = 'Ready' | 'Pending' | 'Failed';

/** Where the resource is persisted. */
export type KradleStorage = 'etcd' | 'postgres' | 'postgres/object storage';

/** Typed readiness/blocked/drift detail (condition shape from the spec). */
export interface KradleCondition {
  /** Stable enum condition type (e.g. 'Ready', 'CapabilitiesResolved'). */
  type: string;
  /** Kubernetes-style tri-state string. */
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  /** For humans; must not be parsed by controllers. */
  message?: string;
  observedGeneration?: number;
  lastTransitionTime?: string;
}

export interface KradleMetadata {
  /** Stable resource name. */
  name: string;
  /** Defaulted by `withKradleDefaults()` when missing. */
  namespace?: string;
  /** Searchable ownership/repository/stack/trigger/source labels. */
  labels?: Record<string, string>;
}

export interface KradleResourceStatus {
  storage?: KradleStorage;
  /** Summary state for UI tables. */
  phase: KradlePhase;
  /** Typed readiness/blocked/drift details. */
  conditions: KradleCondition[];
  /** Generation reconciled by the controller. */
  observedGeneration?: number;
}

/** Base shape every kradle resource follows (`resourceSchemaForKind()` contract). */
export interface KradleResource<TKind extends string, TSpec> {
  apiVersion: KradleApiVersion;
  kind: TKind;
  metadata: KradleMetadata;
  /** Desired state or immutable execution request. */
  spec: TSpec;
  status: KradleResourceStatus;
}

// ---------------------------------------------------------------------------
// AgentStack (CONFIG_KINDS; required spec: baseAgent, adapter, runtimeIdentity)
// ---------------------------------------------------------------------------

export interface AgentStackSpec {
  /** Required: base agent (e.g. 'claude-code'). */
  baseAgent: string;
  /** Required: adapter binding (e.g. 'adapters.claude-code'). */
  adapter: string;
  provider?: string;
  model?: string;
  prompt?: {
    system?: string;
    developer?: string;
  };
  approvalMode?: 'yolo' | 'prompt' | 'deny';
  /** Required: runtime identity binding. */
  runtimeIdentity: {
    serviceAccountRef: string;
  };
  toolProfileRef?: string;
  mcpServerRefs?: string[];
  skillRefs?: string[];
  subagentRefs?: string[];
  contextLabelRefs?: string[];
  workspacePolicyRef?: string;
  runnerPool?: string;
}

export type AgentStack = KradleResource<'AgentStack', AgentStackSpec>;

// ---------------------------------------------------------------------------
// AgentDispatchRun (AGGREGATED_KINDS; required spec: repository, sourceRefs,
// agentStack, taskKind)
// ---------------------------------------------------------------------------

/** Source breadcrumbs linking a dispatch back to what triggered it. */
export interface AgentDispatchSourceRefs {
  pullRequest?: string;
  pipeline?: string;
  job?: string;
  triggerRule?: string;
  [key: string]: string | undefined;
}

export interface AgentDispatchRunSpec {
  /** Required: target repository. */
  repository: string;
  ref?: string;
  branch?: string;
  sha?: string;
  sourceEvent?: {
    kind: string;
    name: string;
  };
  /** Required: source breadcrumbs. */
  sourceRefs: AgentDispatchSourceRefs;
  /** Required: name of the AgentStack executing this dispatch. */
  agentStack: string;
  /** Required: task kind (e.g. 'ci-repair'). */
  taskKind: string;
  contextBundleRef?: string;
  workspaceRef?: string;
  runnerPool?: string;
  approvalPolicy?: {
    requireWriteBackApproval?: boolean;
  };
}

export type AgentDispatchRun = KradleResource<'AgentDispatchRun', AgentDispatchRunSpec>;

// ---------------------------------------------------------------------------
// CommanderTask — the task/objective entity backing map nodes (SPEC §3, §6)
// ---------------------------------------------------------------------------

/**
 * A Commander task is exactly an `AgentDispatchRun`-shaped kradle resource
 * (`taskKind`, `repository`, `agentStack`, `status.phase`, `sourceRefs`).
 * UI progress (0..1) and icon specs are layered on by `TaskEntity` in the
 * game store — they are NOT part of this mirrored contract.
 */
export type CommanderTask = AgentDispatchRun;
