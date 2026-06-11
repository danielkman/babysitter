/**
 * Single Zustand store (SPEC §6) with slices:
 *   - world: entities (UnitEntity | TaskEntity) + positions {x,y} + seeded layout
 *   - selection: ordered entityId[] + control groups Record<digit, entityId[]>
 *   - camera: {x, y, zoom} with clamped bounds
 *   - events: ring buffer (≤500) of ticker entries {id, ts, severity, text, entityId?}
 *   - alerts: pending approvals {hookRequestId, runId, unitId, kind, payload, deadlineTs}
 *   - meta: resources snapshot, sim clock, connection status (+ transient UI fields)
 *
 * One store commit per sim tick batch: `bindBackendToStore` buffers ServerFrames
 * and flushes them together with the sim views (`listUnitViews`/`listTaskViews`/
 * `listPendingHooks`) in a single `commitTick` setState (SPEC §6, §14).
 *
 * Determinism (AC13): everything committed during a tick derives from the sim
 * (frames + views + sim clock) — never Date.now() or Math.random().
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

import type {
  HookRequestFrame,
  RunEventFrame,
  ServerFrame,
} from '../contracts/gateway-protocol';
import type { MockBackend } from '../backend/mock/mockBackend';
import type {
  SimHookView,
  SimTaskView,
  SimUnitView,
} from '../backend/mock/simulation';
import {
  centerOn,
  clampCamera,
  createDefaultCamera,
  panByScreen,
  worldToScreen,
  zoomAtPoint,
  type CameraState,
  type Size,
  type Vec2,
} from './camera';
import {
  clampToWorld,
  computeLayout,
  rallyOffset,
  stagingSlot,
  taskOrbitSlot,
  WORLD,
  type WorldLayout,
} from './layout';

// ---------------------------------------------------------------------------
// Entity & slice types (SPEC §6)
// ---------------------------------------------------------------------------

export const COMMANDER_VERSION = '0.3.0-microagent';

/** Assumed context window per unit (tokens) → health bar = context headroom. */
export const CONTEXT_WINDOW_TOKENS = 200_000;
/** Assumed token budget per unit (USD) → energy bar = budget remaining. */
export const UNIT_BUDGET_USD = 2.5;

/** Ring buffer cap (SPEC §6). */
export const EVENT_RING_CAP = 500;
/** Transcript entries kept per unit (Inspector stream). */
const TRANSCRIPT_CAP = 100;
/** Ping lifetime in sim milliseconds. */
const PING_TTL_MS = 4_000;

export type TickerSeverity = 'info' | 'success' | 'warn' | 'alert';

export interface TickerEntry {
  id: string;
  ts: number;
  severity: TickerSeverity;
  text: string;
  entityId?: string;
}

export interface AlertEntry {
  hookRequestId: string;
  runId: string;
  unitId: string;
  kind: string;
  payload: Record<string, unknown>;
  deadlineTs: number;
}

export interface PingRecord {
  id: string;
  x: number;
  y: number;
  tone: 'alert' | 'info';
  startedAt: number;
}

export interface TranscriptEntry {
  id: string;
  kind: 'turn' | 'text' | 'thinking' | 'tool' | 'note';
  text: string;
  /** Tool-call entries: tool name (Inspector renders name + duration). */
  toolName?: string;
  /** Tool-result entries: execution duration in ms. */
  durationMs?: number;
  /** Tool entry lifecycle (running → done | failed). */
  toolStatus?: 'running' | 'done' | 'failed';
}

export interface UnitEntity {
  kind: 'unit';
  id: string;
  /** Serializable sim view (wraps mirrored SessionEntry-level data + run state). */
  view: SimUnitView;
  /** Context window usage 0..1 (health bar = 1 - contextPct). */
  contextPct: number;
  /** Budget remaining 0..1 (energy bar). */
  energyPct: number;
  /** Inspector transcript stream (capped). */
  transcript: TranscriptEntry[];
  /** Monotonic transcript id counter (survives ring-cap slicing). */
  transcriptSeq: number;
}

export interface TaskEntity {
  kind: 'task';
  id: string;
  view: SimTaskView;
}

export interface WorldSlice {
  units: Record<string, UnitEntity>;
  /** Sorted unit ids (stable render order). */
  unitIds: string[];
  tasks: Record<string, TaskEntity>;
  /** Sorted task ids (stable render order). */
  taskIds: string[];
  /** entityId → world position. Task positions are static; units glide. */
  positions: Record<string, Vec2>;
  layout: WorldLayout;
  bounds: Size;
  /** runId → unitId (resolves run-scoped adapter events to units). */
  runToUnit: Record<string, string>;
  /** Manual rally points for idle units (cleared on dispatch). */
  rallyPoints: Record<string, Vec2>;
}

export interface SelectionSlice {
  /** Ordered selection (units and/or tasks). */
  ids: string[];
  /** Control groups: digit → entityId[]. */
  groups: Record<string, string[]>;
}

export interface ResourcesSnapshot {
  unitCount: number;
  busyCount: number;
  idleCount: number;
  tokensBurned: number;
  costUsd: number;
  tasksDone: number;
  tasksTotal: number;
  alertCount: number;
}

export type TargetingMode = 'dispatch' | 'rally' | null;

export interface MarqueeRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MetaSlice {
  resources: ResourcesSnapshot;
  simTimeMs: number;
  simStartMs: number;
  tickIndex: number;
  connection: 'connecting' | 'connected' | 'disconnected';
  paused: boolean;
  viewport: Size;
  inspectorUnitId: string | null;
  steerOpen: boolean;
  targeting: TargetingMode;
  marquee: MarqueeRect | null;
  pings: PingRecord[];
  idleCycleCursor: number;
  eventSeq: number;
  /** Monotonic id counter for UI-originated pings (ticker focus, SPEC §4). */
  pingSeq: number;
  version: string;
}

