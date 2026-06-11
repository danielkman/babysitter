/**
 * Tick-driven deterministic simulation (SPEC §7).
 *
 * - 250ms ticks; pausable and single-steppable (`pause()/resume()/tick(n)`).
 * - Same seed + same command sequence => identical state (unit-tested via
 *   `snapshot()` deep-equality).
 * - Unit lifecycle (SPEC §3): idle -> dispatching -> thinking -> tool_running
 *   -> (awaiting_approval | blocked) -> completed | failed.
 * - Emits mirrored gateway `ServerFrame`s: `run.event` frames whose payloads
 *   are mirrored adapter events (session_start, turn_start, text_delta,
 *   tool_call_start, tool_result, turn_end, session_end, error, ...),
 *   occasional `hook.request` approval scenarios, and task progress /
 *   completion (sim-local payloads riding the open `run.event` envelope).
 * - Commands arrive as mirrored `ClientFrame`s via `handleClientFrame()` and
 *   VISIBLY affect the sim (dispatch / steer / hook decisions / abort).
 *
 * Determinism rules: no Date.now(), no Math.random() — the sim clock is
 * `epochMs + tick * TICK_MS` and all randomness flows through one seeded Prng.
 *
 * Mock-local command conventions (documented for the UI phase):
 * - Dispatch-to-task: `session.start` with `sessionId` of an idle unit and a
 *   prompt containing `task:<taskId>` (e.g. "Capture objective task:adr-01-…").
 *   `session.start` WITHOUT `sessionId` clones a new unit for `agent`.
 * - Stop intent: `session.message` whose prompt is `/abort` or `/stop`
 *   (protocol v1 has no WS abort frame; the real gateway aborts via REST).
 * - Steer: any other `session.message` prompt; resumes a blocked unit,
 *   starts a run on an idle unit.
 */

import type {
  AgentEvent,
  ApprovalRequestEvent,
  CostRecord,
} from '../../contracts/adapter-events';
import type {
  AgentSummary,
  ClientFrame,
  HookRequestFrame,
  RunEntry,
  ServerFrame,
  SessionEntry,
  SessionMessageFrame,
  SessionStartFrame,
} from '../../contracts/gateway-protocol';
import type { CommanderTask, KradlePhase } from '../../contracts/kradle-resources';
import { Prng } from './prng';
import type { AdapterName, Scenario } from './scenario';
import { ADAPTERS, MODELS_BY_ADAPTER, generateScenario } from './scenario';

// ---------------------------------------------------------------------------
// Sim-local domain types (NOT contracts — UI/game-layer vocabulary)
// ---------------------------------------------------------------------------

export const TICK_MS = 250;

/** Unit visual/lifecycle states (SPEC §3). */
export type UnitLifecycleState =
  | 'idle'
  | 'dispatching'
  | 'thinking'
  | 'tool_running'
  | 'awaiting_approval'
  | 'blocked'
  | 'completed'
  | 'failed';

/** Task states (SPEC §3): queued -> assigned -> in_progress -> review -> done | failed. */
export type SimTaskState = 'queued' | 'assigned' | 'in_progress' | 'review' | 'done' | 'failed';

/**
 * Sim-local task lifecycle payload carried inside `run.event` frames (the
 * envelope's `event` field is an open `Record<string, unknown>` in the real
 * protocol, so this does not alter any mirrored contract). Mimics BaseEvent
 * fields so the UI can route it uniformly with adapter events.
 */
export interface TaskLifecycleEventPayload {
  type: 'task_assigned' | 'task_progress' | 'task_completed' | 'task_failed';
  runId: string;
  agent: string;
  timestamp: number;
  taskId: string;
  taskState: SimTaskState;
  progress: number;
  unitId: string;
}

export interface SimUnitView {
  unitId: string;
  agent: string;
  model: string;
  title: string;
  workspaceId: string;
  state: UnitLifecycleState;
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
  counters: { runs: number; hooks: number; tools: number; units: number };
  units: SimUnitView[];
  tasks: SimTaskView[];
  runs: RunEntry[];
  pendingHooks: SimHookView[];
}

// ---------------------------------------------------------------------------
// Internal records
// ---------------------------------------------------------------------------

