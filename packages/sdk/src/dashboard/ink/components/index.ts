/**
 * Barrel export for all Babysitter TUI Ink components.
 *
 * Import from this module rather than from individual component files to keep
 * import paths stable as the component tree grows.
 */

export { StatusBar } from "./StatusBar.js";
export type { StatusBarProps } from "./StatusBar.js";

export { MessagePane } from "./MessagePane.js";
export type { MessagePaneProps } from "./MessagePane.js";

export { PromptBar } from "./PromptBar.js";
export type { PromptBarProps } from "./PromptBar.js";

export { Message } from "./Message.js";
export type { MessageProps } from "./Message.js";

export { RunningIndicator } from "./RunningIndicator.js";
export type { RunningIndicatorProps } from "./RunningIndicator.js";