export interface TickCommitInput {
  frames: ServerFrame[];
  units: SimUnitView[];
  tasks: SimTaskView[];
  hooks: SimHookView[];
  nowMs: number;
  tickIndex: number;
  paused: boolean;
}

export interface CommanderState {
  world: WorldSlice;
  selection: SelectionSlice;
  camera: CameraState;
  events: TickerEntry[];
  alerts: AlertEntry[];
  meta: MetaSlice;

  // --- tick ingestion -------------------------------------------------------
  commitTick(input: TickCommitInput): void;

  // --- selection ------------------------------------------------------------
  select(ids: string[]): void;
  clickSelect(id: string, shift: boolean): void;
  marqueeSelect(ids: string[], shift: boolean): void;
  clearSelection(): void;
  assignGroup(digit: string): void;
  /** Recall a control group; recalling the already-active group centers the camera. */
  recallGroup(digit: string): void;
  cycleIdle(): void;
  /** Esc: close inspector → cancel targeting/steer → clear selection (SPEC §5). */
  escape(): void;

  // --- camera ---------------------------------------------------------------
  setCamera(camera: CameraState): void;
  panBy(dxScreen: number, dyScreen: number): void;
  zoomAt(screenPoint: Vec2, deltaY: number): void;
  centerOnPoint(point: Vec2): void;
  centerOnEntity(entityId: string): void;
  jumpToLatestAlert(): void;

  // --- transient UI ---------------------------------------------------------
  setViewport(size: Size): void;
  setMarquee(rect: MarqueeRect | null): void;
  openInspector(unitId: string): void;
  closeInspector(): void;
  openSteer(): void;
  closeSteer(): void;
  setTargeting(mode: TargetingMode): void;
  setRally(unitIds: string[], point: Vec2): void;
  setPaused(paused: boolean): void;
  pushEvent(text: string, severity: TickerSeverity, entityId?: string): void;
  /** Drop a minimap/world ping at an entity (ticker focus, SPEC §4). */
  addPing(entityId: string, tone: PingRecord['tone']): void;
}

export type CommanderStore = StoreApi<CommanderState>;

// ---------------------------------------------------------------------------
// Pure selection helpers (unit-tested)
// ---------------------------------------------------------------------------

export function applyClickSelection(current: readonly string[], id: string, shift: boolean): string[] {
  if (!shift) return [id];
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
}

export function applyMarqueeSelection(
  current: readonly string[],
  ids: readonly string[],
  shift: boolean,
): string[] {
  if (!shift) return [...ids];
  const merged = [...current];
  for (const id of ids) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged;
}

export function sameSelectionSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

// ---------------------------------------------------------------------------
// Tick reduction internals
// ---------------------------------------------------------------------------

const BUSY_STATES = new Set([
  'dispatching',
  'thinking',
  'tool_running',
  'awaiting_approval',
  'blocked',
]);

function tokenTotal(view: SimUnitView): number {
  const t = view.tokenUsage;
  return t.inputTokens + t.outputTokens + t.thinkingTokens;
}

function unitViewEqual(a: SimUnitView, b: SimUnitView): boolean {
  return (
    a.unitId === b.unitId &&
    a.agent === b.agent &&
    a.model === b.model &&
    a.title === b.title &&
    a.workspaceId === b.workspaceId &&
    a.state === b.state &&
    a.paused === b.paused &&
    a.taskId === b.taskId &&
    a.runId === b.runId &&
    a.turnIndex === b.turnIndex &&
    a.turnCount === b.turnCount &&
    a.messageCount === b.messageCount &&
    a.pendingHookId === b.pendingHookId &&
    a.tokenUsage.inputTokens === b.tokenUsage.inputTokens &&
    a.tokenUsage.outputTokens === b.tokenUsage.outputTokens &&
    a.tokenUsage.thinkingTokens === b.tokenUsage.thinkingTokens &&
    a.tokenUsage.cachedTokens === b.tokenUsage.cachedTokens &&
    a.cost.totalUsd === b.cost.totalUsd &&
    a.updatedAt === b.updatedAt
  );
}

function taskViewEqual(a: SimTaskView, b: SimTaskView): boolean {
  return (
    a.taskId === b.taskId &&
    a.taskKind === b.taskKind &&
    a.repository === b.repository &&
    a.workspaceId === b.workspaceId &&
    a.title === b.title &&
    a.state === b.state &&
    a.phase === b.phase &&
    a.progress === b.progress &&
    a.priority === b.priority &&
    a.assigneeIds.length === b.assigneeIds.length &&
    a.assigneeIds.every((id, i) => b.assigneeIds[i] === id)
  );
}

function vecEqual(a: Vec2 | undefined, b: Vec2): boolean {
  return a !== undefined && a.x === b.x && a.y === b.y;
}

