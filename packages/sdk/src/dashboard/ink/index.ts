/**
 * Babysitter TUI — public API.
 *
 * Only exports types and the async entry point so that importing this module
 * from CJS code does not trigger any ESM resolution at require() time.
 */

// Types
export type {
  MessageKind,
  VerbosityLevel,
  RunStatus,
  TuiMessage,
  TuiMessageContent,
  UserMessageContent,
  AssistantMessageContent,
  ToolCallContent,
  SubagentContent,
  SystemContent,
  ErrorContent,
  SessionState,
  Theme,
  ThemeColors,
  TuiConfig,
} from "./types.js";

// Session actions (useful for consumers that dispatch externally)
export type { SessionAction } from "./contexts/SessionContext.js";

// Hook result types
export type { UseSessionResult } from "./hooks/useSession.js";
export type { UseClockResult } from "./hooks/useClock.js";

// Runtime entry point
export { createTuiSession, type TuiSession } from "./render.js";
