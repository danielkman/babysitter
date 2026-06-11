/**
 * Microagent interface (SPEC §8): contextual command generation and
 * deterministic procedural icon generation. The mock implementation is
 * rule-based/sync; a future LLM microagent implements the same surface
 * (Promise-able later) without UI changes.
 */

export type IconSpec = { svg: string; palette: string[] };

export interface SelectionSummary {
  count: number;
  kinds: Array<'unit' | 'task'>;
  /** Distinct unit visual states in the selection (SPEC §3). */
  states: string[];
  /** Distinct adapters (factions) in the selection. */
  adapters: string[];
  /** Distinct task states in the selection. */
  taskStates: string[];
}

export interface AlertSummary {
  hookRequestId: string;
  unitId: string;
  kind: string;
}

export interface FleetSnapshot {
  totalUnits: number;
  idleUnits: number;
  busyUnits: number;
  pendingAlerts: number;
  simPaused: boolean;
}

export interface CommandContext {
  selection: SelectionSummary;
  alerts: AlertSummary[];
  fleet: FleetSnapshot;
}

export interface IconContext {
  entityId: string;
  kind: 'unit' | 'task';
  /** Adapter faction (units) — keys the palette. */
  adapter?: string;
  /** Task kind (tasks) — keys the glyph badge. */
  taskKind?: string;
}

/** UI/sim actions a command cell can trigger (all visible in v1, SPEC §8). */
export type CommandIntent =
  | { kind: 'dispatch-mode' }
  | { kind: 'rally-mode' }
  | { kind: 'clone' }
  | { kind: 'retire' }
  | { kind: 'steer' }
  | { kind: 'pause-unit' }
  | { kind: 'inspect' }
  | { kind: 'abort' }
  | { kind: 'approve' }
  | { kind: 'deny' }
  | { kind: 'assign-best-idle' }
  | { kind: 'prioritize' }
  | { kind: 'cancel-task' }
  | { kind: 'select-all-idle' }
  | { kind: 'jump-to-alert' }
  | { kind: 'toggle-sim' };

export interface CommandSpec {
  id: string;
  label: string;
  hotkey?: string;
  icon: IconSpec;
  intent: CommandIntent;
  enabled: boolean;
  tooltip: string;
  severity?: 'normal' | 'danger' | 'urgent';
}

export interface Microagent {
  /** Selection state → command set; mixed selections get the intersection; ≤12. */
  generateCommands(ctx: CommandContext): CommandSpec[];
  /** Deterministic per entity: same id ⇒ byte-identical SVG. */
  generateIcon(ctx: IconContext): IconSpec;
}