interface UnitRecord {
  unitId: string;
  agent: string;
  model: string;
  title: string;
  workspaceId: string;
  state: UnitLifecycleState;
  taskId: string | null;
  runId: string | null;
  latestRunId: string | null;
  turnIndex: number;
  plannedTurns: number;
  stateTicks: number;
  stateDuration: number;
  pendingHookId: string | null;
  activeToolCallId: string | null;
  activeToolName: string | null;
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

interface RunRecord {
  entry: RunEntry;
  seq: number;
}

interface TaskRecord {
  resource: CommanderTask;
  state: SimTaskState;
  progress: number;
  assigneeIds: string[];
  reviewTicks: number;
  lastRunId: string;
  lastAgent: string;
  lastUnitId: string;
}

interface HookRecord {
  hookRequestId: string;
  runId: string;
  unitId: string;
  hookKind: string;
  payload: Record<string, unknown>;
  deadlineTs: number;
  gatedToolName: string;
}

const APPROVAL_SCENARIOS: ReadonlyArray<{
  action: string;
  detail: string;
  toolName: string;
  riskLevel: 'low' | 'medium' | 'high';
}> = [
  {
    action: 'run `git push`',
    detail: 'wants to run `git push origin main` (3 commits ahead)',
    toolName: 'Bash',
    riskLevel: 'high',
  },
  {
    action: 'edit 14 files',
    detail: 'wants to edit 14 files across src/ in a single sweep',
    toolName: 'Edit',
    riskLevel: 'medium',
  },
  {
    action: 'run `npm publish`',
    detail: 'wants to run `npm publish --access public`',
    toolName: 'Bash',
    riskLevel: 'high',
  },
  {
    action: 'delete branch',
    detail: 'wants to delete remote branch `release/0.9` permanently',
    toolName: 'Bash',
    riskLevel: 'high',
  },
  {
    action: 'rewrite test suite',
    detail: 'wants to overwrite 6 failing test files with regenerated ones',
    toolName: 'Write',
    riskLevel: 'medium',
  },
  {
    action: 'install dependency',
    detail: 'wants to run `npm install left-pad@latest --save`',
    toolName: 'Bash',
    riskLevel: 'low',
  },
];

const TOOL_NAMES = ['Bash', 'Read', 'Edit', 'Grep', 'WebFetch'] as const;

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

/** Per-adapter token pricing used to accrue mock cost (USD per token). */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-code': { input: 3e-6, output: 15e-6 },
  codex: { input: 2.5e-6, output: 10e-6 },
  'gemini-cli': { input: 1.5e-6, output: 7e-6 },
  pi: { input: 1e-6, output: 5e-6 },
};

