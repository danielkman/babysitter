/**
 * Mirrored kradle workspace / write-back review contracts (SPEC-V2 §V2-7,
 * re-surfaced by SPEC-V3 §V3-4 as the human-review side panel).
 *
 * Faithful mirror of:
 *   - `packages/kradle/core/docs/agents/workspace-lifecycle-spec.md`
 *     (`AgentWorkspaceStatus.gitStatus`, workspace phase union)
 *   - `packages/kradle/core/docs/agents/artifacts-writeback-spec.md`
 *     (patch artifact shape, apply strategies, test evidence)
 *   - `packages/kradle/core/docs/agents/crd-schema-spec.md`
 *     (`AgentApproval` spec/status, `AgentStack.writeBackPolicy`)
 *
 * UI-only metadata (diff plate styling, dirty badges) stays OUT of these
 * mirrored types.
 */

import type { KradleResource } from './kradle-resources';

// ---------------------------------------------------------------------------
// Workspace status
// ---------------------------------------------------------------------------

export type AgentWorkspacePhase = 'created' | 'ready' | 'missing' | 'conflicted' | 'archived';

export interface WorkspaceGitStatus {
  branch: string;
  headSha: string;
  ahead?: number;
  behind?: number;
  dirty: boolean;
  uncommittedCount?: number;
}

export interface AgentWorkspaceStatus {
  phase: AgentWorkspacePhase;
  gitStatus: WorkspaceGitStatus;
}

// ---------------------------------------------------------------------------
// Patch artifact (write-back payload)
// ---------------------------------------------------------------------------

export type PatchApplyStrategy =
  | 'comment-only'
  | 'branch-update'
  | 'pr-update'
  | 'local-workspace-only';

export type TestEvidenceStatus = 'passed' | 'failed' | 'unknown';

export interface PatchTestEvidence {
  status: TestEvidenceStatus;
  summary?: string;
}

export interface PatchArtifact {
  kind: 'patch';
  /** Commit the patch was generated against. */
  baseRef: string;
  targetBranch?: string;
  /** Paths touched by the patch. */
  fileList: string[];
  /** Digest of the unified diff content. */
  diffDigest: string;
  /** Object-storage ref to the full patch body. */
  patchObjectRef: string;
  testEvidence: PatchTestEvidence;
  applyStrategy: PatchApplyStrategy;
}

// ---------------------------------------------------------------------------
// AgentApproval (AGGREGATED_KINDS; required spec: dispatchRun, action, requestedBy)
// ---------------------------------------------------------------------------

export type AgentApprovalPhase = 'pending' | 'approved' | 'denied' | 'completed';

export interface AgentApprovalSpec {
  /** Required: the dispatch run requesting the action. */
  dispatchRun: string;
  /** Required: who raised the approval. */
  requestedBy: {
    kind: string;
    name: string;
  };
  /** Required: the gated action. */
  action: {
    type: string;
    target: string;
    summary: string;
  };
  policyReasons?: string[];
}

export interface AgentApprovalStatusFields {
  phase: AgentApprovalPhase;
  decision?: 'approved' | 'denied';
  feedback?: string;
}

export type AgentApproval = Omit<KradleResource<'AgentApproval', AgentApprovalSpec>, 'status'> & {
  status: Omit<KradleResource<'AgentApproval', AgentApprovalSpec>['status'], 'phase'> &
    AgentApprovalStatusFields;
};

// ---------------------------------------------------------------------------
// Write-back policy (AgentStack.spec.writeBackPolicy)
// ---------------------------------------------------------------------------

export interface WriteBackPolicy {
  requireApproval: boolean;
  allowedTargets: string[];
}
