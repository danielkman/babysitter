/**
 * Tick-driven deterministic simulation — kanban model (SPEC §7 as amended by
 * SPEC-V3 §V3-1/§V3-2/§V3-5).
 *
 * The world is a board of five columns (backlog | do | ai-review |
 * human-review | approved) whose cards are tasks. There are NO idle agents
 * and no pre-spawned fleet: agents exist only while attached to a card.
 *
 * Lifecycle (SPEC-V3 §V3-2):
 *   card enters DO        -> a worker agent of the kind-mapped adapter spawns
 *                            (stack children each get their own worker);
 *   work complete         -> auto-move to AI REVIEW; worker despawns; 1–2
 *                            REVIEWER agents of a DIFFERENT adapter spawn;
 *   AI verdict (per seed) -> PASS: HUMAN REVIEW (or APPROVED when yolo);
 *                            REJECT: back to DO with feedback + fresh worker;
 *   HUMAN REVIEW          -> no agents; user verdicts via moveCard;
 *   APPROVED              -> an INTEGRATION agent merges (rebase /
 *                            conflict-fix / integration-test events) ending
 *                            in the MERGED terminal state, then despawns.
 * Agents despawn whenever their card leaves their column.
 *
 * Kept systems, adapted to the column model:
 *   - memory (SPEC-V2 §V2-3): unified 40–60-record graph across 3–4 silos;
 *     ACTIVE agents emit `memory_query` (held pieces) and `memory_update`;
 *   - per-card babysitter process run (SPEC-V2 §V2-5): kind-derived phase
 *     pipeline, journal events per phase, breakpoint effect pending while an
 *     inquiry is open, ObservedRunState derivation;
 *   - workspace changes (SPEC-V2 §V2-7): files+diffs accumulate while in DO,
 *     reviewer notes in AI REVIEW, integration applies the patch.
 *
 * Inquiries (SPEC-V3 §V3-5): `hook.request` payload carries
 * `{ question, options: [{ id, caption, detail?, tone? }] }` (2–5 options;
 * icons attach in the microagent phase); `hook.decision` is extended with
 * `optionId`; the sim branches deterministically per option (phase label +
 * distinct follow-up events).
 *
 * Determinism rules: no Date.now(), no Math.random() — the sim clock is
 * `epochMs + tick * TICK_MS` and all randomness flows through one seeded
 * Prng. Same seed + same verb sequence => identical board + frame stream.
 *
 * Verb surface (v1-PROTOCOL GAP, raise upstream): gateway protocol v1 has no
 * board verbs, so `moveCard` / `setYolo` / `createTask` / `answerInquiry`
 * ride a sim-local client command channel exposed directly on this class
 * (the UI test-hooks API binds them). `session.message` remains for
 * steer/abort of ACTIVE agents; `hook.decision` (with the `optionId`
 * extension) resolves inquiries.
 */

import type { AgentEvent, CostRecord } from '../../contracts/adapter-events';
import type {
  EffectKind,
  JournalEvent,
  JournalEventType,
  ObservedRunState,
  PendingEffectsByKind,
} from '../../contracts/babysitter-run';
import type {
  AgentSummary,
  ClientFrame,
  HookRequestFrame,
  RunEntry,
  ServerFrame,
  SessionEntry,
  SessionMessageFrame,
} from '../../contracts/gateway-protocol';
import type { GraphRecord } from '../../contracts/kradle-memory';
import type {
  AgentWorkspacePhase,
  TestEvidenceStatus,
  WorkspaceGitStatus,
} from '../../contracts/kradle-workspace';
import type { CommanderTask, KradlePhase } from '../../contracts/kradle-resources';
import { hashString, Prng } from './prng';
import type { AdapterName, Scenario, TaskKind } from './scenario';
import {
  ADAPTERS,
  generateScenario,
  MODELS_BY_ADAPTER,
  PARENT_TASK_LABEL,
  TASK_KINDS,
  TASK_TITLES,
  WORKER_ADAPTER_BY_KIND,
} from './scenario';

// ---------------------------------------------------------------------------
// Sim-local domain types (NOT contracts — UI/game-layer vocabulary)
// ---------------------------------------------------------------------------

export const TICK_MS = 250;

/** SPEC-V3 §V3-1 column ids. */
export const COLUMNS = ['backlog', 'do', 'ai-review', 'human-review', 'approved'] as const;
export type ColumnId = (typeof COLUMNS)[number];

/** Agent roles (SPEC-V3 §V3-2). */
export type AgentRole = 'worker' | 'reviewer' | 'integration';

/** Active-agent visual states. */
export type AgentState = 'thinking' | 'tool_running' | 'awaiting_input';

/**
 * Unit lifecycle states kept for the v1 store compatibility surface
 * (`SimUnitView.state`). Active agents only ever occupy `thinking`,
 * `tool_running` or `awaiting_approval` under V3.
 */
export type UnitLifecycleState =
  | 'idle'
  | 'dispatching'
  | 'thinking'
  | 'tool_running'
  | 'awaiting_approval'
  | 'blocked'
  | 'completed'
  | 'failed';

/** Task states (v1 compat mapping of the V3 column model). */
export type SimTaskState = 'queued' | 'assigned' | 'in_progress' | 'review' | 'done' | 'failed';

/** SPEC-V3 §V3-5 inquiry kinds (sim variety). */
export type InquiryKind = 'strategy' | 'fix-approach' | 'dependency-version' | 'tool-approval';

/** SPEC-V3 §V3-5 InquiryOption — icon-less here; icons attach in the microagent phase. */
export interface SimInquiryOption {
  id: string;
  caption: string;
  detail?: string;
  tone?: 'normal' | 'danger' | 'primary';
}

export interface SimInquiryPayload {
  question: string;
  options: SimInquiryOption[];
}

// --- run.event-enveloped sim-local payloads (open `event` record) -----------

export interface CardMovedEventPayload {
  type: 'card_moved';
  runId: string;
  agent: string;
  timestamp: number;
  taskId: string;
  from: ColumnId;
  to: ColumnId;
  reason:
    | 'user-move'
    | 'work-complete'
    | 'review-pass'
    | 'review-pass-yolo'
    | 'review-rejected'
    | 'aborted';
}

export interface SimLocalEventPayload {
  type:
    | 'task_created'
    | 'task_prioritized'
    | 'yolo_set'
    | 'card_merged'
    | 'phase_started'
    | 'phase_completed'
    | 'review_note'
    | 'review_feedback'
    | 'review_verdict'
    | 'integration_step'
    | 'inquiry_resolved'
    | 'inquiry_followup'
    | 'memory_query'
    | 'memory_update'
    | 'workspace_change';
  runId: string;
  agent: string;
  timestamp: number;
  taskId: string;
  [key: string]: unknown;
}

// --- views -------------------------------------------------------------------

export interface SimCardView {
  taskId: string;
  taskKind: TaskKind;
  title: string;
  repository: string;
  workspaceId: string;
  column: ColumnId;
  /** Backlog ordering (lower = nearer the top). */
  order: number;
  yolo: boolean;
  /** Terminal seal (SPEC-V3 §V3-2): integration finished. */
  merged: boolean;
  progress: number;
  parentId: string | null;
  childIds: string[];
  /** Active agents attached to this card. */
  agentIds: string[];
  attempt: number;
  feedback: string | null;
  dirtyFileCount: number;
  hasPendingInquiry: boolean;
}

export interface SimAgentView {
  unitId: string;
  agent: AdapterName;
  model: string;
  role: AgentRole;
  taskId: string;
  state: AgentState;
  paused: boolean;
  runId: string;
  pendingHookId: string | null;
  /** Memory record ids currently held (SPEC-V2 §V2-3). */
  heldPieces: string[];
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    cachedTokens: number;
  };
  cost: CostRecord;
  turnCount: number;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SimInquiryView {
  hookRequestId: string;
  runId: string;
  taskId: string;
  unitId: string;
  inquiryKind: InquiryKind;
  question: string;
  options: SimInquiryOption[];
  deadlineTs: number;
}

export interface SimWorkspaceFileView {
  path: string;
  status: 'A' | 'M' | 'D';
  additions: number;
  deletions: number;
  /** Synthetic unified diff (5–25 lines, references the task title). */
  diff: string;
}

export interface SimWorkspaceView {
  taskId: string;
  phase: AgentWorkspacePhase;
  gitStatus: WorkspaceGitStatus;
  files: SimWorkspaceFileView[];
  testEvidence: { status: TestEvidenceStatus; summary?: string };
  reviewerNotes: string[];
}

export interface SimRunObservationView {
  runId: string;
  taskId: string;
  observedState: ObservedRunState;
  pendingEffectsByKind: PendingEffectsByKind;
  phases: Array<{ label: string; status: 'done' | 'current' | 'pending' }>;
  journal: JournalEvent[];
}

export interface SimMemorySiloView {
  name: string;
  phase: KradlePhase;
  currentCommit: string;
  recordCount: number;
  owner: string;
  recordIds: string[];
}

// --- v1 compatibility views (consumed by the existing game store) ------------

export interface SimUnitView {
  unitId: string;
  agent: string;
  model: string;
  title: string;
  workspaceId: string;
  state: UnitLifecycleState;
  paused: boolean;
  taskId: string | null;
  runId: string | null;
  turnIndex: number;
  turnCount: number;
  messageCount: number;
  pendingHookId: string | null;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    cachedTokens: number;
  };
  cost: CostRecord;
  createdAt: number;
  updatedAt: number;
}

export interface SimTaskView {
  taskId: string;
  taskKind: string;
  repository: string;
  workspaceId: string;
  title: string;
  state: SimTaskState;
  phase: KradlePhase;
  progress: number;
  assigneeIds: string[];
  priority: number;
}

export interface SimHookView {
  hookRequestId: string;
  runId: string;
  unitId: string;
  hookKind: string;
  payload: Record<string, unknown>;
  deadlineTs: number;
}