const HOOK_DEADLINE_MS = 30_000;
const SERVER_VERSION = 'mock-commander/1.0.0';

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
  private readonly units = new Map<string, UnitRecord>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly hooks = new Map<string, HookRecord>();
  private readonly listeners = new Set<(frame: ServerFrame) => void>();

  private tickCount = 0;
  private pausedFlag = false;
  private interval: ReturnType<typeof setInterval> | null = null;
  private runCounter = 0;
  private hookCounter = 0;
  private toolCounter = 0;
  private unitCounter = 0;

  constructor(options: SimulationOptions) {
    this.seed = options.seed >>> 0;
    this.scenario = options.scenario ?? generateScenario(this.seed);
    this.rng = new Prng(this.seed);

    for (const unit of this.scenario.units) {
      this.unitCounter += 1;
      this.units.set(unit.unitId, {
        unitId: unit.unitId,
        agent: unit.agent,
        model: unit.model,
        title: unit.title,
        workspaceId: unit.workspaceId,
        state: 'idle',
        taskId: null,
        runId: null,
        latestRunId: null,
        turnIndex: 0,
        plannedTurns: 0,
        stateTicks: 0,
        stateDuration: 0,
        pendingHookId: null,
        activeToolCallId: null,
        activeToolName: null,
        turnCount: 0,
        messageCount: 0,
        accumulatedText: '',
        accumulatedThinking: '',
        tokenUsage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0 },
        cost: { totalUsd: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
        createdAt: unit.createdAt,
        updatedAt: this.scenario.epochMs,
      });
    }

    for (const task of this.scenario.tasks) {
      this.tasks.set(task.metadata.name, {
        resource: task,
        state: 'queued',
        progress: 0,
        assigneeIds: [],
        reviewTicks: 0,
        lastRunId: '',
        lastAgent: '',
        lastUnitId: '',
      });
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
        // Broadcast model: subscriptions are no-ops in the mock.
        return;
      case 'session.start':
        this.handleSessionStart(frame);
        return;
      case 'session.message':
        this.handleSessionMessage(frame);
        return;
      case 'hook.decision':
        this.handleHookDecision(frame.hookRequestId, frame.decision, frame.reason);
        return;
    }
  }

  // -------------------------------------------------------------------------
  // Read surface (REST mirrors + UI store feed)
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
    return [...this.units.values()].map((unit) => {
      const latest = unit.latestRunId ? this.runs.get(unit.latestRunId) : undefined;
      return {
        sessionId: unit.unitId,
        agent: unit.agent,
        status: unit.runId !== null ? 'active' : 'inactive',
        activeRunId: unit.runId,
        latestRunId: unit.latestRunId,
        createdAt: unit.createdAt,
        updatedAt: unit.updatedAt,
        latestRunStartedAt: latest ? latest.entry.startedAt : null,
        latestRunEndedAt: latest ? latest.entry.endedAt : null,
        ...(latest?.entry.exitReason !== undefined
          ? { latestExitReason: latest.entry.exitReason }
          : {}),
        title: unit.title,
        turnCount: unit.turnCount,
        messageCount: unit.messageCount,
        model: unit.model,
        cost: this.costOf(unit),
        cwd: `/ws/${unit.workspaceId}`,
        workspaceId: unit.workspaceId,
        source: 'gateway',
      } satisfies SessionEntry;
    });
  }

  listRuns(): RunEntry[] {
    return [...this.runs.values()].map((record) => ({ ...record.entry }));
  }

  listTasks(): CommanderTask[] {
    return [...this.tasks.values()].map(
      (record) => JSON.parse(JSON.stringify(record.resource)) as CommanderTask,
    );
  }

  listUnitViews(): SimUnitView[] {
    return [...this.units.values()].map((unit) => ({
      unitId: unit.unitId,
      agent: unit.agent,
      model: unit.model,
      title: unit.title,
      workspaceId: unit.workspaceId,
      state: unit.state,
      taskId: unit.taskId,
      runId: unit.runId,
      turnIndex: unit.turnIndex,
      turnCount: unit.turnCount,
      messageCount: unit.messageCount,
      pendingHookId: unit.pendingHookId,
      tokenUsage: { ...unit.tokenUsage },
      cost: this.costOf(unit),
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    }));
  }

  listTaskViews(): SimTaskView[] {
    return [...this.tasks.values()].map((record) => ({
      taskId: record.resource.metadata.name,
      taskKind: record.resource.spec.taskKind,
      repository: record.resource.spec.repository,
      workspaceId: record.resource.spec.workspaceRef ?? '',
      title: record.resource.metadata.labels?.['a5c.ai/title'] ?? record.resource.metadata.name,
      state: record.state,
      phase: record.resource.status.phase,
      progress: roundTo(record.progress, 4),
      assigneeIds: [...record.assigneeIds],
    }));
  }

  listPendingHooks(): SimHookView[] {
    return [...this.hooks.values()].map((hook) => ({
      hookRequestId: hook.hookRequestId,
      runId: hook.runId,
      unitId: hook.unitId,
      hookKind: hook.hookKind,
      payload: { ...hook.payload },
      deadlineTs: hook.deadlineTs,
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
        units: this.unitCounter,
      },
      units: this.listUnitViews(),
      tasks: this.listTaskViews(),
      runs: this.listRuns(),
      pendingHooks: this.listPendingHooks(),
    };
  }

  // -------------------------------------------------------------------------
  // Command handling
  // -------------------------------------------------------------------------

  private handleSessionStart(frame: SessionStartFrame): void {
    let unit: UnitRecord | undefined;
    if (frame.sessionId !== undefined) {
      unit = this.units.get(frame.sessionId);
      if (!unit) {
        this.emit({
          type: 'error',
          code: 'session_not_found',
          message: `Unknown session: ${frame.sessionId}`,
        });
        return;
      }
      if (unit.runId !== null) {
        this.emit({
          type: 'error',
          code: 'session_busy',
          message: `Session ${frame.sessionId} already has an active run`,
          runId: unit.runId,
        });
        return;
      }
    } else {
      // Clone: spawn a fresh unit for the requested agent.
      unit = this.spawnUnit(frame.agent, frame.model, frame.workspaceId);
    }

    const taskId = parseTaskRef(frame.prompt);
    let task: TaskRecord | null = null;
    if (taskId !== null) {
      const found = this.tasks.get(taskId);
      if (!found) {
        this.emit({
          type: 'error',
          code: 'task_not_found',
          message: `Unknown task: ${taskId}`,
        });
        return;
      }
      if (found.state === 'done' || found.state === 'failed') {
        this.emit({
          type: 'error',
          code: 'task_closed',
          message: `Task ${taskId} is already ${found.state}`,
        });
        return;
      }
      task = found;
    }

    this.dispatchUnit(unit, task);
  }

  private handleSessionMessage(frame: SessionMessageFrame): void {
    const unit = this.units.get(frame.sessionId);
    if (!unit) {
      this.emit({
        type: 'error',
        code: 'session_not_found',
        message: `Unknown session: ${frame.sessionId}`,
      });
      return;
    }

    const prompt = frame.prompt.trim();
    if (prompt === '/abort' || prompt === '/stop') {
      this.abortUnit(unit);
      return;
    }

    // Steer.
    unit.messageCount += 1;
    unit.updatedAt = this.now();
    if (unit.state === 'blocked') {
      this.resumeUnit(unit);
      return;
    }
    if (unit.state === 'idle') {
      const taskId = parseTaskRef(prompt);
      const task = taskId !== null ? (this.tasks.get(taskId) ?? null) : null;
      this.dispatchUnit(unit, task && task.state !== 'done' && task.state !== 'failed' ? task : null);
      return;
    }
    // Working states: the steer lands as user input; replan the current phase.
    if (unit.state === 'thinking' || unit.state === 'tool_running') {
      unit.stateDuration = Math.max(unit.stateDuration, unit.stateTicks + this.rng.int(1, 3));
    }
  }

  private handleHookDecision(
    hookRequestId: string,
    decision: 'allow' | 'deny',
    reason?: string,
  ): void {
    const hook = this.hooks.get(hookRequestId);
    if (!hook) {
      this.emit({
        type: 'error',
        code: 'hook_not_found',
        message: `Unknown hook request: ${hookRequestId}`,
      });
      return;
    }
    this.resolveHook(hook, decision, 'operator', reason);
  }

  // -------------------------------------------------------------------------
  // Lifecycle engine
  // -------------------------------------------------------------------------

  private stepOnce(): void {
    this.tickCount += 1;
    for (const unit of this.units.values()) {
      this.advanceUnit(unit);
    }
    for (const task of this.tasks.values()) {
      this.advanceTask(task);
    }
  }

  private advanceUnit(unit: UnitRecord): void {
    unit.stateTicks += 1;
    switch (unit.state) {
      case 'idle': {
        const queued = this.queuedTasks();
        if (queued.length > 0 && this.rng.chance(0.015)) {
          this.dispatchUnit(unit, this.rng.pick(queued));
        }
        return;
      }
      case 'dispatching': {
        if (unit.stateTicks >= unit.stateDuration) {
          this.enterThinking(unit, true);
        }
        return;
      }
      case 'thinking': {
        this.streamThinkingTick(unit);
        if (unit.stateTicks >= unit.stateDuration) {
          this.decideAfterThinking(unit);
        }
        return;
      }
      case 'tool_running': {
        if (unit.stateTicks >= unit.stateDuration) {
          this.finishToolCall(unit);
        }
        return;
      }
      case 'awaiting_approval': {
        const hook = unit.pendingHookId ? this.hooks.get(unit.pendingHookId) : undefined;
        if (hook && this.now() >= hook.deadlineTs) {
          this.resolveHook(hook, 'deny', 'system:timeout', 'approval deadline expired');
        }
        return;
      }
      case 'blocked': {
        if (unit.stateTicks >= unit.stateDuration) {
          if (this.rng.chance(0.7)) {
            this.resumeUnit(unit);
          } else {
            this.failRun(unit, 'blocked beyond recovery window');
          }
        }
        return;
      }
      case 'completed': {
        if (unit.stateTicks >= unit.stateDuration) {
          this.toIdle(unit);
        }
        return;
      }
      case 'failed': {
        if (unit.stateTicks >= unit.stateDuration) {
          this.toIdle(unit);
        }
        return;
      }
    }
  }

  private advanceTask(task: TaskRecord): void {
    if (task.state === 'review') {
      task.reviewTicks -= 1;
      if (task.reviewTicks <= 0) {
        task.state = 'done';
        task.progress = 1;
        task.resource.status.phase = 'Ready';
        task.resource.status.conditions = [
          {
            type: 'Ready',
            status: 'True',
            reason: 'DispatchCompleted',
            message: 'All assigned work concluded.',
            lastTransitionTime: new Date(this.now()).toISOString(),
          },
        ];
        this.emitTaskEvent(task, 'task_completed');
      }
    }
  }

  // --- transitions -----------------------------------------------------------

  private spawnUnit(agent: string, model?: string, workspaceId?: string): UnitRecord {
    this.unitCounter += 1;
    const index = this.unitCounter;
    const adapter = (ADAPTERS as readonly string[]).includes(agent)
      ? (agent as AdapterName)
      : 'claude-code';
    const resolvedModel = model ?? (MODELS_BY_ADAPTER[adapter][0] as string);
    const ws =
      workspaceId ?? (this.scenario.workspaces[0] ? this.scenario.workspaces[0].workspaceId : 'ws-00');
    const unit: UnitRecord = {
      unitId: `u${String(index).padStart(2, '0')}-recruit`,
      agent: adapter,
      model: resolvedModel,
      title: `recruit-${index}`,
      workspaceId: ws,
      state: 'idle',
      taskId: null,
      runId: null,
      latestRunId: null,
      turnIndex: 0,
      plannedTurns: 0,
      stateTicks: 0,
      stateDuration: 0,
      pendingHookId: null,
      activeToolCallId: null,
      activeToolName: null,
      turnCount: 0,
      messageCount: 0,
      accumulatedText: '',
      accumulatedThinking: '',
      tokenUsage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0 },
      cost: { totalUsd: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.units.set(unit.unitId, unit);
    return unit;
  }

  private dispatchUnit(unit: UnitRecord, task: TaskRecord | null): void {
    this.runCounter += 1;
    const runId = `run-${this.seed}-${String(this.runCounter).padStart(4, '0')}`;
    const now = this.now();
    const entry: RunEntry = {
      runId,
      agent: unit.agent,
      model: unit.model,
      cwd: `/ws/${unit.workspaceId}`,
      status: 'running',
      createdAt: now,
      startedAt: now,
      endedAt: null,
      sessionId: unit.unitId,
      owner: { tokenId: 'mock-token', name: 'commander', remoteAddress: null },
      workspaceId: unit.workspaceId,
    };
    this.runs.set(runId, { entry, seq: 0 });

    const resumed = unit.latestRunId !== null;
    unit.runId = runId;
    unit.latestRunId = runId;
    unit.taskId = task ? task.resource.metadata.name : null;
    unit.state = 'dispatching';
    unit.stateTicks = 0;
    unit.stateDuration = this.rng.int(2, 4);
    unit.turnIndex = 0;
    unit.plannedTurns = this.rng.int(2, 5);
    unit.messageCount += 1;
    unit.accumulatedText = '';
    unit.accumulatedThinking = '';
    unit.tokenUsage.inputTokens += this.rng.int(400, 1600);
    unit.updatedAt = now;

    this.emitRunEvent(unit, {
      type: 'session_start',
      runId,
      agent: unit.agent,
      timestamp: now,
      sessionId: unit.unitId,
      resumed,
    });

    if (task) {
      task.state = 'assigned';
      if (!task.assigneeIds.includes(unit.unitId)) {
        task.assigneeIds.push(unit.unitId);
      }
      task.lastRunId = runId;
      task.lastAgent = unit.agent;
      task.lastUnitId = unit.unitId;
      this.emitTaskEvent(task, 'task_assigned');
    }
  }

  private enterThinking(unit: UnitRecord, newTurn: boolean): void {
    unit.state = 'thinking';
    unit.stateTicks = 0;
    unit.stateDuration = this.rng.int(2, 6);
    if (newTurn) {
      this.emitRunEvent(unit, {
        type: 'turn_start',
        runId: unit.runId ?? '',
        agent: unit.agent,
        timestamp: this.now(),
        turnIndex: unit.turnIndex,
      });
      this.emitRunEvent(unit, {
        type: 'thinking_start',
        runId: unit.runId ?? '',
        agent: unit.agent,
        timestamp: this.now(),
      });
      const task = unit.taskId ? this.tasks.get(unit.taskId) : undefined;
      if (task && task.state === 'assigned') {
        task.state = 'in_progress';
        this.emitTaskEvent(task, 'task_progress');
      }
    }
  }

  private streamThinkingTick(unit: UnitRecord): void {
    const now = this.now();
    if (this.rng.chance(0.5)) {
      const delta = this.rng.pick(THINKING_PHRASES);
      unit.accumulatedThinking += delta;
      unit.tokenUsage.thinkingTokens += this.rng.int(6, 28);
      this.emitRunEvent(unit, {
        type: 'thinking_delta',
        runId: unit.runId ?? '',
        agent: unit.agent,
        timestamp: now,
        delta,
        accumulated: unit.accumulatedThinking,
      });
    } else {
      const delta = this.rng.pick(TEXT_PHRASES);
      unit.accumulatedText += delta;
      unit.tokenUsage.outputTokens += this.rng.int(8, 40);
      this.emitRunEvent(unit, {
        type: 'text_delta',
        runId: unit.runId ?? '',
        agent: unit.agent,
        timestamp: now,
        delta,
        accumulated: unit.accumulatedText,
      });
    }
    this.accrueCost(unit);
    if (unit.stateTicks % 4 === 0) {
      this.emitRunEvent(unit, {
        type: 'token_usage',
        runId: unit.runId ?? '',
        agent: unit.agent,
        timestamp: now,
        inputTokens: unit.tokenUsage.inputTokens,
        outputTokens: unit.tokenUsage.outputTokens,
        thinkingTokens: unit.tokenUsage.thinkingTokens,
      });
    }
  }

  private decideAfterThinking(unit: UnitRecord): void {
    const roll = this.rng.next();
    if (roll < 0.16) {
      this.requestApproval(unit);
    } else if (roll < 0.7) {
      this.startToolCall(unit, this.rng.pick(TOOL_NAMES));
    } else {
      this.finishTurn(unit);
    }
  }

  private requestApproval(unit: UnitRecord): void {
    this.hookCounter += 1;
    const hookRequestId = `hook-${this.seed}-${String(this.hookCounter).padStart(4, '0')}`;
    const scenario = this.rng.pick(APPROVAL_SCENARIOS);
    const now = this.now();
    const runId = unit.runId ?? '';
    const hook: HookRecord = {
      hookRequestId,
      runId,
      unitId: unit.unitId,
      hookKind: 'approval',
      payload: {
        action: scenario.action,
        detail: scenario.detail,
        toolName: scenario.toolName,
        riskLevel: scenario.riskLevel,
        unitId: unit.unitId,
      },
      deadlineTs: now + HOOK_DEADLINE_MS,
      gatedToolName: scenario.toolName,
    };
    this.hooks.set(hookRequestId, hook);
    unit.state = 'awaiting_approval';
    unit.stateTicks = 0;
    unit.stateDuration = 0;
    unit.pendingHookId = hookRequestId;
    unit.updatedAt = now;

    const approvalEvent: ApprovalRequestEvent = {
      type: 'approval_request',
      runId,
      agent: unit.agent,
      timestamp: now,
      interactionId: hookRequestId,
      action: scenario.action,
      detail: scenario.detail,
      toolName: scenario.toolName,
      riskLevel: scenario.riskLevel,
    };
    this.emitRunEvent(unit, approvalEvent);

    const frame: HookRequestFrame = {
      type: 'hook.request',
      hookRequestId,
      runId,
      hookKind: 'approval',
      payload: { ...hook.payload },
      deadlineTs: hook.deadlineTs,
    };
    this.emit(frame);
  }

  private startToolCall(unit: UnitRecord, toolName: string): void {
    this.toolCounter += 1;
    const toolCallId = `tc-${this.seed}-${String(this.toolCounter).padStart(4, '0')}`;
    const now = this.now();
    unit.state = 'tool_running';
    unit.stateTicks = 0;
    unit.stateDuration = this.rng.int(2, 5);
    unit.activeToolCallId = toolCallId;
    unit.activeToolName = toolName;
    unit.updatedAt = now;
    const input = { description: `${toolName} sweep over the objective` };
    this.emitRunEvent(unit, {
      type: 'tool_call_start',
      runId: unit.runId ?? '',
      agent: unit.agent,
      timestamp: now,
      toolCallId,
      toolName,
      inputAccumulated: JSON.stringify(input),
    });
    this.emitRunEvent(unit, {
      type: 'tool_call_ready',
      runId: unit.runId ?? '',
      agent: unit.agent,
      timestamp: now,
      toolCallId,
      toolName,
      input,
    });
  }

  private finishToolCall(unit: UnitRecord): void {
    const now = this.now();
    const toolCallId = unit.activeToolCallId ?? '';
    const toolName = unit.activeToolName ?? 'Bash';
    if (this.rng.chance(0.05)) {
      this.emitRunEvent(unit, {
        type: 'tool_error',
        runId: unit.runId ?? '',
        agent: unit.agent,
        timestamp: now,
        toolCallId,
        toolName,
        error: `${toolName} exited with a non-zero status`,
      });
      this.emitRunEvent(unit, {
        type: 'error',
        runId: unit.runId ?? '',
        agent: unit.agent,
        timestamp: now,
        code: 'INTERNAL',
        message: `Tool ${toolName} failed; agent is wedged`,
        recoverable: true,
      });
      this.enterBlocked(unit);
      return;
    }
    this.emitRunEvent(unit, {
      type: 'tool_result',
      runId: unit.runId ?? '',
      agent: unit.agent,
      timestamp: now,
      toolCallId,
      toolName,
      output: { ok: true, summary: `${toolName} finished cleanly` },
      durationMs: unit.stateDuration * TICK_MS,
    });
    unit.activeToolCallId = null;
    unit.activeToolName = null;
    unit.tokenUsage.inputTokens += this.rng.int(60, 400);
    this.accrueCost(unit);
    this.progressAssignedTask(unit, 0.02 + this.rng.next() * 0.05);
    this.enterThinking(unit, false);
  }

  private finishTurn(unit: UnitRecord): void {
    const now = this.now();
    this.emitRunEvent(unit, {
      type: 'message_stop',
      runId: unit.runId ?? '',
      agent: unit.agent,
      timestamp: now,
      text: unit.accumulatedText,
    });
    this.emitRunEvent(unit, {
      type: 'turn_end',
      runId: unit.runId ?? '',
      agent: unit.agent,
      timestamp: now,
      turnIndex: unit.turnIndex,
      cost: this.costOf(unit),
    });
    unit.turnIndex += 1;
    unit.turnCount += 1;
    unit.messageCount += 2;
    unit.updatedAt = now;
    this.progressAssignedTask(unit, 0.08 + this.rng.next() * 0.12);

    const task = unit.taskId ? this.tasks.get(unit.taskId) : undefined;
    const taskSettled =
      task !== undefined && (task.state === 'review' || task.state === 'done' || task.state === 'failed');
    if (unit.turnIndex >= unit.plannedTurns || taskSettled) {
      this.completeRun(unit);
    } else {
      this.enterThinking(unit, true);
    }
  }

  private enterBlocked(unit: UnitRecord): void {
    unit.state = 'blocked';
    unit.stateTicks = 0;
    unit.stateDuration = this.rng.int(24, 48);
    unit.pendingHookId = null;
    unit.updatedAt = this.now();
  }

  private resumeUnit(unit: UnitRecord): void {
    if (unit.runId === null) return;
    this.emitRunEvent(unit, {
      type: 'resumed',
      runId: unit.runId,
      agent: unit.agent,
      timestamp: this.now(),
    });
    this.enterThinking(unit, false);
    unit.updatedAt = this.now();
  }

  private completeRun(unit: UnitRecord): void {
    const now = this.now();
    const run = unit.runId ? this.runs.get(unit.runId) : undefined;
    this.emitRunEvent(unit, {
      type: 'session_end',
      runId: unit.runId ?? '',
      agent: unit.agent,
      timestamp: now,
      sessionId: unit.unitId,
      turnCount: unit.turnCount,
      cost: this.costOf(unit),
    });
    if (run) {
      run.entry.status = 'completed';
      run.entry.endedAt = now;
      run.entry.exitReason = 'completed';
    }
    const task = unit.taskId ? this.tasks.get(unit.taskId) : undefined;
    if (task) {
      this.unassign(task, unit.unitId);
      if (task.progress >= 1 && task.state !== 'done') {
        task.state = 'review';
        task.reviewTicks = 6;
        this.emitTaskEvent(task, 'task_progress');
      } else if (task.state !== 'review' && task.state !== 'done') {
        task.state = task.assigneeIds.length > 0 ? task.state : 'queued';
        this.emitTaskEvent(task, 'task_progress');
      }
    }
    unit.runId = null;
    unit.taskId = null;
    unit.pendingHookId = null;
    unit.activeToolCallId = null;
    unit.activeToolName = null;
    unit.state = 'completed';
    unit.stateTicks = 0;
    unit.stateDuration = 2;
    unit.updatedAt = now;
  }

  private failRun(unit: UnitRecord, message: string): void {
    const now = this.now();
    const run = unit.runId ? this.runs.get(unit.runId) : undefined;
    this.emitRunEvent(unit, {
      type: 'error',
      runId: unit.runId ?? '',
      agent: unit.agent,
      timestamp: now,
      code: 'AGENT_CRASH',
      message,
      recoverable: false,
    });
    this.emitRunEvent(unit, {
      type: 'session_end',
      runId: unit.runId ?? '',
      agent: unit.agent,
      timestamp: now,
      sessionId: unit.unitId,
      turnCount: unit.turnCount,
      cost: this.costOf(unit),
    });
    if (run) {
      run.entry.status = 'failed';
      run.entry.endedAt = now;
      run.entry.exitReason = 'crashed';
      run.entry.error = { code: 'AGENT_CRASH', message };
    }
    const task = unit.taskId ? this.tasks.get(unit.taskId) : undefined;
    if (task) {
      this.unassign(task, unit.unitId);
      if (task.state !== 'done' && task.state !== 'review') {
        task.state = task.assigneeIds.length > 0 ? task.state : 'queued';
      }
      this.emitTaskEvent(task, 'task_failed');
    }
    unit.runId = null;
    unit.taskId = null;
    unit.pendingHookId = null;
    unit.activeToolCallId = null;
    unit.activeToolName = null;
    unit.state = 'failed';
    unit.stateTicks = 0;
    unit.stateDuration = 8;
    unit.updatedAt = now;
  }

  private abortUnit(unit: UnitRecord): void {
    const now = this.now();
    if (unit.runId === null) {
      // Nothing running; idempotent.
      return;
    }
    const run = this.runs.get(unit.runId);
    if (unit.pendingHookId) {
      const hook = this.hooks.get(unit.pendingHookId);
      if (hook) {
        this.hooks.delete(hook.hookRequestId);
        this.emit({
          type: 'hook.resolved',
          hookRequestId: hook.hookRequestId,
          resolvedBy: 'operator:abort',
          decision: 'deny',
        });
      }
      unit.pendingHookId = null;
    }
    this.emitRunEvent(unit, {
      type: 'aborted',
      runId: unit.runId,
      agent: unit.agent,
      timestamp: now,
    });
    this.emitRunEvent(unit, {
      type: 'session_end',
      runId: unit.runId,
      agent: unit.agent,
      timestamp: now,
      sessionId: unit.unitId,
      turnCount: unit.turnCount,
      cost: this.costOf(unit),
    });
    if (run) {
      run.entry.status = 'aborted';
      run.entry.endedAt = now;
      run.entry.exitReason = 'aborted';
    }
    const task = unit.taskId ? this.tasks.get(unit.taskId) : undefined;
    if (task) {
      this.unassign(task, unit.unitId);
      if (task.state !== 'done' && task.state !== 'review') {
        task.state = task.assigneeIds.length > 0 ? task.state : 'queued';
      }
      this.emitTaskEvent(task, 'task_progress');
    }
    unit.runId = null;
    unit.taskId = null;
    unit.activeToolCallId = null;
    unit.activeToolName = null;
    unit.state = 'idle';
    unit.stateTicks = 0;
    unit.stateDuration = 0;
    unit.updatedAt = now;
  }

  private resolveHook(
    hook: HookRecord,
    decision: 'allow' | 'deny',
    resolvedBy: string,
    reason?: string,
  ): void {
    this.hooks.delete(hook.hookRequestId);
    const unit = this.units.get(hook.unitId);
    this.emit({
      type: 'hook.resolved',
      hookRequestId: hook.hookRequestId,
      resolvedBy,
      decision,
    });
    if (!unit) return;
    unit.pendingHookId = null;
    if (decision === 'allow') {
      this.emitRunEvent(unit, {
        type: 'approval_granted',
        runId: unit.runId ?? '',
        agent: unit.agent,
        timestamp: this.now(),
        interactionId: hook.hookRequestId,
      });
      // The gated action proceeds: visibly run the tool that was gated.
      this.startToolCall(unit, hook.gatedToolName);
    } else {
      this.emitRunEvent(unit, {
        type: 'approval_denied',
        runId: unit.runId ?? '',
        agent: unit.agent,
        timestamp: this.now(),
        interactionId: hook.hookRequestId,
        ...(reason !== undefined ? { reason } : {}),
      });
      this.enterBlocked(unit);
    }
  }

  private toIdle(unit: UnitRecord): void {
    unit.state = 'idle';
    unit.stateTicks = 0;
    unit.stateDuration = 0;
    unit.updatedAt = this.now();
  }

  // --- helpers ---------------------------------------------------------------

  private queuedTasks(): TaskRecord[] {
    return [...this.tasks.values()].filter((task) => task.state === 'queued');
  }

  private progressAssignedTask(unit: UnitRecord, amount: number): void {
    const task = unit.taskId ? this.tasks.get(unit.taskId) : undefined;
    if (!task || task.state === 'done' || task.state === 'failed' || task.state === 'review') {
      return;
    }
    task.progress = Math.min(1, task.progress + amount);
    task.lastRunId = unit.runId ?? task.lastRunId;
    task.lastAgent = unit.agent;
    task.lastUnitId = unit.unitId;
    this.emitTaskEvent(task, 'task_progress');
  }

  private unassign(task: TaskRecord, unitId: string): void {
    task.assigneeIds = task.assigneeIds.filter((id) => id !== unitId);
  }

  private accrueCost(unit: UnitRecord): void {
    const pricing = PRICING[unit.agent] ?? { input: 2e-6, output: 8e-6 };
    const usage = unit.tokenUsage;
    unit.cost = {
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

  private costOf(unit: UnitRecord): CostRecord {
    this.accrueCost(unit);
    return {
      totalUsd: unit.cost.totalUsd,
      inputTokens: unit.cost.inputTokens,
      outputTokens: unit.cost.outputTokens,
      thinkingTokens: unit.cost.thinkingTokens,
    };
  }

  private emit(frame: ServerFrame): void {
    for (const listener of [...this.listeners]) {
      listener(frame);
    }
  }

  private emitRunEvent(unit: UnitRecord, event: AgentEvent | TaskLifecycleEventPayload): void {
    const runId = event.runId !== '' ? event.runId : (unit.runId ?? 'run-none');
    const run = this.runs.get(runId);
    const seq = run ? (run.seq += 1) : 0;
    this.emit({
      type: 'run.event',
      runId,
      seq,
      source: unit.agent,
      event: { ...event },
    });
  }

  private emitTaskEvent(
    task: TaskRecord,
    type: TaskLifecycleEventPayload['type'],
  ): void {
    const unit = task.lastUnitId ? this.units.get(task.lastUnitId) : undefined;
    const payload: TaskLifecycleEventPayload = {
      type,
      runId: task.lastRunId !== '' ? task.lastRunId : 'run-none',
      agent: task.lastAgent !== '' ? task.lastAgent : 'commander',
      timestamp: this.now(),
      taskId: task.resource.metadata.name,
      taskState: task.state,
      progress: roundTo(task.progress, 4),
      unitId: task.lastUnitId,
    };
    if (type === 'task_failed' && task.state !== 'done') {
      // Task resource phase reflects sim state for failed dispatches.
      task.resource.status.phase = task.state === 'failed' ? 'Failed' : 'Pending';
    }
    const run = this.runs.get(payload.runId);
    const seq = run ? (run.seq += 1) : 0;
    this.emit({
      type: 'run.event',
      runId: payload.runId,
      seq,
      source: unit ? unit.agent : 'commander',
      event: { ...payload },
    });
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Extract a `task:<taskId>` reference from a dispatch/steer prompt. */
export function parseTaskRef(prompt: string): string | null {
  const match = /task:([A-Za-z0-9_-]+)/.exec(prompt);
  return match ? (match[1] ?? null) : null;
}
