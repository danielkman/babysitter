/**
 * Shared types for the Babysitter TUI layer.
 *
 * All Ink/React imports are kept out of this file so it can be imported from
 * CJS modules without triggering ESM dynamic-import resolution at require time.
 */

// ---------------------------------------------------------------------------
// Enumerations / union types
// ---------------------------------------------------------------------------

export type MessageKind =
  | "user"
  | "assistant"
  | "tool_call"
  | "subagent"
  | "system"
  | "error";

export type VerbosityLevel = "minimal" | "normal" | "verbose";

export type RunStatus =
  | "idle"
  | "running"
  | "waiting_effect"
  | "complete"
  | "failed";

// ---------------------------------------------------------------------------
// Message content (discriminated union)
// ---------------------------------------------------------------------------

export interface UserMessageContent {
  readonly kind: "user";
  readonly text: string;
}

export interface AssistantMessageContent {
  readonly kind: "assistant";
  readonly text: string;
  /** Whether the assistant is still streaming this message. */
  readonly streaming?: boolean;
}

export interface ToolCallContent {
  readonly kind: "tool_call";
  readonly toolName: string;
  readonly input: unknown;
  readonly output?: unknown;
  /** Elapsed milliseconds for the tool call (once completed). */
  readonly elapsedMs?: number;
}

export interface SubagentContent {
  readonly kind: "subagent";
  readonly agentId: string;
  readonly label: string;
  readonly status: RunStatus;
  readonly childMessages?: readonly TuiMessage[];
}

export interface SystemContent {
  readonly kind: "system";
  readonly text: string;
}

export interface ErrorContent {
  readonly kind: "error";
  readonly message: string;
  readonly detail?: string;
}

export type TuiMessageContent =
  | UserMessageContent
  | AssistantMessageContent
  | ToolCallContent
  | SubagentContent
  | SystemContent
  | ErrorContent;

// ---------------------------------------------------------------------------
// TuiMessage
// ---------------------------------------------------------------------------

export interface TuiMessage {
  /** Unique message identifier (e.g. ULID). */
  readonly id: string;
  /** ISO-8601 timestamp string. */
  readonly timestamp: string;
  /** Minimum verbosity level at which this message should be rendered. */
  readonly verbosity: VerbosityLevel;
  readonly content: TuiMessageContent;
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export interface SessionState {
  readonly runId: string | null;
  readonly status: RunStatus;
  readonly messages: readonly TuiMessage[];
  readonly verbosity: VerbosityLevel;
  /** Current prompt input buffer (controlled by PromptBar). */
  readonly inputBuffer: string;
  /** Whether the prompt bar is focused / active. */
  readonly inputActive: boolean;
  /** Wall-clock ms at which the current run started (null if not running). */
  readonly runStartedAt: number | null;
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export interface ThemeColors {
  /** Primary accent — used for highlights, selections, cursor. */
  readonly primary: string;
  /** Secondary accent. */
  readonly secondary: string;
  /** Muted / dim foreground for timestamps, metadata. */
  readonly muted: string;
  /** Error / failure color. */
  readonly error: string;
  /** Warning color. */
  readonly warning: string;
  /** Success / complete color. */
  readonly success: string;
  /** Default foreground text color. */
  readonly foreground: string;
  /** Background color (used where supported). */
  readonly background: string;
  /** Border / separator color. */
  readonly border: string;
  /** Tool-call highlight color. */
  readonly toolCall: string;
  /** Subagent label color. */
  readonly subagent: string;
}

export interface Theme {
  readonly name: string;
  readonly colors: ThemeColors;
}

// ---------------------------------------------------------------------------
// TUI configuration
// ---------------------------------------------------------------------------

export interface TuiConfig {
  /** Run ID to bind the TUI to (optional — can be set post-mount). */
  readonly runId?: string;
  /** Initial verbosity level. Defaults to "normal". */
  readonly verbosity?: VerbosityLevel;
  /** Theme override. Defaults to neonDark. */
  readonly theme?: Theme;
  /** Whether to render to stderr instead of stdout. Defaults to true. */
  readonly useStderr?: boolean;
}