/** Fully JSON-serializable deep snapshot of sim state (determinism testing). */
export interface SimSnapshot {
  seed: number;
  tick: number;
  simTimeMs: number;
  rngDraws: number;
  counters: { runs: number; hooks: number; tools: number; agents: number; creations: number };
  cards: SimCardView[];
  agents: SimAgentView[];
  inquiries: SimInquiryView[];
  workspaces: SimWorkspaceView[];
  runs: RunEntry[];
}

// ---------------------------------------------------------------------------
// Phase pipelines (SPEC-V2 §V2-5: derived from task kind)
// ---------------------------------------------------------------------------

export const PHASES_BY_KIND: Record<TaskKind, readonly string[]> = {
  fix: ['reproduce', 'diagnose', 'patch', 'verify'],
  review: ['survey', 'annotate', 'verdict'],
  'root-cause-analysis': ['reproduce', 'hypothesize', 'bisect', 'conclude'],
  'test-coverage': ['map gaps', 'add cases', 'run suite'],
  docs: ['outline', 'draft', 'polish prose'],
  research: ['survey', 'synthesize', 'cite sources'],
  polish: ['capture plates', 'score', 'apply findings'],
  deploy: ['dry run', 'ship', 'watch'],
  migrate: ['plan steps', 'execute step', 'verify parity'],
  implement: ['plan', 'implement', 'verify', 'review'],
};

// ---------------------------------------------------------------------------
// Inquiry tables (SPEC-V3 §V3-5 — deterministic option palettes)
// ---------------------------------------------------------------------------

interface InquiryTemplate {
  inquiryKind: InquiryKind;
  question: (title: string) => string;
  options: SimInquiryOption[];
}