interface FrameRouting {
  tickerEntries: Array<Omit<TickerEntry, 'id'>>;
  /** unitId → appended transcript entries (without ids). */
  transcriptOps: Map<string, Array<Omit<TranscriptEntry, 'id'>>>;
  pingSources: Array<{ entityId: string; tone: PingRecord['tone']; key: string; ts: number }>;
  runToUnit: Record<string, string>;
  connected: boolean;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Route a batch of ServerFrames into ticker entries, transcript appends, ping
 * sources and runId→unitId index updates. Pure with respect to its inputs.
 */
function routeFrames(
  frames: readonly ServerFrame[],
  prevRunToUnit: Record<string, string>,
  unitTitle: (unitId: string | undefined) => string,
  taskTitle: (taskId: string | undefined) => string,
  nowMs: number,
): FrameRouting {
  const routing: FrameRouting = {
    tickerEntries: [],
    transcriptOps: new Map(),
    pingSources: [],
    runToUnit: prevRunToUnit,
    connected: false,
  };
  let runToUnitMutable: Record<string, string> | null = null;
  const indexRun = (runId: string, unitId: string): void => {
    if (routing.runToUnit[runId] === unitId) return;
    if (runToUnitMutable === null) {
      runToUnitMutable = { ...prevRunToUnit };
      routing.runToUnit = runToUnitMutable;
    }
    runToUnitMutable[runId] = unitId;
  };
  const transcript = (unitId: string, entry: Omit<TranscriptEntry, 'id'>): void => {
    const list = routing.transcriptOps.get(unitId);
    if (list) {
      list.push(entry);
    } else {
      routing.transcriptOps.set(unitId, [entry]);
    }
  };
  const ticker = (entry: Omit<TickerEntry, 'id'>): void => {
    routing.tickerEntries.push(entry);
  };

  for (const frame of frames) {
    switch (frame.type) {
      case 'hello':
        routing.connected = true;
        break;
      case 'error':
        ticker({ ts: nowMs, severity: 'alert', text: `Command rejected — ${frame.code}: ${frame.message}` });
        break;
      case 'hook.request': {
        const unitId = asString((frame as HookRequestFrame).payload['unitId']);
        if (unitId !== undefined) {
          routing.pingSources.push({
            entityId: unitId,
            tone: 'alert',
            key: `ping-${frame.hookRequestId}`,
            ts: nowMs,
          });
        }
        break;
      }
      case 'hook.resolved':
        // Alerts reconcile against listPendingHooks(); nothing extra to do.
        break;
      case 'pong':
      case 'pairing.consumed':
        break;
      case 'run.event': {
        routeRunEvent(frame, routing, indexRun, transcript, ticker, unitTitle, taskTitle);
        break;
      }
    }
  }
  return routing;
}

function routeRunEvent(
  frame: RunEventFrame,
  routing: FrameRouting,
  indexRun: (runId: string, unitId: string) => void,
  transcript: (unitId: string, entry: Omit<TranscriptEntry, 'id'>) => void,
  ticker: (entry: Omit<TickerEntry, 'id'>) => void,
  unitTitle: (unitId: string | undefined) => string,
  taskTitle: (taskId: string | undefined) => string,
): void {
  const ev = frame.event;
  const type = asString(ev['type']);
  if (type === undefined) return;
  const ts = asNumber(ev['timestamp']) ?? 0;
  const sessionId = asString(ev['sessionId']);
  const eventUnitId = asString(ev['unitId']);
  if (sessionId !== undefined && frame.runId !== 'run-none') {
    indexRun(frame.runId, sessionId);
  }
  const unitId = sessionId ?? eventUnitId ?? routing.runToUnit[frame.runId];

  switch (type) {
    case 'session_start': {
      const resumed = ev['resumed'] === true;
      if (unitId !== undefined) {
        transcript(unitId, { kind: 'note', text: `session ${resumed ? 'resumed' : 'started'} (${frame.runId})` });
        ticker({
          ts,
          severity: 'info',
          text: `${unitTitle(unitId)} deployed${resumed ? ' (resumed)' : ''}`,
          entityId: unitId,
        });
      }
      break;
    }
    case 'turn_start': {
      const turnIndex = asNumber(ev['turnIndex']) ?? 0;
      if (unitId !== undefined) transcript(unitId, { kind: 'turn', text: `— turn ${turnIndex + 1} —` });
      break;
    }
    case 'text_delta': {
      const accumulated = asString(ev['accumulated']) ?? '';
      if (unitId !== undefined) transcript(unitId, { kind: 'text', text: accumulated });
      break;
    }
    case 'thinking_delta': {
      const accumulated = asString(ev['accumulated']) ?? '';
      if (unitId !== undefined) transcript(unitId, { kind: 'thinking', text: accumulated });
      break;
    }
    case 'tool_call_start': {
      const toolName = asString(ev['toolName']) ?? 'tool';
      if (unitId !== undefined) {
        transcript(unitId, {
          kind: 'tool',
          text: `> ${toolName} running…`,
          toolName,
          toolStatus: 'running',
        });
      }
      break;
    }
    case 'tool_result': {
      const toolName = asString(ev['toolName']) ?? 'tool';
      const durationMs = asNumber(ev['durationMs']) ?? 0;
      if (unitId !== undefined) {
        transcript(unitId, {
          kind: 'tool',
          text: `> ${toolName} finished (${durationMs}ms)`,
          toolName,
          durationMs,
          toolStatus: 'done',
        });
      }
      break;
    }
    case 'tool_error': {
      const toolName = asString(ev['toolName']) ?? 'tool';
      const error = asString(ev['error']) ?? 'tool failed';
      if (unitId !== undefined) {
        transcript(unitId, {
          kind: 'tool',
          text: `> ${toolName} FAILED: ${error}`,
          toolName,
          toolStatus: 'failed',
        });
        ticker({ ts, severity: 'warn', text: `${unitTitle(unitId)}: ${error}`, entityId: unitId });
      }
      break;
    }
    case 'approval_request': {
      const action = asString(ev['action']) ?? 'an action';
      if (unitId !== undefined) {
        transcript(unitId, { kind: 'note', text: `requests approval: ${asString(ev['detail']) ?? action}` });
        ticker({
          ts,
          severity: 'warn',
          text: `Approval requested — ${unitTitle(unitId)} wants to ${action}`,
          entityId: unitId,
        });
      }
      break;
    }
    case 'approval_granted': {
      if (unitId !== undefined) {
        transcript(unitId, { kind: 'note', text: 'approval granted' });
        ticker({ ts, severity: 'success', text: `Approval granted — ${unitTitle(unitId)} proceeds`, entityId: unitId });
      }
      break;
    }
    case 'approval_denied': {
      if (unitId !== undefined) {
        transcript(unitId, { kind: 'note', text: 'approval denied' });
        ticker({ ts, severity: 'warn', text: `Approval denied — ${unitTitle(unitId)} holds`, entityId: unitId });
      }
      break;
    }
    case 'aborted': {
      if (unitId !== undefined) {
        transcript(unitId, { kind: 'note', text: 'run aborted by operator' });
        ticker({ ts, severity: 'warn', text: `Abort executed — ${unitTitle(unitId)} stands down`, entityId: unitId });
      }
      break;
    }
    case 'paused': {
      if (unitId !== undefined) {
        transcript(unitId, { kind: 'note', text: 'holding — paused by operator' });
        ticker({
          ts,
          severity: 'info',
          text: `${unitTitle(unitId)} holding position — paused by operator`,
          entityId: unitId,
        });
      }
      break;
    }
    case 'resumed': {
      if (unitId !== undefined) {
        transcript(unitId, { kind: 'note', text: 'resumed' });
        ticker({ ts, severity: 'info', text: `${unitTitle(unitId)} back online`, entityId: unitId });
      }
      break;
    }
    case 'unit_retired': {
      const retiredId = eventUnitIdOf(ev) ?? unitId;
      // No entityId: the unit leaves the world this very commit — a ticker
      // link to a despawned entity would be a dead click.
      ticker({
        ts,
        severity: 'info',
        text: `${unitTitle(retiredId)} retired — decommissioned from the fleet`,
      });
      break;
    }
    case 'task_prioritized': {
      const taskId = asString(ev['taskId']);
      ticker({
        ts,
        severity: 'info',
        text: `Priority objective — ${taskTitle(taskId)} moved to the front of the queue`,
        ...(taskId !== undefined ? { entityId: taskId } : {}),
      });
      break;
    }
    case 'error': {
      const message = asString(ev['message']) ?? 'unknown error';
      const recoverable = ev['recoverable'] === true;
      if (unitId !== undefined) {
        transcript(unitId, { kind: 'note', text: `ERROR: ${message}` });
        ticker({
          ts,
          severity: recoverable ? 'warn' : 'alert',
          text: `${unitTitle(unitId)}: ${message}`,
          entityId: unitId,
        });
      }
      break;
    }
    case 'session_end': {
      if (unitId !== undefined) transcript(unitId, { kind: 'note', text: 'session ended' });
      break;
    }
    case 'task_assigned': {
      const taskId = asString(ev['taskId']);
      const tUnit = eventUnitIdOf(ev) ?? unitId;
      ticker({
        ts,
        severity: 'info',
        text: `Dispatch order — ${unitTitle(tUnit)} assigned to ${taskTitle(taskId)}`,
        ...(tUnit !== undefined ? { entityId: tUnit } : {}),
      });
      break;
    }
    case 'task_completed': {
      const taskId = asString(ev['taskId']);
      ticker({
        ts,
        severity: 'success',
        text: `Objective secured — ${taskTitle(taskId)}`,
        ...(taskId !== undefined ? { entityId: taskId } : {}),
      });
      break;
    }
    case 'task_failed': {
      const taskId = asString(ev['taskId']);
      ticker({
        ts,
        severity: 'alert',
        text: `Objective compromised — ${taskTitle(taskId)}`,
        ...(taskId !== undefined ? { entityId: taskId } : {}),
      });
      if (taskId !== undefined) {
        routing.pingSources.push({ entityId: taskId, tone: 'alert', key: `ping-fail-${taskId}-${ts}`, ts });
      }
      break;
    }
    default:
      // thinking_start/stop, message_start/stop, token_usage, turn_end, task_progress…
      // are intentionally not surfaced in the ticker (noise control, SPEC §14).
      break;
  }
}

function eventUnitIdOf(ev: Record<string, unknown>): string | undefined {
  return asString(ev['unitId']);
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

const EMPTY_LAYOUT: WorldLayout = { zoneCenters: {}, taskPositions: {}, signature: '' };

function initialResources(): ResourcesSnapshot {
  return {
    unitCount: 0,
    busyCount: 0,
    idleCount: 0,
    tokensBurned: 0,
    costUsd: 0,
    tasksDone: 0,
    tasksTotal: 0,
    alertCount: 0,
  };
}

export function createCommanderStore(): CommanderStore {
  return createStore<CommanderState>((set, get) => ({
    world: {
      units: {},
      unitIds: [],
      tasks: {},
      taskIds: [],
      positions: {},
      layout: EMPTY_LAYOUT,
      bounds: WORLD,
      runToUnit: {},
      rallyPoints: {},
    },
    selection: { ids: [], groups: {} },
    camera: createDefaultCamera(WORLD),
    events: [],
    alerts: [],
    meta: {
      resources: initialResources(),
      simTimeMs: 0,
      simStartMs: 0,
      tickIndex: 0,
      connection: 'connecting',
      paused: false,
      viewport: { width: 1280, height: 720 },
      inspectorUnitId: null,
      steerOpen: false,
      targeting: null,
      marquee: null,
      pings: [],
      idleCycleCursor: -1,
      eventSeq: 0,
      pingSeq: 0,
      version: COMMANDER_VERSION,
    },

    // --- tick ingestion -----------------------------------------------------
    commitTick(input) {
      set((state) => {
        const prevWorld = state.world;
        const unitViewById = new Map(input.units.map((u) => [u.unitId, u]));
        const taskViewById = new Map(input.tasks.map((t) => [t.taskId, t]));
        const unitTitle = (id: string | undefined): string => {
          if (id === undefined) return 'unknown unit';
          return unitViewById.get(id)?.title ?? prevWorld.units[id]?.view.title ?? id;
        };
        const taskTitle = (id: string | undefined): string => {
          if (id === undefined) return 'unknown objective';
          return taskViewById.get(id)?.title ?? prevWorld.tasks[id]?.view.title ?? id;
        };

        const routing = routeFrames(input.frames, prevWorld.runToUnit, unitTitle, taskTitle, input.nowMs);

        // --- layout (recompute only when the task set changes) --------------
        const signature = input.tasks
          .map((t) => t.taskId)
          .sort()
          .join('|');
        const layout = signature === prevWorld.layout.signature ? prevWorld.layout : computeLayout(input.tasks);

        // --- tasks -----------------------------------------------------------
        const tasks: Record<string, TaskEntity> = {};
        let tasksChanged = false;
        for (const view of input.tasks) {
          const prev = prevWorld.tasks[view.taskId];
          if (prev && taskViewEqual(prev.view, view)) {
            tasks[view.taskId] = prev;
          } else {
            tasks[view.taskId] = { kind: 'task', id: view.taskId, view };
            tasksChanged = true;
          }
        }
        const taskIds = Object.keys(tasks).sort();
        const taskIdsStable =
          taskIds.length === prevWorld.taskIds.length && taskIds.every((id, i) => prevWorld.taskIds[i] === id);

        // --- units (preserve refs when unchanged → memoized sprites) --------
        const units: Record<string, UnitEntity> = {};
        let unitsChanged = false;
        for (const view of input.units) {
          const prev = prevWorld.units[view.unitId];
          const appended = routing.transcriptOps.get(view.unitId);
          let transcriptArr = prev?.transcript ?? [];
          let transcriptSeq = prev?.transcriptSeq ?? 0;
          if (appended !== undefined && appended.length > 0) {
            const next = [...transcriptArr];
            for (const entry of appended) {
              const last = next[next.length - 1];
              if (
                last !== undefined &&
                (entry.kind === 'text' || entry.kind === 'thinking') &&
                last.kind === entry.kind
              ) {
                next[next.length - 1] = { ...last, text: entry.text };
              } else {
                next.push({ id: `tr-${view.unitId}-${(transcriptSeq += 1)}`, ...entry });
              }
            }
            transcriptArr = next.slice(-TRANSCRIPT_CAP);
          }
          if (prev && transcriptArr === prev.transcript && unitViewEqual(prev.view, view)) {
            units[view.unitId] = prev;
          } else {
            const used = tokenTotal(view) + view.tokenUsage.cachedTokens;
            units[view.unitId] = {
              kind: 'unit',
              id: view.unitId,
              view,
              contextPct: Math.min(1, used / CONTEXT_WINDOW_TOKENS),
              energyPct: Math.max(0, 1 - view.cost.totalUsd / UNIT_BUDGET_USD),
              transcript: transcriptArr,
              transcriptSeq,
            };
            unitsChanged = true;
          }
        }
        const unitIds = Object.keys(units).sort();
        const unitIdsStable =
          unitIds.length === prevWorld.unitIds.length && unitIds.every((id, i) => prevWorld.unitIds[i] === id);

        // --- rally cleanup (dispatched units forget manual rally points) ----
        let rallyPoints = prevWorld.rallyPoints;
        for (const id of Object.keys(rallyPoints)) {
          const view = unitViewById.get(id);
          if (view === undefined || view.taskId !== null) {
            if (rallyPoints === prevWorld.rallyPoints) rallyPoints = { ...rallyPoints };
            delete rallyPoints[id];
          }
        }

        // --- positions (deterministic targets; CSS animates the glide) ------
        const positions: Record<string, Vec2> = {};
        let positionsChanged = false;
        for (const id of taskIds) {
          const target = layout.taskPositions[id] ?? { x: WORLD.width / 2, y: 300 };
          const prevPos = prevWorld.positions[id];
          positions[id] = vecEqual(prevPos, target) && prevPos !== undefined ? prevPos : target;
          if (positions[id] !== prevPos) positionsChanged = true;
        }
        unitIds.forEach((id, index) => {
          const view = unitViewById.get(id);
          let target: Vec2;
          const taskId = view?.taskId ?? null;
          if (taskId !== null && layout.taskPositions[taskId] !== undefined) {
            target = taskOrbitSlot(layout.taskPositions[taskId], id, taskId);
          } else {
            const rally = rallyPoints[id];
            target = rally !== undefined ? rally : stagingSlot(index);
          }
          const prevPos = prevWorld.positions[id];
          positions[id] = vecEqual(prevPos, target) && prevPos !== undefined ? prevPos : target;
          if (positions[id] !== prevPos) positionsChanged = true;
        });
        if (Object.keys(prevWorld.positions).length !== Object.keys(positions).length) {
          positionsChanged = true;
        }

        // --- alerts (sim pending hooks are the source of truth) -------------
        const prevAlertById = new Map(state.alerts.map((a) => [a.hookRequestId, a]));
        const alerts: AlertEntry[] = input.hooks.map((hook) => {
          const prev = prevAlertById.get(hook.hookRequestId);
          if (prev !== undefined) return prev;
          return {
            hookRequestId: hook.hookRequestId,
            runId: hook.runId,
            unitId: hook.unitId,
            kind: hook.hookKind,
            payload: hook.payload,
            deadlineTs: hook.deadlineTs,
          };
        });
        const alertsStable =
          alerts.length === state.alerts.length && alerts.every((a, i) => state.alerts[i] === a);

        // --- ticker ring buffer ----------------------------------------------
        let eventSeq = state.meta.eventSeq;
        let events = state.events;
        if (routing.tickerEntries.length > 0) {
          const appended = routing.tickerEntries.map((entry) => ({ id: `evt-${(eventSeq += 1)}`, ...entry }));
          events = [...state.events, ...appended].slice(-EVENT_RING_CAP);
        }

        // --- pings -------------------------------------------------------------
        let pings = state.meta.pings.filter((p) => input.nowMs - p.startedAt < PING_TTL_MS);
        if (pings.length === state.meta.pings.length && routing.pingSources.length === 0) {
          pings = state.meta.pings;
        }
        if (routing.pingSources.length > 0) {
          const existing = new Set(pings.map((p) => p.id));
          const added: PingRecord[] = [];
          for (const source of routing.pingSources) {
            if (existing.has(source.key)) continue;
            const pos = positions[source.entityId];
            if (pos === undefined) continue;
            added.push({ id: source.key, x: pos.x, y: pos.y, tone: source.tone, startedAt: input.nowMs });
          }
          if (added.length > 0) pings = [...pings, ...added];
        }

        // --- selection pruning ------------------------------------------------
        let selection = state.selection;
        const pruned = selection.ids.filter((id) => units[id] !== undefined || tasks[id] !== undefined);
        if (pruned.length !== selection.ids.length) {
          selection = { ...selection, ids: pruned };
        }

        // --- meta / resources ---------------------------------------------------
        let busyCount = 0;
        let tokensBurned = 0;
        let costUsd = 0;
        for (const view of input.units) {
          if (BUSY_STATES.has(view.state)) busyCount += 1;
          tokensBurned += tokenTotal(view);
          costUsd += view.cost.totalUsd;
        }
        const tasksDone = input.tasks.filter((t) => t.state === 'done').length;
        const resources: ResourcesSnapshot = {
          unitCount: input.units.length,
          busyCount,
          idleCount: input.units.filter((u) => u.state === 'idle').length,
          tokensBurned,
          costUsd: Math.round(costUsd * 100) / 100,
          tasksDone,
          tasksTotal: input.tasks.length,
          alertCount: alerts.length,
        };

        const world: WorldSlice =
          unitsChanged ||
          tasksChanged ||
          !unitIdsStable ||
          !taskIdsStable ||
          positionsChanged ||
          routing.runToUnit !== prevWorld.runToUnit ||
          rallyPoints !== prevWorld.rallyPoints ||
          layout !== prevWorld.layout
            ? {
                units,
                unitIds: unitIdsStable ? prevWorld.unitIds : unitIds,
                tasks,
                taskIds: taskIdsStable ? prevWorld.taskIds : taskIds,
                positions,
                layout,
                bounds: WORLD,
                runToUnit: routing.runToUnit,
                rallyPoints,
              }
            : prevWorld;

        return {
          world,
          selection,
          events,
          alerts: alertsStable ? state.alerts : alerts,
          meta: {
            ...state.meta,
            resources,
            simTimeMs: input.nowMs,
            simStartMs: state.meta.simStartMs === 0 ? input.nowMs - input.tickIndex * 250 : state.meta.simStartMs,
            tickIndex: input.tickIndex,
            connection: routing.connected ? 'connected' : state.meta.connection,
            paused: input.paused,
            pings,
            eventSeq,
          },
        };
      });
    },

    // --- selection -----------------------------------------------------------
    select(ids) {
      set((state) => ({ selection: { ...state.selection, ids: [...ids] } }));
    },
    clickSelect(id, shift) {
      set((state) => ({
        selection: { ...state.selection, ids: applyClickSelection(state.selection.ids, id, shift) },
      }));
    },
    marqueeSelect(ids, shift) {
      set((state) => ({
        selection: { ...state.selection, ids: applyMarqueeSelection(state.selection.ids, ids, shift) },
      }));
    },
    clearSelection() {
      set((state) =>
        state.selection.ids.length === 0 ? state : { selection: { ...state.selection, ids: [] } },
      );
    },
    assignGroup(digit) {
      set((state) => ({
        selection: {
          ...state.selection,
          groups: { ...state.selection.groups, [digit]: [...state.selection.ids] },
        },
      }));
    },
    recallGroup(digit) {
      const state = get();
      const group = (state.selection.groups[digit] ?? []).filter(
        (id) => state.world.units[id] !== undefined || state.world.tasks[id] !== undefined,
      );
      if (group.length === 0) return;
      if (sameSelectionSet(state.selection.ids, group)) {
        // Recall-again centers the camera on the group centroid (SPEC §5).
        const points = group
          .map((id) => state.world.positions[id])
          .filter((p): p is Vec2 => p !== undefined);
        if (points.length > 0) {
          const centroid = {
            x: points.reduce((acc, p) => acc + p.x, 0) / points.length,
            y: points.reduce((acc, p) => acc + p.y, 0) / points.length,
          };
          set({ camera: centerOn(state.camera, centroid, state.world.bounds) });
        }
        return;
      }
      set({ selection: { ...state.selection, ids: group } });
    },
    cycleIdle() {
      const state = get();
      const idle = state.world.unitIds.filter((id) => state.world.units[id]?.view.state === 'idle');
      if (idle.length === 0) return;
      const cursor = (state.meta.idleCycleCursor + 1) % idle.length;
      const id = idle[cursor];
      if (id === undefined) return;
      const pos = state.world.positions[id];
      set({
        selection: { ...state.selection, ids: [id] },
        meta: { ...state.meta, idleCycleCursor: cursor },
        ...(pos !== undefined ? { camera: centerOn(state.camera, pos, state.world.bounds) } : {}),
      });
    },
    escape() {
      // Esc cascade: steer modal → inspector → targeting → selection (SPEC §5;
      // the modal closes WITHOUT clearing the selection — HUD-phase contract).
      const state = get();
      if (state.meta.steerOpen) {
        set({ meta: { ...state.meta, steerOpen: false } });
        return;
      }
      if (state.meta.inspectorUnitId !== null) {
        set({ meta: { ...state.meta, inspectorUnitId: null } });
        return;
      }
      if (state.meta.targeting !== null) {
        set({ meta: { ...state.meta, targeting: null } });
        return;
      }
      get().clearSelection();
    },

    // --- camera ----------------------------------------------------------------
    setCamera(camera) {
      set((state) => ({ camera: clampCamera(camera, state.world.bounds) }));
    },
    panBy(dxScreen, dyScreen) {
      set((state) => ({ camera: panByScreen(state.camera, dxScreen, dyScreen, state.world.bounds) }));
    },
    zoomAt(screenPoint, deltaY) {
      set((state) => ({
        camera: zoomAtPoint(state.camera, screenPoint, deltaY, state.meta.viewport, state.world.bounds),
      }));
    },
    centerOnPoint(point) {
      set((state) => ({ camera: centerOn(state.camera, point, state.world.bounds) }));
    },
    centerOnEntity(entityId) {
      const state = get();
      const pos = state.world.positions[entityId];
      if (pos === undefined) return;
      set({ camera: centerOn(state.camera, pos, state.world.bounds) });
    },
    jumpToLatestAlert() {
      const state = get();
      const latest = state.alerts[state.alerts.length - 1];
      if (latest === undefined) return;
      const pos = state.world.positions[latest.unitId];
      if (pos === undefined) return;
      set({ camera: centerOn(state.camera, pos, state.world.bounds) });
    },

    // --- transient UI ------------------------------------------------------------
    setViewport(size) {
      set((state) =>
        state.meta.viewport.width === size.width && state.meta.viewport.height === size.height
          ? state
          : { meta: { ...state.meta, viewport: size } },
      );
    },
    setMarquee(rect) {
      set((state) => ({ meta: { ...state.meta, marquee: rect } }));
    },
    openInspector(unitId) {
      set((state) => ({ meta: { ...state.meta, inspectorUnitId: unitId } }));
    },
    closeInspector() {
      set((state) => ({ meta: { ...state.meta, inspectorUnitId: null } }));
    },
    openSteer() {
      set((state) => ({ meta: { ...state.meta, steerOpen: true } }));
    },
    closeSteer() {
      set((state) => ({ meta: { ...state.meta, steerOpen: false } }));
    },
    setTargeting(mode) {
      set((state) => ({ meta: { ...state.meta, targeting: mode } }));
    },
    setRally(unitIds, point) {
      set((state) => {
        const rallyPoints = { ...state.world.rallyPoints };
        const positions = { ...state.world.positions };
        unitIds.forEach((id, index) => {
          const unit = state.world.units[id];
          if (unit === undefined || unit.view.taskId !== null) return;
          const offset = rallyOffset(index);
          const target = clampToWorld({ x: point.x + offset.x, y: point.y + offset.y });
          rallyPoints[id] = target;
          positions[id] = target;
        });
        return { world: { ...state.world, rallyPoints, positions } };
      });
    },
    setPaused(paused) {
      set((state) => (state.meta.paused === paused ? state : { meta: { ...state.meta, paused } }));
    },
    pushEvent(text, severity, entityId) {
      set((state) => {
        const eventSeq = state.meta.eventSeq + 1;
        const entry: TickerEntry = {
          id: `evt-${eventSeq}`,
          ts: state.meta.simTimeMs,
          severity,
          text,
          ...(entityId !== undefined ? { entityId } : {}),
        };
        return {
          events: [...state.events, entry].slice(-EVENT_RING_CAP),
          meta: { ...state.meta, eventSeq },
        };
      });
    },
    addPing(entityId, tone) {
      set((state) => {
        const pos = state.world.positions[entityId];
        if (pos === undefined) return state;
        const pingSeq = state.meta.pingSeq + 1;
        const ping: PingRecord = {
          id: `ping-ui-${pingSeq}`,
          x: pos.x,
          y: pos.y,
          tone,
          startedAt: state.meta.simTimeMs,
        };
        return { meta: { ...state.meta, pingSeq, pings: [...state.meta.pings, ping] } };
      });
    },
  }));
}

// ---------------------------------------------------------------------------
// Backend binding: frames + sim views → ONE store commit per tick batch
// ---------------------------------------------------------------------------

/** Order surface used by the input grammar and command card (SPEC §5/§8). */
export interface Orders {
  /** Right-click task: `session.start` with sessionId=<unitId> and `task:<id>` prompt. */
  dispatchToTask(unitIds: readonly string[], taskId: string): void;
  /** Right-click ground: reposition idle units (UI-local rally). */
  rally(unitIds: readonly string[], point: Vec2): void;
  /** `/abort` via session.message. */
  abort(unitIds: readonly string[]): void;
  /** Any other prompt via session.message. */
  steer(unitIds: readonly string[], prompt: string): void;
  /** hook.decision frames. */
  decide(hookRequestId: string, decision: 'allow' | 'deny'): void;
  /** Clone: session.start WITHOUT sessionId spawns a fresh unit. */
  clone(agent: string, workspaceId?: string): void;
  /** Retire: decommission idle units — they despawn from the world (SPEC §8). */
  retire(unitIds: readonly string[]): void;
  /** Pause: hold working units' runs mid-state (sim operator verb). */
  pauseUnits(unitIds: readonly string[]): void;
  /** Resume: release operator holds. */
  resumeUnits(unitIds: readonly string[]): void;
  /** Prioritize: bump a task to the front of the idle-assignment queue. */
  prioritize(taskId: string): void;
  /** Pause/resume the simulation (global command card). */
  toggleSim(): void;
}

export interface BackendBinding {
  /** Drain buffered frames + sim views into one store commit. */
  flush(): void;
  orders: Orders;
  dispose(): void;
}

/**
 * Subscribe the store to a MockBackend. Frames are buffered; a microtask
 * flush coalesces every synchronous frame burst (one auto-tick) into a single
 * `commitTick`. Manual `sim.tick(n)` callers (the §9 test hook, orders) call
 * `flush()` synchronously for deterministic timing.
 */
export function bindBackendToStore(store: CommanderStore, backend: MockBackend): BackendBinding {
  const sim = backend.sim;
  let pending: ServerFrame[] = [];
  let scheduled = false;
  let disposed = false;
  let lastTick = -1;

  const flush = (): void => {
    if (disposed) return;
    if (pending.length === 0 && sim.tickIndex === lastTick) return;
    const frames = pending;
    pending = [];
    lastTick = sim.tickIndex;
    store.getState().commitTick({
      frames,
      units: sim.listUnitViews(),
      tasks: sim.listTaskViews(),
      hooks: sim.listPendingHooks(),
      nowMs: sim.now(),
      tickIndex: sim.tickIndex,
      paused: sim.paused,
    });
  };

  const unsubscribe = backend.onFrame((frame) => {
    pending.push(frame);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        flush();
      });
    }
  });

  // Initial world ingest (boot world exists before the first tick).
  flush();

  const orders: Orders = {
    dispatchToTask(unitIds, taskId) {
      const state = store.getState();
      const ready = unitIds.filter((id) => state.world.units[id]?.view.runId === null);
      if (ready.length === 0) {
        state.pushEvent('Dispatch ignored — no ready units in selection', 'warn');
        return;
      }
      for (const unitId of ready) {
        const unit = state.world.units[unitId];
        if (unit === undefined) continue;
        backend.send({
          type: 'session.start',
          agent: unit.view.agent,
          model: unit.view.model,
          prompt: `Capture the objective. task:${taskId}`,
          sessionId: unitId,
          workspaceId: unit.view.workspaceId,
        });
      }
      flush();
    },
    rally(unitIds, point) {
      const state = store.getState();
      const idle = unitIds.filter((id) => state.world.units[id]?.view.state === 'idle');
      if (idle.length === 0) return;
      state.setRally(idle, point);
      store.getState().pushEvent(`Rally order — ${idle.length} unit(s) repositioning`, 'info');
    },
    abort(unitIds) {
      const state = store.getState();
      const active = unitIds.filter((id) => state.world.units[id]?.view.runId !== null);
      for (const unitId of active) {
        backend.send({ type: 'session.message', sessionId: unitId, prompt: '/abort' });
      }
      flush();
    },
    steer(unitIds, prompt) {
      for (const unitId of unitIds) {
        backend.send({ type: 'session.message', sessionId: unitId, prompt });
      }
      flush();
    },
    decide(hookRequestId, decision) {
      backend.send({ type: 'hook.decision', hookRequestId, decision });
      flush();
    },
    clone(agent, workspaceId) {
      backend.send({
        type: 'session.start',
        agent,
        prompt: 'Reinforce the fleet',
        ...(workspaceId !== undefined ? { workspaceId } : {}),
      });
      flush();
      store.getState().pushEvent(`Reinforcement requested — new ${agent} unit inbound`, 'info');
    },
    retire(unitIds) {
      const state = store.getState();
      const ready = unitIds.filter((id) => state.world.units[id]?.view.runId === null);
      if (ready.length === 0) {
        state.pushEvent('Retire ignored — units must be idle to decommission', 'warn');
        return;
      }
      for (const id of ready) {
        // Despawn marker first (the position vanishes with the unit): an
        // expand-and-fade ping marks where the veteran stood (SPEC §8 fade).
        store.getState().addPing(id, 'info');
        sim.retireUnit(id);
      }
      flush();
    },
    pauseUnits(unitIds) {
      for (const id of unitIds) {
        sim.pauseUnit(id);
      }
      flush();
    },
    resumeUnits(unitIds) {
      for (const id of unitIds) {
        sim.resumeUnit(id);
      }
      flush();
    },
    prioritize(taskId) {
      sim.prioritizeTask(taskId);
      flush();
    },
    toggleSim() {
      if (sim.paused) {
        sim.resume();
        store.getState().setPaused(false);
        store.getState().pushEvent('Simulation resumed', 'info');
      } else {
        sim.pause();
        store.getState().setPaused(true);
        store.getState().pushEvent('Simulation paused', 'info');
      }
    },
  };

  return {
    flush,
    orders,
    dispose() {
      disposed = true;
      unsubscribe();
    },
  };
}

// Re-exports for convenience (screen/world transforms used by input + HUD).
export { WORLD, worldToScreen };
export type { CameraState, Size, Vec2 };
