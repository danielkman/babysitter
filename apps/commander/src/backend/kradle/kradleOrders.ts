/**
 * Real-mode `Orders` over the kradle control plane (SPEC-KRADLE-CONTROLPLANE §3,
 * AC14). Resource-lifecycle verbs call the §1 client; runtime verbs route to the
 * optional gateway `Orders` via the §3.3 plane resolution; everything else stays
 * a documented warn-once no-op with the SAME signature (never throws).
 *
 * `makeKradleOrders(client, options)` is built once in `bootReal` (§4.2). It
 * fires client calls fire-and-forget (mirroring the gateway's frame verbs): on
 * success it asks the boot layer to schedule a debounced snapshot refresh
 * (§6.3) so the board reflects the write within ≤500ms; on failure it logs and
 * swallows (no retry loop, AC9). The snapshot accessor lets `decide`/`abort`
 * resolve a pending approval name / run id for plane routing.
 */

import type { KradleAgentStackInput } from '../../contracts/kradle-stack';
import type { ColumnId, RosterRole, UpdateTaskPatch } from '../mock/simulation';
import type { TaskKind } from '../mock/scenario';
import { DEFAULT_STACK_BY_KIND, WORKER_ADAPTER_BY_KIND } from '../mock/scenario';
import type { Orders } from '../../game/store';
import type {
  ApprovalDecision,
  DefinitionPatchBody,
  DefinitionWriteBody,
  DispatchInput,
  KradleControllerClient,
  KradleControllerSnapshot,
  KradleResourceItem,
} from './controllerClient';
import {
  LABEL_DEFAULT_FOR,
  LABEL_ROLE,
  LABEL_ROSTER_NAME,
  LABEL_STACK_REF,
} from './mappers';

export interface KradleOrdersOptions {
  /** Default dispatch repository (`config.kradleRepo`, §3.1). */
  repo: string;
  /** Read the latest cached snapshot (for approval/run resolution, §3.3). */
  getSnapshot(): KradleControllerSnapshot | null;
  /** Ask the boot layer to schedule a debounced refresh after a write (§6.3). */
  scheduleRefresh(): void;
  /** The gateway `Orders` when a gateway backend is also present (§3.3 routing). */
  gatewayOrders?: Orders;
}

// ---------------------------------------------------------------------------
// Small structural readers (the snapshot items are wide; narrow `unknown`).
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function specOf(item: KradleResourceItem): Record<string, unknown> {
  return isRecord(item.spec) ? item.spec : {};
}