const INQUIRY_TEMPLATES: readonly InquiryTemplate[] = [
  {
    inquiryKind: 'strategy',
    question: (title) => `Choose the working strategy for "${title}"`,
    options: [
      { id: 'incremental', caption: 'Incremental', detail: 'Small reviewed steps, slower but safe', tone: 'primary' },
      { id: 'big-bang', caption: 'Big Bang', detail: 'One sweeping change, fastest path', tone: 'danger' },
      { id: 'expand-contract', caption: 'Expand-Contract', detail: 'Parallel structures, migrate, then prune', tone: 'normal' },
    ],
  },
  {
    inquiryKind: 'fix-approach',
    question: (title) => `Pick the fix approach for "${title}"`,
    options: [
      { id: 'patch-forward', caption: 'Patch Forward', detail: 'Repair in place on the current branch', tone: 'primary' },
      { id: 'revert-redo', caption: 'Revert & Redo', detail: 'Back out the regression, reland cleanly', tone: 'normal' },
      { id: 'quarantine', caption: 'Quarantine', detail: 'Isolate the failure behind a flag for now', tone: 'danger' },
    ],
  },
  {
    inquiryKind: 'dependency-version',
    question: (title) => `Select the dependency version for "${title}"`,
    options: [
      { id: 'pin-current', caption: 'Pin Current', detail: 'Freeze the working version', tone: 'normal' },
      { id: 'minor-bump', caption: 'Minor Bump', detail: 'Take the latest compatible minor', tone: 'primary' },
      { id: 'major-upgrade', caption: 'Major Upgrade', detail: 'Cross the breaking-change line', tone: 'danger' },
      { id: 'hold', caption: 'Hold', detail: 'Defer the decision to the next cycle', tone: 'normal' },
    ],
  },
  {
    // Classic 2-option tool approval — the degenerate case (SPEC-V3 §V3-5).
    inquiryKind: 'tool-approval',
    question: (title) => `Agent wants to run \`git push\` for "${title}" — proceed?`,
    options: [
      { id: 'proceed', caption: 'Proceed', detail: 'Allow the gated tool call', tone: 'primary' },
      { id: 'stand-down', caption: 'Stand Down', detail: 'Deny and rethink', tone: 'danger' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Workspace path pools per kind (plausible changed files, SPEC-V2 §V2-7)
// ---------------------------------------------------------------------------

const FILE_POOLS: Record<TaskKind, readonly string[]> = {
  implement: ['src/core/mechanism.ts', 'src/core/mechanism.test.ts', 'src/index.ts', 'src/core/registry.ts'],
  review: ['REVIEW_NOTES.md', 'src/review/checklist.ts', 'docs/review-log.md'],
  fix: ['src/engine/regulator.ts', 'src/engine/regulator.test.ts', 'src/engine/valves.ts', 'CHANGELOG.md'],
  'root-cause-analysis': ['docs/rca/findings.md', 'src/diagnostics/probe.ts', 'src/diagnostics/probe.test.ts'],
  polish: ['src/ui/plates.css', 'src/ui/ornament.tsx', 'docs/style-ledger.md'],
  'test-coverage': ['src/core/mechanism.test.ts', 'src/engine/valves.test.ts', 'vitest.config.ts'],
  docs: ['docs/atlas.md', 'README.md', 'docs/glossary.md'],
  deploy: ['deploy/manifest.yaml', 'scripts/launch.sh', 'deploy/rollback.md'],
  research: ['docs/research/survey.md', 'docs/research/citations.md', 'notes/leads.md'],
  migrate: ['migrations/0007-vault.sql', 'src/storage/vault.ts', 'src/storage/vault.test.ts', 'docs/migration-plan.md'],
};

const THINKING_PHRASES = [
  'Scanning the objective perimeter... ',
  'Cross-referencing the failing assertions... ',
  'The diff suggests a deeper structural issue. ',
  'Weighing two repair strategies... ',
  'Tracing the regression to its origin commit. ',
  'Formulating a minimal patch plan. ',
] as const;

const TEXT_PHRASES = [
  'Applying the fix to the affected module. ',
  'Updating tests to cover the new branch. ',
  'Refactoring the helper for clarity. ',
  'Verifying the change against the spec. ',
  'Documenting the decision inline. ',
  'Consolidating duplicate logic. ',
] as const;

const TOOL_NAMES = ['Bash', 'Read', 'Edit', 'Grep', 'WebFetch'] as const;

const REVIEW_NOTE_TEMPLATES = [
  (file: string) => `Consider tightening the error handling in ${file}.`,
  (file: string) => `${file}: naming is clear; add a regression test for the edge case.`,
  (file: string) => `The diff in ${file} looks correct; verify the rollback path.`,
  (file: string) => `${file} duplicates logic from the registry — extract a helper.`,
] as const;

const REJECT_FEEDBACK = [
  'Changes requested: the verify phase is missing coverage for the failure path.',
  'Changes requested: the patch leaks state across iterations — isolate it.',
  'Changes requested: documentation does not match the implemented behavior.',
] as const;

/** Per-adapter token pricing used to accrue mock cost (USD per token). */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-code': { input: 3e-6, output: 15e-6 },
  codex: { input: 2.5e-6, output: 10e-6 },
  'gemini-cli': { input: 1.5e-6, output: 7e-6 },
  pi: { input: 1e-6, output: 5e-6 },
};

/**
 * Inquiry deadline: 15s sim time (60 ticks). Unanswered inquiries auto-default
 * to their first option so the board never deadlocks (deterministic).
 */
const HOOK_DEADLINE_MS = 15_000;
const SERVER_VERSION = 'mock-commander/3.0.0';
const JOURNAL_CAP = 100;

// ---------------------------------------------------------------------------
// Internal records
// ---------------------------------------------------------------------------

interface OpenEffect {
  effectId: string;
  kind: EffectKind;
  label: string;
}

interface CardRunRecord {
  runId: string;
  entry: RunEntry;
  seq: number;
  journal: JournalEvent[];
  journalSeq: number;
  phases: string[];
  phaseIndex: number;
  phaseTicksLeft: number;
  openEffects: OpenEffect[];
  effectCounter: number;
  terminal: 'completed' | 'failed' | null;
}

interface WorkspaceFileRecord {
  path: string;
  status: 'A' | 'M' | 'D';
  additions: number;
  deletions: number;
  diff: string;
}

interface CardWorkspaceRecord {
  phase: AgentWorkspacePhase;
  branch: string;
  headSha: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  files: WorkspaceFileRecord[];
  testEvidence: { status: TestEvidenceStatus; summary?: string };
  reviewerNotes: string[];
}

interface CardRecord {
  taskId: string;
  resource: CommanderTask;
  taskKind: TaskKind;
  parentId: string | null;
  childIds: string[];
  column: ColumnId;
  order: number;
  yolo: boolean;
  merged: boolean;
  progress: number;
  attempt: number;
  feedback: string | null;
  run: CardRunRecord | null;
  ws: CardWorkspaceRecord;
  /** AI-review countdown (parent/single card only). */
  reviewTicksLeft: number;
  /** Integration step machine (approved column). */
  integrationSteps: string[];
  integrationIndex: number;
  integrationTicksLeft: number;
  /** Pending deterministic follow-up events from a resolved inquiry. */
  pendingFollowUps: Array<{ text: string; optionId: string }>;
  /** Inquiries raised in the current DO attempt (capped at 1 per attempt). */
  inquiriesThisAttempt: number;
  workerAdapter: AdapterName | null;
}

interface AgentRecord {
  unitId: string;
  agent: AdapterName;
  model: string;
  role: AgentRole;
  taskId: string;
  state: AgentState;
  held: boolean;
  stateTicks: number;
  stateDuration: number;
  pendingHookId: string | null;
  activeToolName: string | null;
  heldPieces: string[];
  turnCount: number;
  messageCount: number;
  accumulatedText: string;
  accumulatedThinking: string;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    cachedTokens: number;
  };
  cost: { totalUsd: number; inputTokens: number; outputTokens: number; thinkingTokens: number };
  createdAt: number;
  updatedAt: number;
}

interface InquiryRecord {
  hookRequestId: string;
  runId: string;
  taskId: string;
  unitId: string;
  inquiryKind: InquiryKind;
  question: string;
  options: SimInquiryOption[];
  deadlineTs: number;
  effectId: string;
}

// ---------------------------------------------------------------------------
// ObservedRunState derivation (mirror semantics of the babysitter SDK)
// ---------------------------------------------------------------------------

export function deriveObservedRunState(journal: readonly JournalEvent[]): ObservedRunState {
  let state: ObservedRunState = 'created';
  for (const event of journal) {
    switch (event.type) {
      case 'RUN_CREATED':
        state = 'created';
        break;
      case 'EFFECT_REQUESTED':
      case 'EFFECT_RESOLVED':
      case 'EFFECT_CANCELLED':
        state = 'waiting';
        break;
      case 'RUN_COMPLETED':
        state = 'completed';
        break;
      case 'RUN_HALTED':
        state = 'halted';
        break;
      case 'RUN_FAILED':
      case 'PROCESS_RUNTIME_ERROR':
        state = 'failed';
        break;
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Simulation engine
// ---------------------------------------------------------------------------

export interface SimulationOptions {
  seed: number;
  /** Override the generated scenario (tests). */
  scenario?: Scenario;
}

export class Simulation {
  readonly seed: number;
  readonly scenario: Scenario;

  private readonly rng: Prng;
  private readonly cards = new Map<string, CardRecord>();
  private readonly agents = new Map<string, AgentRecord>();
  private readonly runs = new Map<string, CardRunRecord>();
  private readonly inquiries = new Map<string, InquiryRecord>();
  private readonly listeners = new Set<(frame: ServerFrame) => void>();

  private tickCount = 0;
  private pausedFlag = false;
  private interval: ReturnType<typeof setInterval> | null = null;
  private runCounter = 0;
  private hookCounter = 0;
  private toolCounter = 0;
  private agentCounter = 0;
  private creationCounter = 0;
  private ulidCounter = 0;
  private orderCounter = 0;

  constructor(options: SimulationOptions) {
    this.seed = options.seed >>> 0;
    this.scenario = options.scenario ?? generateScenario(this.seed);
    this.rng = new Prng(this.seed);

    for (const card of this.scenario.cards) {
      this.addCard(card.resource, card.taskKind, card.parentId);
    }
  }

  // -------------------------------------------------------------------------
  // Clock / control surface (window.__commander.sim binds to these)
  // -------------------------------------------------------------------------

  get paused(): boolean {
    return this.pausedFlag;
  }

  get tickIndex(): number {
    return this.tickCount;
  }

  /** Current simulated wall-clock time (never Date.now()). */
  now(): number {
    return this.scenario.epochMs + this.tickCount * TICK_MS;
  }

  pause(): void {
    this.pausedFlag = true;
  }

  resume(): void {
    this.pausedFlag = false;
  }

  /** Advance the sim by `n` ticks regardless of the paused flag (single-step). */
  tick(n = 1): void {
    for (let i = 0; i < n; i += 1) {
      this.stepOnce();
    }
  }

  /** Begin auto-ticking every `intervalMs` (skips ticks while paused). */
  start(intervalMs: number = TICK_MS): void {
    if (this.interval !== null) return;
    this.interval = setInterval(() => {
      if (!this.pausedFlag) {
        this.stepOnce();
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  // -------------------------------------------------------------------------
  // Frame surface
  // -------------------------------------------------------------------------

  onFrame(cb: (frame: ServerFrame) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Apply a mirrored ClientFrame command. Effects are immediate and visible. */
  handleClientFrame(frame: ClientFrame): void {
    switch (frame.type) {
      case 'auth':
        this.emit({
          type: 'hello',
          protocolVersions: ['1'],
          serverVersion: SERVER_VERSION,
          serverTime: new Date(this.now()).toISOString(),
        });
        return;
      case 'ping':
        this.emit({ type: 'pong' });
        return;
      case 'subscribe':
        if (!this.runs.has(frame.runId)) {
          this.emit({
            type: 'error',
            code: 'run_not_found',
            message: `Unknown run: ${frame.runId}`,
            runId: frame.runId,
          });
        }
        return;
      case 'unsubscribe':
      case 'session.subscribe':
      case 'session.unsubscribe':
      case 'pairing.register':
      case 'pairing.consume':
        return;
      case 'session.start':
        // V3 retires manual agent creation (SPEC-V3: "agents are never
        // created manually") — agents spawn only when cards enter columns.
        this.emit({
          type: 'error',
          code: 'unsupported_in_v3',
          message: 'session.start is retired: agents spawn on demand when a card enters DO',
        });
        return;
      case 'session.message':
        this.handleSessionMessage(frame);
        return;
      case 'hook.decision':
        this.answerInquiry(frame.hookRequestId, frame.optionId ?? null, frame.decision, frame.reason);
        return;
    }
  }

  // -------------------------------------------------------------------------
  // Board verbs (sim-local client command channel — v1-protocol gap)
  // -------------------------------------------------------------------------

  /**
   * SPEC-V3 §V3-1 `moveCard(taskId, column)`. Validates LEGAL user moves:
   * backlog → do; human-review → do | ai-review | approved; backlog → backlog
   * (reorder to bottom). All other movement is automatic and rejected here.
   */
  moveCard(taskId: string, column: ColumnId): boolean {
    const card = this.cards.get(taskId);
    if (!card || !(COLUMNS as readonly string[]).includes(column)) {
      this.emit({ type: 'error', code: 'task_not_found', message: `Unknown task: ${taskId}` });
      return false;
    }
    if (card.parentId !== null) {
      this.emit({
        type: 'error',
        code: 'illegal_move',
        message: `Card ${taskId} is a stack child — drag its parent (the whole stack moves)`,
      });
      return false;
    }
    if (card.merged) {
      this.emit({ type: 'error', code: 'illegal_move', message: `Card ${taskId} is merged (terminal)` });
      return false;
    }
    const from = card.column;
    const legal =
      (from === 'backlog' && (column === 'do' || column === 'backlog')) ||
      (from === 'human-review' && (column === 'do' || column === 'ai-review' || column === 'approved'));
    if (!legal) {
      this.emit({
        type: 'error',
        code: 'illegal_move',
        message: `Illegal user move ${from} -> ${column} for ${taskId} (allowed: backlog->do, backlog reorder, human-review->do|ai-review|approved)`,
      });
      return false;
    }
    if (from === 'backlog' && column === 'backlog') {
      // Reorder: drop the card at the bottom of the backlog.
      this.orderCounter += 1;
      card.order = this.orderCounter;
      return true;
    }
    this.transitionCard(card, column, 'user-move');
    return true;
  }

  /** SPEC-V3 §V3-1 yolo toggle: passing AI review auto-approves. */
  setYolo(taskId: string, on: boolean): boolean {
    const card = this.cards.get(taskId);
    if (!card) {
      this.emit({ type: 'error', code: 'task_not_found', message: `Unknown task: ${taskId}` });
      return false;
    }
    if (card.yolo === on) return true;
    card.yolo = on;
    this.emitSimEvent(card, {
      type: 'yolo_set',
      runId: card.run?.runId ?? 'run-none',
      agent: 'commander',
      timestamp: this.now(),
      taskId,
      on,
    });
    return true;
  }

  /**
   * SPEC-V2 §V2-6 Commission Task (the Foundry's only surviving tab): lands
   * in BACKLOG with a deterministic `adr-cXX-…` id from a creation counter.
   */
  createTask(input: {
    taskKind: TaskKind;
    title?: string;
    parentId?: string;
    workspaceId?: string;
  }): string | null {
    if (!(TASK_KINDS as readonly string[]).includes(input.taskKind)) {
      this.emit({ type: 'error', code: 'invalid_task_kind', message: `Unknown task kind: ${String(input.taskKind)}` });
      return null;
    }
    const parent = input.parentId !== undefined ? this.cards.get(input.parentId) : undefined;
    if (input.parentId !== undefined && !parent) {
      this.emit({ type: 'error', code: 'task_not_found', message: `Unknown parent task: ${input.parentId}` });
      return null;
    }
    this.creationCounter += 1;
    const name = `adr-c${String(this.creationCounter).padStart(2, '0')}-${input.taskKind}`;
    const ws =
      this.scenario.workspaces.find((w) => w.workspaceId === input.workspaceId) ??
      this.scenario.workspaces[0]!;
    const title = input.title ?? TASK_TITLES[input.taskKind];
    const resource: CommanderTask = {
      apiVersion: 'kradle.a5c.ai/v1alpha1',
      kind: 'AgentDispatchRun',
      metadata: {
        name,
        namespace: 'kradle-system',
        labels: {
          'a5c.ai/title': title,
          'kradle.a5c.ai/repository': ws.repository,
          'kradle.a5c.ai/agent-stack': 'commander-fleet',
          'kradle.a5c.ai/runner-pool': 'untrusted-linux',
          ...(parent ? { [PARENT_TASK_LABEL]: parent.taskId } : {}),
        },
      },
      spec: {
        repository: ws.repository,
        ref: 'refs/heads/main',
        branch: 'main',
        sha: this.deterministicSha(name),
        sourceRefs: { triggerRule: 'commander-foundry' },
        agentStack: 'commander-fleet',
        taskKind: input.taskKind,
        workspaceRef: ws.workspaceId,
        runnerPool: 'untrusted-linux',
        approvalPolicy: { requireWriteBackApproval: true },
      },
      status: { storage: 'postgres', phase: 'Pending', conditions: [] },
    };
    const card = this.addCard(resource, input.taskKind, parent ? parent.taskId : null);
    this.emitSimEvent(card, {
      type: 'task_created',
      runId: 'run-none',
      agent: 'commander',
      timestamp: this.now(),
      taskId: name,
      taskKind: input.taskKind,
      title,
    });
    return name;
  }

  /**
   * Resolve an inquiry (SPEC-V3 §V3-5). `optionId` selects the branch; a bare
   * legacy allow/deny maps to the first/danger option of a tool approval.
   */
  answerInquiry(
    hookRequestId: string,
    optionId: string | null,
    decision: 'allow' | 'deny' = 'allow',
    reason?: string,
  ): boolean {
    const inquiry = this.inquiries.get(hookRequestId);
    if (!inquiry) {
      this.emit({ type: 'error', code: 'hook_not_found', message: `Unknown hook request: ${hookRequestId}` });
      return false;
    }
    const fallback =
      decision === 'deny'
        ? (inquiry.options.find((o) => o.tone === 'danger') ?? inquiry.options[inquiry.options.length - 1]!)
        : inquiry.options[0]!;
    const option = inquiry.options.find((o) => o.id === optionId) ?? fallback;
    this.inquiries.delete(hookRequestId);

    const card = this.cards.get(inquiry.taskId);
    const agent = this.agents.get(inquiry.unitId);
    this.emit({
      type: 'hook.resolved',
      hookRequestId,
      resolvedBy: 'operator',
      decision: option.tone === 'danger' && inquiry.inquiryKind === 'tool-approval' ? 'deny' : 'allow',
    });
    if (!card || !card.run) return true;

    // Journal: the breakpoint effect resolves with the chosen option.
    this.resolveEffect(card.run, inquiry.effectId, 'EFFECT_RESOLVED', {
      optionId: option.id,
      caption: option.caption,
      ...(reason !== undefined ? { reason } : {}),
    });
    this.emitSimEvent(card, {
      type: 'inquiry_resolved',
      runId: card.run.runId,
      agent: agent?.agent ?? 'commander',
      timestamp: this.now(),
      taskId: card.taskId,
      hookRequestId,
      inquiryKind: inquiry.inquiryKind,
      optionId: option.id,
      caption: option.caption,
      question: inquiry.question,
    });

    // Visible deterministic branch: the chosen option renames the path ahead
    // and queues distinct follow-up events (different per option).
    if (inquiry.inquiryKind !== 'tool-approval') {
      const next = card.run.phaseIndex + 1;
      if (next < card.run.phases.length) {
        card.run.phases[next] = `${card.run.phases[next]!} via ${option.id}`;
      } else {
        card.run.phases.push(`settle ${option.id}`);
      }
      card.pendingFollowUps.push(
        { text: `[${option.id}] ${option.caption} path engaged — ${option.detail ?? 'committing to the branch'}`, optionId: option.id },
        { text: `[${option.id}] replanning remaining phases for the ${option.caption} route`, optionId: option.id },
      );
    } else if (option.id === 'proceed') {
      card.pendingFollowUps.push({ text: `[proceed] gated tool call released — \`git push\` executing`, optionId: option.id });
    } else {
      card.pendingFollowUps.push({ text: `[stand-down] gated tool call denied — agent rethinking`, optionId: option.id });
    }

    if (agent) {
      agent.pendingHookId = null;
      agent.state = 'thinking';
      agent.stateTicks = 0;
      agent.stateDuration = this.rng.int(2, 5);
      agent.updatedAt = this.now();
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // v1 compat operator verbs (kept type-compatible for the existing store)
  // -------------------------------------------------------------------------

  /** V3: agents are lifecycle-owned and never idle — retiring is refused. */
  retireUnit(unitId: string): boolean {
    this.emit({
      type: 'error',
      code: 'unit_busy',
      message: `Unit ${unitId} is lifecycle-owned under V3 — agents despawn with their card`,
    });
    return false;
  }

  /** Hold an active agent: its card's work freezes until resumed. */
  pauseUnit(unitId: string): boolean {
    const agent = this.agents.get(unitId);
    if (!agent || agent.held || agent.state === 'awaiting_input') return false;
    agent.held = true;
    agent.updatedAt = this.now();
    this.emitAgentEvent(agent, { type: 'paused', runId: this.runIdOf(agent), agent: agent.agent, timestamp: this.now() });
    return true;
  }

  /** Release an operator hold; the agent continues exactly where it froze. */
  resumeUnit(unitId: string): boolean {
    const agent = this.agents.get(unitId);
    if (!agent || !agent.held) return false;
    agent.held = false;
    agent.updatedAt = this.now();
    this.emitAgentEvent(agent, { type: 'resumed', runId: this.runIdOf(agent), agent: agent.agent, timestamp: this.now() });
    return true;
  }

  /** Bump a backlog card to the top of the lane. */
  prioritizeTask(taskId: string): boolean {
    const card = this.cards.get(taskId);
    if (!card) {
      this.emit({ type: 'error', code: 'task_not_found', message: `Unknown task: ${taskId}` });
      return false;
    }
    if (card.column !== 'backlog') return false;
    card.order = Math.min(0, ...[...this.cards.values()].map((c) => c.order)) - 1;
    this.emitSimEvent(card, {
      type: 'task_prioritized',
      runId: card.run?.runId ?? 'run-none',
      agent: 'commander',
      timestamp: this.now(),
      taskId,
    });
    return true;
  }

  // -------------------------------------------------------------------------
  // Read surface
  // -------------------------------------------------------------------------

  listAgents(): AgentSummary[] {
    return ADAPTERS.map((agent: AdapterName) => ({
      agent,
      displayName: agent,
      adapterType: 'subprocess',
      structuredSessionTransport: 'persistent',
      sessionControlPlane: 'self-managed',
      supportsInteractiveMode: true,
      canResume: true,
      supportsImageInput: agent !== 'pi',
      supportsFileAttachments: true,
      approvalModes: ['yolo', 'prompt', 'deny'],
    }));
  }

  listSessions(): SessionEntry[] {
    return [...this.agents.values()].map((agent) => {
      const runId = this.runIdOf(agent);
      const run = this.runs.get(runId);
      return {
        sessionId: agent.unitId,
        agent: agent.agent,
        status: 'active',
        activeRunId: runId,
        latestRunId: runId,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        latestRunStartedAt: run ? run.entry.startedAt : null,
        latestRunEndedAt: run ? run.entry.endedAt : null,
        title: `${agent.role}:${agent.taskId}`,
        turnCount: agent.turnCount,
        messageCount: agent.messageCount,
        model: agent.model,
        cost: this.costOf(agent),
        cwd: `/ws/${this.workspaceOf(agent.taskId)}`,
        workspaceId: this.workspaceOf(agent.taskId),
        source: 'gateway',
      } satisfies SessionEntry;
    });
  }

  listRuns(): RunEntry[] {
    return [...this.runs.values()].map((record) => ({ ...record.entry }));
  }

  listTasks(): CommanderTask[] {
    return [...this.cards.values()].map(
      (record) => JSON.parse(JSON.stringify(record.resource)) as CommanderTask,
    );
  }

  /** Board view (SPEC-V3): cards with column/stack/agent info. */
  listCardViews(): SimCardView[] {
    return [...this.cards.values()].map((card) => ({
      taskId: card.taskId,
      taskKind: card.taskKind,
      title: card.resource.metadata.labels?.['a5c.ai/title'] ?? card.taskId,
      repository: card.resource.spec.repository,
      workspaceId: card.resource.spec.workspaceRef ?? '',
      column: card.column,
      order: card.order,
      yolo: card.yolo,
      merged: card.merged,
      progress: roundTo(this.progressOf(card), 4),
      parentId: card.parentId,
      childIds: [...card.childIds],
      agentIds: [...this.agents.values()].filter((a) => a.taskId === card.taskId).map((a) => a.unitId),
      attempt: card.attempt,
      feedback: card.feedback,
      dirtyFileCount: card.ws.dirty ? card.ws.files.length : 0,
      hasPendingInquiry: [...this.inquiries.values()].some((i) => i.taskId === card.taskId),
    }));
  }

  /** Active agents (SPEC-V3 §V3-2: the units counter counts these). */
  listActiveAgentViews(): SimAgentView[] {
    return [...this.agents.values()].map((agent) => ({
      unitId: agent.unitId,
      agent: agent.agent,
      model: agent.model,
      role: agent.role,
      taskId: agent.taskId,
      state: agent.state,
      paused: agent.held,
      runId: this.runIdOf(agent),
      pendingHookId: agent.pendingHookId,
      heldPieces: [...agent.heldPieces],
      tokenUsage: { ...agent.tokenUsage },
      cost: this.costOf(agent),
      turnCount: agent.turnCount,
      messageCount: agent.messageCount,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    }));
  }

  /** Open inquiries (SPEC-V3 §V3-5) for the Inquiry Dock. */
  listInquiries(): SimInquiryView[] {
    return [...this.inquiries.values()].map((inquiry) => ({
      hookRequestId: inquiry.hookRequestId,
      runId: inquiry.runId,
      taskId: inquiry.taskId,
      unitId: inquiry.unitId,
      inquiryKind: inquiry.inquiryKind,
      question: inquiry.question,
      options: inquiry.options.map((o) => ({ ...o })),
      deadlineTs: inquiry.deadlineTs,
    }));
  }

  /** Workspace view for a card (SPEC-V2 §V2-7 / SPEC-V3 §V3-4). */
  getWorkspaceView(taskId: string): SimWorkspaceView | null {
    const card = this.cards.get(taskId);
    if (!card) return null;
    return {
      taskId,
      phase: card.ws.phase,
      gitStatus: {
        branch: card.ws.branch,
        headSha: card.ws.headSha,
        ahead: card.ws.ahead,
        behind: card.ws.behind,
        dirty: card.ws.dirty,
        uncommittedCount: card.ws.dirty ? card.ws.files.length : 0,
      },
      files: card.ws.files.map((f) => ({ ...f })),
      testEvidence: { ...card.ws.testEvidence },
      reviewerNotes: [...card.ws.reviewerNotes],
    };
  }

  /** Process-flow observation for a card's run (SPEC-V2 §V2-5). */
  getRunObservation(taskId: string): SimRunObservationView | null {
    const card = this.cards.get(taskId);
    if (!card || !card.run) return null;
    const run = card.run;
    const pendingEffectsByKind: PendingEffectsByKind = {};
    for (const effect of run.openEffects) {
      pendingEffectsByKind[effect.kind] = (pendingEffectsByKind[effect.kind] ?? 0) + 1;
    }
    return {
      runId: run.runId,
      taskId,
      observedState: run.terminal === 'completed'
        ? 'completed'
        : run.terminal === 'failed'
          ? 'failed'
          : deriveObservedRunState(run.journal),
      pendingEffectsByKind,
      phases: run.phases.map((label, index) => ({
        label,
        status: index < run.phaseIndex ? 'done' : index === run.phaseIndex ? 'current' : 'pending',
      })),
      journal: run.journal.map((event) => ({ ...event, data: { ...event.data } })),
    };
  }

  /** Memory silos (SPEC-V2 §V2-3 Archive overlay). */
  listMemorySilos(): SimMemorySiloView[] {
    return this.scenario.memory.silos.map((silo) => ({
      name: silo.repository.metadata.name,
      phase: silo.repository.status.phase,
      currentCommit: silo.repository.status.currentCommit ?? '',
      recordCount: silo.recordIds.length,
      owner: silo.source.spec.appliesTo.teams[0] ?? '',
      recordIds: [...silo.recordIds],
    }));
  }

  /** The unified memory graph (deep copy). */
  listMemoryRecords(): GraphRecord[] {
    return JSON.parse(JSON.stringify(this.scenario.memory.records)) as GraphRecord[];
  }

  // --- v1 compatibility views ------------------------------------------------

  listUnitViews(): SimUnitView[] {
    return [...this.agents.values()].map((agent) => ({
      unitId: agent.unitId,
      agent: agent.agent,
      model: agent.model,
      title: `${agent.role}:${agent.taskId}`,
      workspaceId: this.workspaceOf(agent.taskId),
      state: agent.state === 'awaiting_input' ? 'awaiting_approval' : agent.state,
      paused: agent.held,
      taskId: agent.taskId,
      runId: this.runIdOf(agent),
      turnIndex: agent.turnCount,
      turnCount: agent.turnCount,
      messageCount: agent.messageCount,
      pendingHookId: agent.pendingHookId,
      tokenUsage: { ...agent.tokenUsage },
      cost: this.costOf(agent),
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    }));
  }

  listTaskViews(): SimTaskView[] {
    return [...this.cards.values()].map((card) => ({
      taskId: card.taskId,
      taskKind: card.taskKind,
      repository: card.resource.spec.repository,
      workspaceId: card.resource.spec.workspaceRef ?? '',
      title: card.resource.metadata.labels?.['a5c.ai/title'] ?? card.taskId,
      state: this.compatTaskState(card),
      phase: card.resource.status.phase,
      progress: roundTo(this.progressOf(card), 4),
      assigneeIds: [...this.agents.values()].filter((a) => a.taskId === card.taskId).map((a) => a.unitId),
      priority: -card.order,
    }));
  }

  listPendingHooks(): SimHookView[] {
    return [...this.inquiries.values()].map((inquiry) => ({
      hookRequestId: inquiry.hookRequestId,
      runId: inquiry.runId,
      unitId: inquiry.unitId,
      hookKind: 'inquiry',
      payload: {
        question: inquiry.question,
        options: inquiry.options.map((o) => ({ ...o })),
        inquiryKind: inquiry.inquiryKind,
        taskId: inquiry.taskId,
        unitId: inquiry.unitId,
      },
      deadlineTs: inquiry.deadlineTs,
    }));
  }

  /** Deep, JSON-serializable snapshot — the determinism contract surface. */
  snapshot(): SimSnapshot {
    return {
      seed: this.seed,
      tick: this.tickCount,
      simTimeMs: this.now(),
      rngDraws: this.rng.draws,
      counters: {
        runs: this.runCounter,
        hooks: this.hookCounter,
        tools: this.toolCounter,
        agents: this.agentCounter,
        creations: this.creationCounter,
      },
      cards: this.listCardViews(),
      agents: this.listActiveAgentViews(),
      inquiries: this.listInquiries(),
      workspaces: [...this.cards.keys()]
        .map((id) => this.getWorkspaceView(id))
        .filter((w): w is SimWorkspaceView => w !== null),
      runs: this.listRuns(),
    };
  }

  // -------------------------------------------------------------------------
  // Session command compat (steer/abort of ACTIVE agents)
  // -------------------------------------------------------------------------

  private handleSessionMessage(frame: SessionMessageFrame): void {
    const agent = this.agents.get(frame.sessionId);
    if (!agent) {
      this.emit({ type: 'error', code: 'session_not_found', message: `Unknown session: ${frame.sessionId}` });
      return;
    }
    const prompt = frame.prompt.trim();
    const card = this.cards.get(agent.taskId);
    if (prompt === '/abort' || prompt === '/stop') {
      if (card) this.abortCard(this.topLevelOf(card));
      return;
    }
    // Steer: lands as user input; the agent replans its current phase.
    agent.messageCount += 1;
    if (agent.held) this.resumeUnit(agent.unitId);
    agent.stateDuration = Math.max(agent.stateDuration, agent.stateTicks + this.rng.int(1, 3));
    agent.updatedAt = this.now();
    this.emitAgentEvent(agent, {
      type: 'turn_start',
      runId: this.runIdOf(agent),
      agent: agent.agent,
      timestamp: this.now(),
      turnIndex: agent.turnCount,
    });
  }

  // -------------------------------------------------------------------------
  // Tick engine
  // -------------------------------------------------------------------------

  private stepOnce(): void {
    this.tickCount += 1;
    // Iterate over a stable copy: transitions spawn/despawn agents mid-walk.
    for (const card of [...this.cards.values()]) {
      this.advanceCard(card);
    }
  }

  private advanceCard(card: CardRecord): void {
    // Unanswered inquiries auto-default at the deadline (first option) so the
    // board never deadlocks; the path is fully deterministic.
    for (const inquiry of [...this.inquiries.values()]) {
      if (inquiry.taskId === card.taskId && this.now() >= inquiry.deadlineTs) {
        this.answerInquiry(inquiry.hookRequestId, null, 'allow', 'auto-default at deadline');
      }
    }

    // Children are driven through their own records; only their work ticks
    // run here. Column machinery runs on top-level cards.
    if (card.pendingFollowUps.length > 0 && card.run) {
      const followUp = card.pendingFollowUps.shift()!;
      this.emitSimEvent(card, {
        type: 'inquiry_followup',
        runId: card.run.runId,
        agent: card.workerAdapter ?? 'commander',
        timestamp: this.now(),
        taskId: card.taskId,
        optionId: followUp.optionId,
        text: followUp.text,
      });
    }

    switch (card.column) {
      case 'backlog':
        return;
      case 'do':
        this.advanceWork(card);
        return;
      case 'ai-review':
        if (card.parentId === null) this.advanceAiReview(card);
        return;
      case 'human-review':
        return;
      case 'approved':
        if (card.parentId === null && !card.merged) this.advanceIntegration(card);
        return;
    }
  }

  // --- DO: workers grind phases ----------------------------------------------

  private advanceWork(card: CardRecord): void {
    if (card.parentId === null && card.childIds.length > 0) {
      // Stack parent: aggregate; auto-move when ALL children completed.
      const children = card.childIds.map((id) => this.cards.get(id)!).filter(Boolean);
      if (children.every((c) => c.run !== null && c.run.phaseIndex >= c.run.phases.length)) {
        this.completeWork(card);
      }
      return;
    }
    const run = card.run;
    if (!run || run.phaseIndex >= run.phases.length) return;
    const worker = [...this.agents.values()].find(
      (a) => a.taskId === card.taskId && a.role === 'worker',
    );
    if (!worker || worker.held || worker.state === 'awaiting_input') return;

    this.streamAgentTick(worker);
    run.phaseTicksLeft -= 1;
    if (run.phaseTicksLeft > 0) return;

    // Phase complete.
    const label = run.phases[run.phaseIndex]!;
    const effect = run.openEffects.find((e) => e.kind !== 'breakpoint');
    if (effect) this.resolveEffect(run, effect.effectId, 'EFFECT_RESOLVED', { phase: label });
    this.emitSimEvent(card, {
      type: 'phase_completed',
      runId: run.runId,
      agent: worker.agent,
      timestamp: this.now(),
      taskId: card.taskId,
      phase: label,
    });
    this.addWorkspaceChange(card, run.phaseIndex);
    run.phaseIndex += 1;
    card.progress = run.phaseIndex / run.phases.length;

    if (run.phaseIndex >= run.phases.length) {
      // Work complete on this leaf card.
      card.ws.testEvidence = {
        status: this.rng.chance(0.85) ? 'passed' : 'unknown',
        summary: `vitest: suite green for ${card.taskId}`,
      };
      this.emitMemoryUpdate(card, worker);
      if (card.parentId === null) {
        this.completeWork(card);
      } else {
        // Child done: its worker despawns; the parent aggregates.
        this.despawnAgent(worker.unitId);
      }
      return;
    }

    // Next phase begins.
    this.requestPhaseEffect(card, run);
    this.emitSimEvent(card, {
      type: 'phase_started',
      runId: run.runId,
      agent: worker.agent,
      timestamp: this.now(),
      taskId: card.taskId,
      phase: run.phases[run.phaseIndex]!,
    });

    // Memory query at phase start (SPEC-V2 §V2-3: ACTIVE agents only).
    if (this.rng.chance(0.6)) this.emitMemoryQuery(card, worker);

    // Inquiry roll (SPEC-V3 §V3-5): at most one open inquiry per card, and at
    // most one raised per DO attempt (keeps work durations bounded).
    const hasOpen = [...this.inquiries.values()].some((i) => i.taskId === card.taskId);
    if (!hasOpen && card.inquiriesThisAttempt < 1 && this.rng.chance(0.45)) {
      card.inquiriesThisAttempt += 1;
      this.raiseInquiry(card, worker);
    }
  }

  /** Work complete → auto-move to AI REVIEW (SPEC-V3 §V3-2). */
  private completeWork(card: CardRecord): void {
    this.transitionCard(card, 'ai-review', 'work-complete');
  }

  // --- AI REVIEW ---------------------------------------------------------------

  private advanceAiReview(card: CardRecord): void {
    const reviewers = [...this.agents.values()].filter(
      (a) => a.taskId === card.taskId && a.role === 'reviewer',
    );
    for (const reviewer of reviewers) {
      if (!reviewer.held) this.streamAgentTick(reviewer);
    }
    card.reviewTicksLeft -= 1;

    // A reviewer note lands midway.
    if (card.reviewTicksLeft === 4 && reviewers[0]) {
      const file = card.ws.files[0]?.path ?? 'src/index.ts';
      const note = this.rng.pick(REVIEW_NOTE_TEMPLATES)(file);
      card.ws.reviewerNotes.push(note);
      this.emitSimEvent(card, {
        type: 'review_note',
        runId: card.run?.runId ?? 'run-none',
        agent: reviewers[0].agent,
        timestamp: this.now(),
        taskId: card.taskId,
        note,
      });
    }
    if (card.reviewTicksLeft > 0) return;

    // Verdict — deterministic per seed; rejects converge after 2 attempts.
    const pass = card.attempt >= 2 || this.rng.chance(0.6);
    const verdictAgent = reviewers[0]?.agent ?? 'codex';
    if (card.run) {
      const open = card.run.openEffects.find((e) => e.kind === 'agent');
      if (open) {
        this.resolveEffect(card.run, open.effectId, 'EFFECT_RESOLVED', {
          verdict: pass ? 'pass' : 'reject',
        });
      }
    }
    this.emitSimEvent(card, {
      type: 'review_verdict',
      runId: card.run?.runId ?? 'run-none',
      agent: verdictAgent,
      timestamp: this.now(),
      taskId: card.taskId,
      verdict: pass ? 'pass' : 'reject',
    });
    if (pass) {
      if (card.yolo) {
        this.transitionCard(card, 'approved', 'review-pass-yolo');
      } else {
        this.transitionCard(card, 'human-review', 'review-pass');
      }
    } else {
      const feedback = this.rng.pick(REJECT_FEEDBACK);
      card.feedback = feedback;
      this.emitSimEvent(card, {
        type: 'review_feedback',
        runId: card.run?.runId ?? 'run-none',
        agent: verdictAgent,
        timestamp: this.now(),
        taskId: card.taskId,
        feedback,
      });
      this.transitionCard(card, 'do', 'review-rejected');
    }
  }

  // --- APPROVED: integration ---------------------------------------------------

  private advanceIntegration(card: CardRecord): void {
    const integrator = [...this.agents.values()].find(
      (a) => a.taskId === card.taskId && a.role === 'integration',
    );
    if (!integrator || integrator.held) return;
    this.streamAgentTick(integrator);
    card.integrationTicksLeft -= 1;
    if (card.integrationTicksLeft > 0) return;

    const step = card.integrationSteps[card.integrationIndex]!;
    this.emitSimEvent(card, {
      type: 'integration_step',
      runId: card.run?.runId ?? 'run-none',
      agent: integrator.agent,
      timestamp: this.now(),
      taskId: card.taskId,
      step,
    });
    card.integrationIndex += 1;
    if (card.integrationIndex < card.integrationSteps.length) {
      card.integrationTicksLeft = this.rng.int(3, 6);
      return;
    }

    // Merged terminal state: patch applied, run completed, agent despawns.
    card.merged = true;
    card.progress = 1;
    card.ws.dirty = false;
    card.ws.ahead = 0;
    card.ws.phase = 'archived';
    card.resource.status.phase = 'Ready';
    for (const child of card.childIds) {
      const c = this.cards.get(child);
      if (c) {
        c.merged = true;
        c.ws.dirty = false;
        c.resource.status.phase = 'Ready';
        if (c.run && c.run.terminal === null) this.terminateRun(c, c.run, 'RUN_COMPLETED');
      }
    }
    if (card.run && card.run.terminal === null) this.terminateRun(card, card.run, 'RUN_COMPLETED');
    this.emitSimEvent(card, {
      type: 'card_merged',
      runId: card.run?.runId ?? 'run-none',
      agent: integrator.agent,
      timestamp: this.now(),
      taskId: card.taskId,
    });
    this.despawnAgent(integrator.unitId);
  }

  // -------------------------------------------------------------------------
  // Column transitions (the state machine core)
  // -------------------------------------------------------------------------

  private transitionCard(card: CardRecord, to: ColumnId, reason: CardMovedEventPayload['reason']): void {
    const from = card.column;
    if (from === to) return;

    // Agents despawn whenever their card leaves their column (SPEC-V3 §V3-2).
    this.despawnAgentsOf(card);
    this.cancelInquiriesOf(card);

    card.column = to;
    for (const childId of card.childIds) {
      const child = this.cards.get(childId);
      if (child) {
        child.column = to;
        this.despawnAgentsOf(child);
        this.cancelInquiriesOf(child);
      }
    }

    this.emitSimMove(card, from, to, reason);

    switch (to) {
      case 'do':
        this.enterDo(card);
        break;
      case 'ai-review':
        this.enterAiReview(card);
        break;
      case 'human-review':
        card.resource.status.phase = 'Pending';
        break;
      case 'approved':
        this.enterApproved(card);
        break;
      case 'backlog':
        break;
    }
  }

  private enterDo(card: CardRecord): void {
    card.attempt += 1;
    card.inquiriesThisAttempt = 0;
    const leaves = card.childIds.length > 0 ? card.childIds.map((id) => this.cards.get(id)!) : [card];
    for (const leaf of leaves) {
      leaf.attempt = card.attempt;
      leaf.inquiriesThisAttempt = 0;
      this.ensureRun(leaf);
      this.initWorkspace(leaf);
      const adapter = WORKER_ADAPTER_BY_KIND[leaf.taskKind];
      leaf.workerAdapter = adapter;
      this.spawnAgent(adapter, 'worker', leaf.taskId);
      const run = leaf.run!;
      // Rework after a rejection re-opens the pipeline.
      if (run.phaseIndex >= run.phases.length) {
        run.phases.push(`rework ${card.attempt}`);
        leaf.progress = run.phaseIndex / run.phases.length;
      }
      this.requestPhaseEffect(leaf, run);
    }
    card.workerAdapter = card.childIds.length > 0
      ? (this.cards.get(card.childIds[0]!)?.workerAdapter ?? null)
      : card.workerAdapter;
  }

  private enterAiReview(card: CardRecord): void {
    // 1–2 reviewer agents of a DIFFERENT adapter than the worker.
    const workerAdapter = card.workerAdapter ?? WORKER_ADAPTER_BY_KIND[card.taskKind];
    const pool = ADAPTERS.filter((a) => a !== workerAdapter);
    const count = this.rng.int(1, 2);
    for (let i = 0; i < count; i += 1) {
      this.spawnAgent(this.rng.pick(pool), 'reviewer', card.taskId);
    }
    card.reviewTicksLeft = this.rng.int(8, 14);
    if (card.run) {
      this.requestEffect(card.run, 'agent', 'ai-review');
    }
  }

  private enterApproved(card: CardRecord): void {
    const integrationAdapter = this.rng.pick(ADAPTERS);
    this.spawnAgent(integrationAdapter, 'integration', card.taskId);
    card.integrationSteps = this.rng.chance(0.4)
      ? ['rebase onto main', 'conflict-fix', 'integration-test', 'merge']
      : ['rebase onto main', 'integration-test', 'merge'];
    card.integrationIndex = 0;
    card.integrationTicksLeft = this.rng.int(3, 6);
    if (card.run) {
      // Close the review effect if still open; open the integration effect.
      const open = card.run.openEffects.find((e) => e.kind === 'agent');
      if (open) this.resolveEffect(card.run, open.effectId, 'EFFECT_RESOLVED', { verdict: 'approved' });
      this.requestEffect(card.run, 'node', 'integration');
    }
  }

  private abortCard(card: CardRecord): void {
    if (card.column === 'backlog' || card.merged) return;
    if (card.run) {
      for (const effect of [...card.run.openEffects]) {
        this.resolveEffect(card.run, effect.effectId, 'EFFECT_CANCELLED', { reason: 'aborted' });
      }
    }
    this.transitionCard(card, 'backlog', 'aborted');
  }

  // -------------------------------------------------------------------------
  // Agents
  // -------------------------------------------------------------------------

  private spawnAgent(adapter: AdapterName, role: AgentRole, taskId: string): AgentRecord {
    this.agentCounter += 1;
    const now = this.now();
    const agent: AgentRecord = {
      unitId: `agt-${String(this.agentCounter).padStart(3, '0')}-${role}`,
      agent: adapter,
      model: MODELS_BY_ADAPTER[adapter][0]!,
      role,
      taskId,
      state: 'thinking',
      held: false,
      stateTicks: 0,
      stateDuration: this.rng.int(2, 5),
      pendingHookId: null,
      activeToolName: null,
      heldPieces: [],
      turnCount: 0,
      messageCount: 1,
      accumulatedText: '',
      accumulatedThinking: '',
      tokenUsage: {
        inputTokens: this.rng.int(400, 1600),
        outputTokens: 0,
        thinkingTokens: 0,
        cachedTokens: 0,
      },
      cost: { totalUsd: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
      createdAt: now,
      updatedAt: now,
    };
    this.agents.set(agent.unitId, agent);
    this.emitAgentEvent(agent, {
      type: 'session_start',
      runId: this.runIdOf(agent),
      agent: adapter,
      timestamp: now,
      sessionId: agent.unitId,
      resumed: false,
    });
    return agent;
  }

  private despawnAgent(unitId: string): void {
    const agent = this.agents.get(unitId);
    if (!agent) return;
    this.emitAgentEvent(agent, {
      type: 'session_end',
      runId: this.runIdOf(agent),
      agent: agent.agent,
      timestamp: this.now(),
      sessionId: agent.unitId,
      turnCount: agent.turnCount,
      cost: this.costOf(agent),
    });
    this.agents.delete(unitId);
  }

  private despawnAgentsOf(card: CardRecord): void {
    for (const agent of [...this.agents.values()]) {
      if (agent.taskId === card.taskId) this.despawnAgent(agent.unitId);
    }
  }

  private cancelInquiriesOf(card: CardRecord): void {
    for (const inquiry of [...this.inquiries.values()]) {
      if (inquiry.taskId !== card.taskId) continue;
      this.inquiries.delete(inquiry.hookRequestId);
      this.emit({
        type: 'hook.resolved',
        hookRequestId: inquiry.hookRequestId,
        resolvedBy: 'system:card-left-column',
        decision: 'deny',
      });
      if (card.run) {
        this.resolveEffect(card.run, inquiry.effectId, 'EFFECT_CANCELLED', { reason: 'card left column' });
      }
    }
  }

  /** Token burn + transcript streaming for an active agent. */
  private streamAgentTick(agent: AgentRecord): void {
    if (agent.state === 'awaiting_input') return;
    agent.stateTicks += 1;
    const now = this.now();
    if (agent.state === 'tool_running') {
      if (agent.stateTicks >= agent.stateDuration) {
        this.emitAgentEvent(agent, {
          type: 'tool_result',
          runId: this.runIdOf(agent),
          agent: agent.agent,
          timestamp: now,
          toolCallId: `tc-${this.seed}-${String(this.toolCounter).padStart(4, '0')}`,
          toolName: agent.activeToolName ?? 'Bash',
          output: { ok: true, summary: `${agent.activeToolName ?? 'Bash'} finished cleanly` },
          durationMs: agent.stateDuration * TICK_MS,
        });
        agent.tokenUsage.inputTokens += this.rng.int(60, 400);
        agent.activeToolName = null;
        agent.state = 'thinking';
        agent.stateTicks = 0;
        agent.stateDuration = this.rng.int(2, 6);
      }
      this.accrueCost(agent);
      agent.updatedAt = now;
      return;
    }
    // thinking
    if (this.rng.chance(0.5)) {
      const delta = this.rng.pick(THINKING_PHRASES);
      agent.accumulatedThinking += delta;
      agent.tokenUsage.thinkingTokens += this.rng.int(6, 28);
      this.emitAgentEvent(agent, {
        type: 'thinking_delta',
        runId: this.runIdOf(agent),
        agent: agent.agent,
        timestamp: now,
        delta,
        accumulated: agent.accumulatedThinking,
      });
    } else {
      const delta = this.rng.pick(TEXT_PHRASES);
      agent.accumulatedText += delta;
      agent.tokenUsage.outputTokens += this.rng.int(8, 40);
      this.emitAgentEvent(agent, {
        type: 'text_delta',
        runId: this.runIdOf(agent),
        agent: agent.agent,
        timestamp: now,
        delta,
        accumulated: agent.accumulatedText,
      });
    }
    if (agent.stateTicks >= agent.stateDuration) {
      if (this.rng.chance(0.5)) {
        // Start a tool call.
        this.toolCounter += 1;
        const toolName = this.rng.pick(TOOL_NAMES);
        agent.activeToolName = toolName;
        agent.state = 'tool_running';
        agent.stateTicks = 0;
        agent.stateDuration = this.rng.int(2, 5);
        this.emitAgentEvent(agent, {
          type: 'tool_call_start',
          runId: this.runIdOf(agent),
          agent: agent.agent,
          timestamp: now,
          toolCallId: `tc-${this.seed}-${String(this.toolCounter).padStart(4, '0')}`,
          toolName,
          inputAccumulated: JSON.stringify({ description: `${toolName} sweep over the card` }),
        });
      } else {
        this.emitAgentEvent(agent, {
          type: 'turn_end',
          runId: this.runIdOf(agent),
          agent: agent.agent,
          timestamp: now,
          turnIndex: agent.turnCount,
          cost: this.costOf(agent),
        });
        agent.turnCount += 1;
        agent.messageCount += 2;
        agent.stateTicks = 0;
        agent.stateDuration = this.rng.int(2, 6);
      }
    }
    if (agent.stateTicks % 4 === 0) {
      this.emitAgentEvent(agent, {
        type: 'token_usage',
        runId: this.runIdOf(agent),
        agent: agent.agent,
        timestamp: now,
        inputTokens: agent.tokenUsage.inputTokens,
        outputTokens: agent.tokenUsage.outputTokens,
        thinkingTokens: agent.tokenUsage.thinkingTokens,
      });
    }
    this.accrueCost(agent);
    agent.updatedAt = now;
  }

  // -------------------------------------------------------------------------
  // Inquiries (SPEC-V3 §V3-5)
  // -------------------------------------------------------------------------

  private raiseInquiry(card: CardRecord, agent: AgentRecord): void {
    this.hookCounter += 1;
    const template = INQUIRY_TEMPLATES[(this.hookCounter - 1) % INQUIRY_TEMPLATES.length]!;
    const hookRequestId = `hook-${this.seed}-${String(this.hookCounter).padStart(4, '0')}`;
    const title = card.resource.metadata.labels?.['a5c.ai/title'] ?? card.taskId;
    const run = card.run!;
    const effectId = this.requestEffect(run, 'breakpoint', `inquiry:${template.inquiryKind}`);
    const inquiry: InquiryRecord = {
      hookRequestId,
      runId: run.runId,
      taskId: card.taskId,
      unitId: agent.unitId,
      inquiryKind: template.inquiryKind,
      question: template.question(title),
      options: template.options.map((o) => ({ ...o })),
      deadlineTs: this.now() + HOOK_DEADLINE_MS,
      effectId,
    };
    this.inquiries.set(hookRequestId, inquiry);
    agent.state = 'awaiting_input';
    agent.pendingHookId = hookRequestId;
    agent.stateTicks = 0;
    agent.updatedAt = this.now();

    const payload: SimInquiryPayload & Record<string, unknown> = {
      question: inquiry.question,
      options: inquiry.options.map((o) => ({ ...o })),
      inquiryKind: inquiry.inquiryKind,
      taskId: card.taskId,
      unitId: agent.unitId,
    };
    const frame: HookRequestFrame = {
      type: 'hook.request',
      hookRequestId,
      runId: run.runId,
      hookKind: 'inquiry',
      payload,
      deadlineTs: inquiry.deadlineTs,
    };
    this.emit(frame);
  }

  // -------------------------------------------------------------------------
  // Memory (SPEC-V2 §V2-3, column-model adapted)
  // -------------------------------------------------------------------------

  private siloFor(card: CardRecord): { name: string; recordIds: string[] } {
    const silos = this.scenario.memory.silos;
    const index = hashString(card.resource.spec.workspaceRef ?? card.taskId) % silos.length;
    const silo = silos[index]!;
    return { name: silo.repository.metadata.name, recordIds: silo.recordIds };
  }

  private emitMemoryQuery(card: CardRecord, agent: AgentRecord): void {
    const silo = this.siloFor(card);
    if (silo.recordIds.length === 0) return;
    const count = this.rng.int(1, 3);
    const matched: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const id = silo.recordIds[this.rng.int(0, silo.recordIds.length - 1)]!;
      if (!matched.includes(id)) matched.push(id);
      if (!agent.heldPieces.includes(id)) agent.heldPieces.push(id);
    }
    this.emitSimEvent(card, {
      type: 'memory_query',
      runId: card.run?.runId ?? 'run-none',
      agent: agent.agent,
      timestamp: this.now(),
      taskId: card.taskId,
      unitId: agent.unitId,
      silo: silo.name,
      matchedIds: matched,
      totalMatches: matched.length,
      queryText: `${card.taskKind} practice for ${card.resource.spec.repository}`,
    });
  }

  private emitMemoryUpdate(card: CardRecord, agent: AgentRecord): void {
    const silo = this.siloFor(card);
    this.emitSimEvent(card, {
      type: 'memory_update',
      runId: card.run?.runId ?? 'run-none',
      agent: agent.agent,
      timestamp: this.now(),
      taskId: card.taskId,
      unitId: agent.unitId,
      silo: silo.name,
      updateKind: 'proposed-pr',
      branchName: `memory/${card.taskId}`,
      changes: card.ws.files.slice(0, 2).map((f) => ({
        path: `notes/${card.taskId}.md`,
        action: 'add',
        reason: `Lessons from ${f.path}`,
      })),
    });
  }

  // -------------------------------------------------------------------------
  // Per-card babysitter run + journal (SPEC-V2 §V2-5)
  // -------------------------------------------------------------------------

  private ensureRun(card: CardRecord): void {
    if (card.run && card.run.terminal === null) return;
    this.runCounter += 1;
    const runId = `run-${this.seed}-${String(this.runCounter).padStart(4, '0')}`;
    const now = this.now();
    const run: CardRunRecord = {
      runId,
      entry: {
        runId,
        agent: WORKER_ADAPTER_BY_KIND[card.taskKind],
        model: MODELS_BY_ADAPTER[WORKER_ADAPTER_BY_KIND[card.taskKind]][0]!,
        cwd: `/ws/${card.resource.spec.workspaceRef ?? ''}`,
        status: 'running',
        createdAt: now,
        startedAt: now,
        endedAt: null,
        sessionId: card.taskId,
        owner: { tokenId: 'mock-token', name: 'commander', remoteAddress: null },
        workspaceId: card.resource.spec.workspaceRef ?? '',
      },
      seq: 0,
      journal: [],
      journalSeq: 0,
      phases: [...PHASES_BY_KIND[card.taskKind]],
      phaseIndex: 0,
      phaseTicksLeft: 0,
      openEffects: [],
      effectCounter: 0,
      terminal: null,
    };
    this.runs.set(runId, run);
    card.run = run;
    this.appendJournal(run, 'RUN_CREATED', { processId: `commander/${card.taskKind}`, taskId: card.taskId });
  }

  private requestPhaseEffect(_card: CardRecord, run: CardRunRecord): void {
    run.phaseTicksLeft = this.rng.int(6, 12);
    this.requestEffect(run, 'node', run.phases[run.phaseIndex] ?? 'work');
  }

  private requestEffect(run: CardRunRecord, kind: EffectKind, label: string): string {
    run.effectCounter += 1;
    const effectId = `S${String(run.effectCounter).padStart(6, '0')}`;
    run.openEffects.push({ effectId, kind, label });
    this.appendJournal(run, 'EFFECT_REQUESTED', { effectId, kind, label });
    return effectId;
  }

  private resolveEffect(
    run: CardRunRecord,
    effectId: string,
    type: Extract<JournalEventType, 'EFFECT_RESOLVED' | 'EFFECT_CANCELLED'>,
    data: Record<string, unknown>,
  ): void {
    const index = run.openEffects.findIndex((e) => e.effectId === effectId);
    if (index === -1) return;
    const [effect] = run.openEffects.splice(index, 1);
    this.appendJournal(run, type, { effectId, kind: effect!.kind, label: effect!.label, ...data });
  }

  private terminateRun(
    card: CardRecord,
    run: CardRunRecord,
    type: Extract<JournalEventType, 'RUN_COMPLETED' | 'RUN_FAILED' | 'RUN_HALTED'>,
  ): void {
    for (const effect of [...run.openEffects]) {
      this.resolveEffect(run, effect.effectId, 'EFFECT_RESOLVED', { reason: 'terminal' });
    }
    this.appendJournal(run, type, { taskId: card.taskId });
    run.terminal = type === 'RUN_COMPLETED' ? 'completed' : 'failed';
    run.entry.status = type === 'RUN_COMPLETED' ? 'completed' : 'failed';
    run.entry.endedAt = this.now();
    run.entry.exitReason = type === 'RUN_COMPLETED' ? 'completed' : 'crashed';
  }

  private appendJournal(run: CardRunRecord, type: JournalEventType, data: Record<string, unknown>): void {
    run.journalSeq += 1;
    this.ulidCounter += 1;
    const event: JournalEvent = {
      seq: run.journalSeq,
      ulid: this.deterministicUlid(),
      type,
      recordedAt: this.now(),
      data,
    };
    run.journal.push(event);
    if (run.journal.length > JOURNAL_CAP) run.journal.splice(0, run.journal.length - JOURNAL_CAP);
  }

  // -------------------------------------------------------------------------
  // Workspace (SPEC-V2 §V2-7)
  // -------------------------------------------------------------------------

  private initWorkspace(card: CardRecord): void {
    if (card.ws.phase === 'ready' && card.ws.files.length > 0) {
      // Rework iteration: the diff iterates rather than resets.
      card.ws.dirty = true;
      return;
    }
    card.ws = {
      phase: 'ready',
      branch: `agent/${card.taskId}`,
      headSha: this.deterministicSha(`${card.taskId}:head:${card.attempt}`),
      ahead: 0,
      behind: this.rng.int(0, 2),
      dirty: false,
      files: [],
      testEvidence: { status: 'unknown' },
      reviewerNotes: [],
    };
  }

  private addWorkspaceChange(card: CardRecord, phaseIndex: number): void {
    const pool = FILE_POOLS[card.taskKind];
    const path = pool[(phaseIndex + card.attempt - 1) % pool.length]!;
    const title = card.resource.metadata.labels?.['a5c.ai/title'] ?? card.taskId;
    const existing = card.ws.files.find((f) => f.path === path);
    const status: 'A' | 'M' | 'D' = existing ? 'M' : phaseIndex === 0 ? 'M' : this.rng.chance(0.2) ? 'D' : 'A';
    const bodyLines = this.rng.int(2, 9);
    const additions = status === 'D' ? 0 : this.rng.int(1, bodyLines);
    const deletions = status === 'A' ? this.rng.int(0, 1) : this.rng.int(1, bodyLines);
    const lines: string[] = [`@@ -${this.rng.int(1, 40)},${deletions + 2} +${this.rng.int(1, 40)},${additions + 2} @@`];
    lines.push(` // context: ${title}`);
    for (let i = 0; i < deletions; i += 1) lines.push(`-  const legacy${i} = previousMechanism('${title}');`);
    for (let i = 0; i < additions; i += 1) lines.push(`+  const forged${i} = rebuildMechanism('${title}', ${i});`);
    lines.push(` // end: ${path}`);
    const diff = lines.slice(0, 25).join('\n');
    if (existing) {
      existing.status = 'M';
      existing.additions += additions;
      existing.deletions += deletions;
      existing.diff = diff;
    } else {
      card.ws.files.push({ path, status, additions: Math.max(additions, 1), deletions: Math.max(deletions, status === 'A' ? 0 : 1), diff });
    }
    card.ws.dirty = true;
    card.ws.ahead += 1;
    this.emitSimEvent(card, {
      type: 'workspace_change',
      runId: card.run?.runId ?? 'run-none',
      agent: card.workerAdapter ?? 'commander',
      timestamp: this.now(),
      taskId: card.taskId,
      path,
      status,
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private addCard(resource: CommanderTask, taskKind: TaskKind, parentId: string | null): CardRecord {
    this.orderCounter += 1;
    const card: CardRecord = {
      taskId: resource.metadata.name,
      resource,
      taskKind,
      parentId,
      childIds: [],
      column: 'backlog',
      order: this.orderCounter,
      yolo: false,
      merged: false,
      progress: 0,
      attempt: 0,
      feedback: null,
      run: null,
      ws: {
        phase: 'created',
        branch: '',
        headSha: '',
        ahead: 0,
        behind: 0,
        dirty: false,
        files: [],
        testEvidence: { status: 'unknown' },
        reviewerNotes: [],
      },
      reviewTicksLeft: 0,
      integrationSteps: [],
      integrationIndex: 0,
      integrationTicksLeft: 0,
      pendingFollowUps: [],
      inquiriesThisAttempt: 0,
      workerAdapter: null,
    };
    this.cards.set(card.taskId, card);
    if (parentId !== null) {
      const parent = this.cards.get(parentId);
      if (parent && !parent.childIds.includes(card.taskId)) parent.childIds.push(card.taskId);
    }
    return card;
  }

  private topLevelOf(card: CardRecord): CardRecord {
    return card.parentId !== null ? (this.cards.get(card.parentId) ?? card) : card;
  }

  private progressOf(card: CardRecord): number {
    if (card.merged) return 1;
    if (card.childIds.length > 0) {
      const children = card.childIds
        .map((id) => this.cards.get(id))
        .filter((c): c is CardRecord => c !== undefined);
      if (children.length === 0) return card.progress;
      return children.reduce((sum, c) => sum + this.progressOf(c), 0) / children.length;
    }
    return card.progress;
  }

  private compatTaskState(card: CardRecord): SimTaskState {
    if (card.merged) return 'done';
    switch (card.column) {
      case 'backlog':
        return 'queued';
      case 'do':
        return card.progress > 0 ? 'in_progress' : 'assigned';
      case 'ai-review':
      case 'human-review':
      case 'approved':
        return 'review';
    }
  }

  private workspaceOf(taskId: string): string {
    return this.cards.get(taskId)?.resource.spec.workspaceRef ?? '';
  }

  private runIdOf(agent: AgentRecord): string {
    return this.cards.get(agent.taskId)?.run?.runId ?? 'run-none';
  }

  private accrueCost(agent: AgentRecord): void {
    const pricing = PRICING[agent.agent] ?? { input: 2e-6, output: 8e-6 };
    const usage = agent.tokenUsage;
    agent.cost = {
      totalUsd: roundTo(
        usage.inputTokens * pricing.input +
          (usage.outputTokens + usage.thinkingTokens) * pricing.output,
        6,
      ),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      thinkingTokens: usage.thinkingTokens,
    };
  }

  private costOf(agent: AgentRecord): CostRecord {
    this.accrueCost(agent);
    return { ...agent.cost };
  }

  private deterministicSha(key: string): string {
    const hex = '0123456789abcdef';
    let h = hashString(`${this.seed}:${key}`);
    let out = '';
    for (let i = 0; i < 12; i += 1) {
      out += hex[h & 0xf];
      h = (Math.imul(h, 0x01000193) ^ (h >>> 7)) >>> 0;
    }
    return out;
  }

  /** Sortable pseudo-ULID derived from the sim clock + a global counter. */
  private deterministicUlid(): string {
    const time = this.now().toString(32).toUpperCase().padStart(10, '0');
    const tail = hashString(`${this.seed}:ulid:${this.ulidCounter}`)
      .toString(32)
      .toUpperCase()
      .padStart(8, '0');
    return `${time}${String(this.ulidCounter % 1024).padStart(4, '0')}${tail}`.slice(0, 26);
  }

  private emit(frame: ServerFrame): void {
    for (const listener of [...this.listeners]) {
      listener(frame);
    }
  }

  private emitSimMove(
    card: CardRecord,
    from: ColumnId,
    to: ColumnId,
    reason: CardMovedEventPayload['reason'],
  ): void {
    const payload: CardMovedEventPayload = {
      type: 'card_moved',
      runId: card.run?.runId ?? 'run-none',
      agent: card.workerAdapter ?? 'commander',
      timestamp: this.now(),
      taskId: card.taskId,
      from,
      to,
      reason,
    };
    this.emitEnveloped(payload.runId, payload.agent, { ...payload });
  }

  private emitSimEvent(_card: CardRecord, payload: SimLocalEventPayload): void {
    this.emitEnveloped(payload.runId, payload.agent, { ...payload });
  }

  private emitAgentEvent(agent: AgentRecord, event: AgentEvent): void {
    this.emitEnveloped(event.runId !== '' ? event.runId : this.runIdOf(agent), agent.agent, {
      ...event,
      sessionId: agent.unitId,
    });
  }

  private emitEnveloped(runId: string, source: string, event: Record<string, unknown>): void {
    const run = this.runs.get(runId);
    const seq = run ? (run.seq += 1) : 0;
    this.emit({ type: 'run.event', runId, seq, source, event: { ...event } });
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Extract a `task:<taskId>` reference from a steer prompt (v1 compat). */
export function parseTaskRef(prompt: string): string | null {
  const match = /task:([A-Za-z0-9_-]+)/.exec(prompt);
  return match ? (match[1] ?? null) : null;
}
