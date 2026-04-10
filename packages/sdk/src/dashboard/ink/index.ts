/**
 * Babysitter TUI — public API.
 *
 * Only exports types and the async entry point so that importing this module
 * from CJS code does not trigger any ESM resolution at require() time.
 */

// Types
export type {
  ViewName,
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
  EffectKind,
  TuiEffectStatus,
  EffectSummary,
  TaskSummary,
  BreakpointState,
  OrchestrationPhase,
  OrchestrationStatus,
  TokenUsage,
} from "./types.js";

// Session actions (useful for consumers that dispatch externally)
export type { SessionAction } from "./contexts/SessionContext.js";

// Navigation actions and state
export type { NavigationAction, NavigationState } from "./contexts/NavigationContext.js";

// Hook result types
export type { UseSessionResult } from "./hooks/useSession.js";
export type { UseClockResult } from "./hooks/useClock.js";
export type { UseRunScannerResult } from "./hooks/useRunScanner.js";

// Data layer types
export type { RunSummary, RunDetail } from "./data/runScanner.js";

// Message rendering helpers (pure functions)
export {
  truncateOutput,
  formatTimestamp,
  formatElapsedCompact,
  formatElapsedClock,
  briefArgs,
  getMessageIcon,
  getMessageColor,
  shouldShowTimestamp,
  formatToolCallSummary,
  formatShellOutput,
  formatToolOutput,
  getEffectIcon,
  getEffectStatusColor,
  buildEffectTree,
  derivePhase,
  aggregateOrchestrationStatus,
  groupPendingEffects,
  summarizePendingGroups,
} from "./helpers.js";

// StatusLine pure functions
export {
  formatElapsed,
  phaseToColorKey,
  formatCostForStatus,
  formatStatusSegments,
} from "./components/StatusLine.js";

// StatusLine types
export type { StatusSegment, StatusLineProps } from "./components/StatusLine.js";

// Phase 3 types
export type { PendingGroupSummary } from "./helpers.js";

// Phase 4: Breakpoint & Interaction UI helpers
export {
  parseSlashCommand,
  isValidSlashCommand,
  getSlashCompletions,
  formatBreakpointPrompt,
  getBreakpointStatusColor,
  formatBreakpointOptions,
  createInputHistory,
  addToHistory,
  navigateHistory,
} from "./helpers.js";

// Phase 4 types
export type { SlashCommandDef, InputHistory } from "./helpers.js";

// Phase 6: Cost tracking helpers
export {
  formatCostRate,
  estimateRemainingCost,
  formatCostSummary,
} from "./helpers.js";
export type { CostSummary } from "./helpers.js";

// Phase 6: Resume dashboard helpers
export {
  getResumableRuns,
  rankRunsForResume,
  formatRunSummaryLine,
} from "./helpers.js";

// Phase 6: Structured status view helpers
export {
  buildStatusSections,
  formatStatusSection,
} from "./helpers.js";
export type { StatusSection, StatusEntry } from "./helpers.js";

// Component helpers — RunListTable
export {
  stateSymbol,
  stateColor,
  truncateId,
  truncateProcess,
  formatRelativeTimestamp,
} from "./components/RunListTable.js";

// Component helpers — MessagePane
export { filterMessages, VERBOSITY_ALLOWED } from "./components/MessagePane.js";

// Component helpers — PromptBar
export {
  getSlashHints,
  countLines,
  SLASH_COMMANDS,
} from "./components/PromptBar.js";
export type { SlashCommand as PromptBarSlashCommand } from "./components/PromptBar.js";

// Component helpers — StatusBar
export {
  formatTokenCount,
  statusToIndicator,
  statusToColor,
} from "./components/StatusBar.js";

// Chat context
export type { ChatContextValue, ChatProviderProps } from "./contexts/ChatContext.js";

// Runtime entry point
export { createTuiSession, type TuiSession } from "./render.js";
