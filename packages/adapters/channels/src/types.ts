// Data interfaces for the channels mini-framework — the package's typed contract.
//
// Ported from the source `types.d.ts`. The ambient `.d.ts` declared both the data
// shapes AND the function/class signatures; in TS the function/class signatures
// live with (and are inferred from) their implementation modules, so this module
// keeps ONLY the data interfaces + the small structural seams the impl modules
// reference (RunOptions / McpServerConfig kept as the package's OWN structural
// types — never imported from `@a5c-ai/adapters`).

export interface ChannelEvent {
  /** Stable dedup id for this event. */
  id: string;
  /** Text Claude sees inside <channel>…</channel>. */
  content: string;
  /** Identifier-keyed channel attributes ([A-Za-z0-9_]+). */
  meta: Record<string, string>;
  /** Raw upstream object (so declarative dot-path filters can match). */
  payload: Record<string, unknown>;
  /** Origin coordinates a reply needs to reach back to. */
  routing: Record<string, unknown>;
}

export interface PollContext {
  source: Record<string, unknown>;
  state: { cursor: unknown; seen: string[] };
  http: (url: string | URL, opts?: Record<string, unknown>) => Promise<unknown>;
  log: (...args: unknown[]) => void;
  now: Date;
}

export interface PollResult {
  events: ChannelEvent[];
  state: { cursor: unknown; seen?: string[] };
}

export interface ReplyArgs {
  routing: Record<string, unknown>;
  text: string;
  source: Record<string, unknown>;
  http: (url: string | URL, opts?: Record<string, unknown>) => Promise<unknown>;
}

export interface ReplyResult {
  ok: boolean;
  ref?: string;
}

export interface Backend {
  type: string;
  validateConfig?: (source: Record<string, unknown>) => string[];
  init?: (source: Record<string, unknown>) => void | Promise<void>;
  poll: (ctx: PollContext) => Promise<PollResult>;
  reply: (a: ReplyArgs) => Promise<ReplyResult>;
}

export interface ReplyToken {
  sourceId: string;
  backendType: string;
  routing: Record<string, unknown>;
}

/** Effective spawn config (global defaults merged with per-source overrides). */
export interface SpawnConfig {
  agent?: string;
  mode?: 'headless' | 'interactive';
  approvalMode?: 'yolo' | 'prompt' | 'deny';
  selfMcpName?: string;
  maxConcurrent?: number;
  model?: string;
  cwd?: string;
  systemPrompt?: string;
  env?: Record<string, string>;
  promptTemplate?: string;
}

/** Adapters McpServerConfig (the self-association entry). */
export interface McpServerConfig {
  name: string;
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

/** Adapters RunOptions produced by `buildSpawnRunOptions` (SPEC §10.2). The
 *  package's OWN structural type — deliberately NOT imported from the adapters
 *  SDK so `buildSpawnRunOptions` stays a pure mapping duck-typed by `client.run()`. */
export interface RunOptions {
  agent: string;
  prompt: string;
  mcpServers: McpServerConfig[];
  nonInteractive?: boolean;
  interactive?: boolean;
  cwd?: string;
  model?: string;
  approvalMode?: 'yolo' | 'prompt' | 'deny';
  systemPrompt?: string;
  env?: Record<string, string>;
}

// --- Filter DSL ------------------------------------------------------------

/** The leaf-clause operators the filter engine understands (SPEC §4). */
export type FilterOp =
  | 'eq'
  | 'ne'
  | 'in'
  | 'nin'
  | 'includes'
  | 'contains'
  | 'regex'
  | 'exists'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

/** A leaf clause: a dot-path `field`, an `op`, a comparison `value`. */
export interface FilterLeaf {
  field?: string;
  op?: FilterOp;
  value?: unknown;
  ignoreCase?: boolean;
}

/** A combinator clause: `all` (AND), `any` (OR), or `not` (negation). */
export type FilterCombinator =
  | { all?: FilterSpec[] }
  | { any?: FilterSpec[] }
  | { not?: FilterSpec };

/** A filter spec is either a leaf clause or a combinator (recursively). */
export type FilterSpec = FilterLeaf | FilterCombinator;

// --- Config ----------------------------------------------------------------

/** A normalized source after `loadConfig`: defaults applied + spawn merged. */
export interface NormalizedSource {
  id: unknown;
  backend: unknown;
  pollIntervalSeconds: number;
  auth: Record<string, unknown>;
  config: Record<string, unknown>;
  filter: unknown;
  routing: Record<string, unknown>;
  onEvent: 'emit' | 'spawn' | 'both';
  spawn: SpawnConfig;
  baseDir: string;
}

/** The validated channels config returned by `loadConfig`. */
export interface ChannelsConfig {
  server: {
    name?: unknown;
    instructions?: unknown;
    permissionRelay: boolean;
    replySecret?: string;
  };
  state: {
    dir?: unknown;
    maxSeenPerSource: number;
  };
  defaults: { pollIntervalSeconds: number };
  spawn: SpawnConfig;
  sources: NormalizedSource[];
  baseDir: string;
}