function labelsOf(item: KradleResourceItem): Record<string, string> {
  const raw = item.metadata.labels;
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function runItems(snapshot: KradleControllerSnapshot | null): KradleResourceItem[] {
  return snapshot?.agents?.runs?.items ?? [];
}

function pendingApprovals(snapshot: KradleControllerSnapshot | null): KradleResourceItem[] {
  const pending = snapshot?.agents?.approvals?.pending;
  if (Array.isArray(pending)) return pending;
  const all = snapshot?.agents?.approvals?.items ?? [];
  return all.filter((a) => {
    const phase = isRecord(a.status) ? asString(a.status.phase) : undefined;
    return phase === undefined || phase === 'Pending';
  });
}

function stackItems(snapshot: KradleControllerSnapshot | null): KradleResourceItem[] {
  return snapshot?.agents?.stacks?.items ?? [];
}

// ---------------------------------------------------------------------------
// Stack resolution for dispatch (§3.1).
// ---------------------------------------------------------------------------

const ADAPTER_FAMILY: Record<string, string> = {
  'claude-code': 'claude-code',
  codex: 'codex',
  'gemini-cli': 'gemini-cli',
  pi: 'pi',
};

function adapterFamily(adapter: string | undefined): string | undefined {
  if (adapter === undefined) return undefined;
  for (const family of Object.keys(ADAPTER_FAMILY)) {
    if (adapter === family || adapter.includes(family)) return family;
  }
  return adapter;
}

/**
 * §3.1 stack resolution: prefer a stack labeled `default-for=<taskKind>`, else
 * the first stack whose adapter family matches `WORKER_ADAPTER_BY_KIND`, else the
 * first stack. Returns the stack name or `null` when no stack exists.
 */
export function resolveDispatchStack(
  snapshot: KradleControllerSnapshot | null,
  taskKind: TaskKind,
): string | null {
  const stacks = stackItems(snapshot);
  if (stacks.length === 0) {
    // No live stacks in the snapshot: fall back to the kind's seeded default ref
    // (the dispatch route resolves it server-side / legacy AgentStack path).
    return DEFAULT_STACK_BY_KIND[taskKind] ?? null;
  }
  const labelled = stacks.find((s) => labelsOf(s)[LABEL_DEFAULT_FOR] === taskKind);
  if (labelled !== undefined) return labelled.metadata.name;

  const wantFamily = WORKER_ADAPTER_BY_KIND[taskKind];
  const byFamily = stacks.find((s) => adapterFamily(asString(specOf(s).adapter)) === wantFamily);
  if (byFamily !== undefined) return byFamily.metadata.name;

  return stacks[0]!.metadata.name;
}

// ---------------------------------------------------------------------------
// Inverse stack mapping (§2.1) for upsertStack → AgentDefinition spec (§3).
// ---------------------------------------------------------------------------

function stackInputToWriteBody(stack: KradleAgentStackInput): DefinitionWriteBody {
  const sp = stack.spec;
  const name = stack.metadata.name;
  const labels: Record<string, string> = { ...(stack.metadata.labels ?? {}) };
  const spec: Record<string, unknown> = {
    baseAgent: sp.baseAgent,
    adapter: sp.adapter,
    model: sp.model,
    prompt: sp.prompt,
    approvalMode: sp.approvalMode,
  };
  if (sp.provider !== undefined) spec.provider = sp.provider;
  if (sp.toolProfileRef !== undefined) spec.toolProfileRef = sp.toolProfileRef;
  if (sp.skillRefs !== undefined) spec.skillRefs = sp.skillRefs;
  if (sp.subagentRefs !== undefined) spec.subagentRefs = sp.subagentRefs;
  if (sp.runnerPool !== undefined) spec.runnerPool = sp.runnerPool;
  return { metadata: { name, labels }, spec };
}

function stackInputToPatchBody(stack: KradleAgentStackInput): DefinitionPatchBody {
  const write = stackInputToWriteBody(stack);
  return { metadata: { labels: write.metadata.labels }, spec: write.spec };
}

// ---------------------------------------------------------------------------
// Decision routing (§3.3): AgentApproval (plane 1) vs gateway hook (plane 2).
// ---------------------------------------------------------------------------

function isPendingApprovalName(snapshot: KradleControllerSnapshot | null, name: string): boolean {
  return pendingApprovals(snapshot).some((a) => a.metadata.name === name);
}

function isKnownRun(snapshot: KradleControllerSnapshot | null, name: string): boolean {
  return runItems(snapshot).some((r) => r.metadata.name === name);
}

// ---------------------------------------------------------------------------
// Orders factory
// ---------------------------------------------------------------------------

export function makeKradleOrders(
  client: KradleControllerClient,
  options: KradleOrdersOptions,
): Orders {
  const { getSnapshot, scheduleRefresh, gatewayOrders } = options;
  const repo = options.repo || 'default';
  const warned = new Set<string>();

  function noop(name: string): void {
    if (warned.has(name)) return;
    warned.add(name);
    // eslint-disable-next-line no-console -- one-time documented-gap notice (real mode)
    console.warn(`kradleOrders: '${name}' has no kradle write path (documented no-op)`);
  }

  /** Run an async client call fire-and-forget; refresh on success, log on error. */
  function run(label: string, op: () => Promise<unknown>): void {
    op().then(
      () => {
        scheduleRefresh();
      },
      (error: unknown) => {
        // eslint-disable-next-line no-console -- verb failure is logged, not retried (AC9)
        console.warn(`kradleOrders: '${label}' failed`, error);
      },
    );
  }

  return {
    // --- runtime verbs: gateway plane (frames) -------------------------------
    abort(unitIds) {
      const snapshot = getSnapshot();
      for (const id of unitIds) {
        if (isKnownRun(snapshot, id)) {
          // A selected card/run → cancel the run (§1.5).
          run('abort/cancelRun', () => client.cancelRun(id));
        } else if (gatewayOrders) {
          // An active agent (unitId) → gateway /abort (§3).
          gatewayOrders.abort([id]);
        } else {
          noop('abort');
        }
      }
    },
    steer(unitIds, prompt) {
      if (gatewayOrders) {
        gatewayOrders.steer(unitIds, prompt);
      } else {
        noop('steer');
      }
    },
    decide(hookRequestId, decision) {
      const snapshot = getSnapshot();
      if (isPendingApprovalName(snapshot, hookRequestId)) {
        const approval: ApprovalDecision = decision === 'allow' ? 'approve' : 'deny';
        run('decide/decideApproval', () => client.decideApproval(hookRequestId, approval));
        return;
      }
      if (gatewayOrders) {
        gatewayOrders.decide(hookRequestId, decision);
        return;
      }
      noop('decide');
    },
    answerInquiry(hookRequestId, optionId) {
      const snapshot = getSnapshot();
      // §3.3: a gateway carries the optionId verbatim; route there when present.
      if (gatewayOrders && !isPendingApprovalName(snapshot, hookRequestId)) {
        gatewayOrders.answerInquiry(hookRequestId, optionId);
        return;
      }
      if (isPendingApprovalName(snapshot, hookRequestId)) {
        // kradle approvals are binary: map the option to approve/deny heuristically.
        const proceed =
          optionId === null ||
          /^(approve|proceed|allow|yes|continue|ship|go)$/i.test(optionId);
        const approval: ApprovalDecision = proceed ? 'approve' : 'deny';
        run('answerInquiry/decideApproval', () =>
          client.decideApproval(hookRequestId, approval),
        );
        return;
      }
      if (gatewayOrders) {
        gatewayOrders.answerInquiry(hookRequestId, optionId);
        return;
      }
      noop('answerInquiry');
    },

    // --- resource-lifecycle verbs: kradle plane ------------------------------
    createTask(input) {
      const stackRef = resolveDispatchStack(getSnapshot(), input.taskKind);
      if (stackRef === null) {
        noop('createTask');
        return null;
      }
      const body: DispatchInput = {
        agentDefinition: stackRef,
        repository: repo,
        ref: 'main',
        taskKind: input.taskKind,
        actor: 'owner',
      };
      run('createTask/dispatch', () => client.dispatch(body));
      // The new run's id arrives on the next snapshot refresh (the dispatch
      // route emits an SSE frame + the poller picks it up). The synchronous
      // Orders contract returns the eagerly-resolved stack-derived id is not
      // available; the board reconciles the card on refresh. Return null
      // synchronously (the card appears post-refresh, §6.3).
      return null;
    },
    upsertStack(stack: KradleAgentStackInput) {
      if (stack.stackRef !== undefined && stack.stackRef !== '') {
        run('upsertStack/patchDefinition', () =>
          client.patchDefinition(stack.stackRef!, stackInputToPatchBody(stack)),
        );
        return stack.stackRef;
      }
      run('upsertStack/createDefinition', () =>
        client.createDefinition(stackInputToWriteBody(stack)),
      );
      return stack.metadata.name;
    },
    createRosterAgent(input) {
      const name =
        input.name !== undefined && input.name !== ''
          ? input.name
          : `${input.role}-${input.stackRef}`;
      const body: DefinitionWriteBody = {
        metadata: {
          name,
          labels: {
            [LABEL_ROSTER_NAME]: input.name ?? name,
            [LABEL_STACK_REF]: input.stackRef,
            [LABEL_ROLE]: input.role,
          },
        },
        spec: { baseAgent: 'claude-code', adapter: 'claude-code' },
      };
      run('createRosterAgent/createDefinition', () => client.createDefinition(body));
      return name;
    },
    deleteRosterAgent(agentId) {
      run('deleteRosterAgent/deleteDefinition', () => client.deleteDefinition(agentId));
    },

    // --- documented gaps (warn-once no-ops; same signatures, never throw) -----
    pauseUnits() {
      noop('pauseUnits');
    },
    resumeUnits() {
      noop('resumeUnits');
    },
    prioritize() {
      noop('prioritize');
    },
    toggleSim() {
      noop('toggleSim');
    },
    moveCard(_taskId: string, _column: ColumnId) {
      noop('moveCard');
    },
    setYolo() {
      noop('setYolo');
    },
    revertCard() {
      noop('revertCard');
    },
    release(): string | null {
      noop('release');
      return null;
    },
    rollbackCard() {
      noop('rollbackCard');
    },
    setSpeed(): boolean {
      noop('setSpeed');
      return false;
    },
    updateTask(_taskId: string, _patch: UpdateTaskPatch): boolean {
      noop('updateTask');
      return false;
    },
    updateProcessTemplate(_kind: TaskKind, _phases: string[]): number | null {
      noop('updateProcessTemplate');
      return null;
    },
    writeFile(): boolean {
      noop('writeFile');
      return false;
    },
    assignTaskAgent(_taskId: string, _role: RosterRole, _agentId: string | null) {
      noop('assignTaskAgent');
    },
    assignTaskHuman() {
      noop('assignTaskHuman');
    },
    focusInquiryCard() {
      // Navigation is UI-local; no kradle call (matches realBoot.ts).
    },
  };
}
