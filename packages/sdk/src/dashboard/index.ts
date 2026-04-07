/**
 * Dashboard — terminal UI components for babysitter (GAP-UX-001 family).
 */
export * from "./components";
export * from "./colors";
export { parseDiff, type DiffHunk, type DiffLine, type DiffLineType } from "./diffParser";
export { isTTY, writeStatus, clearStatus } from "./render";
