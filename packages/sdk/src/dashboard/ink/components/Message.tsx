/**
 * Message — polymorphic renderer for a single TuiMessage.
 *
 * Dispatches on message.content.kind and renders the appropriate sub-layout.
 * Tool calls are shown in collapsed form (expandable in a future iteration).
 * Subagent status uses renderStatusSymbol from the existing ANSI badge module,
 * but the ANSI escape codes are stripped so Ink can own the coloring.
 *
 * Box/Text are obtained from InkContext via useInk() — no prop drilling.
 */

import React from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useInk } from "../contexts/InkContext.js";
import { stripAnsi } from "../../colors.js";
import { renderStatusSymbol } from "../../components/StatusBadge.js";
import type { TuiMessage, RunStatus } from "../types.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MessageProps {
  message: TuiMessage;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map RunStatus → StatusBadge StatusType (they mostly align). */
function runStatusToBadgeStatus(
  status: RunStatus,
): "running" | "completed" | "failed" | "waiting" | "pending" {
  switch (status) {
    case "running":
      return "running";
    case "complete":
      return "completed";
    case "failed":
      return "failed";
    case "waiting_effect":
      return "waiting";
    case "idle":
      return "pending";
  }
}

/** Serialise an unknown tool input to a concise single-line string. */
function briefArgs(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") {
    const trimmed = input.slice(0, 60);
    return trimmed.length < input.length ? `${trimmed}…` : trimmed;
  }
  if (typeof input === "object") {
    try {
      const raw = JSON.stringify(input);
      const trimmed = raw.slice(0, 80);
      return trimmed.length < raw.length ? `${trimmed}…` : trimmed;
    } catch {
      return "[object]";
    }
  }
  return String(input).slice(0, 80);
}

// ---------------------------------------------------------------------------
// Sub-renderers (all obtain Box/Text via useInk)
// ---------------------------------------------------------------------------

function UserMessage({
  text,
  colors,
}: { text: string; colors: ReturnType<typeof useTheme>["colors"] }): React.JSX.Element {
  const { Box, Text } = useInk();
  return React.createElement(
    Box as React.ComponentType<Record<string, unknown>>,
    { flexDirection: "row", gap: 1 },
    React.createElement(
      Text as React.ComponentType<Record<string, unknown>>,
      { color: colors.primary, bold: true },
      "You:",
    ),
    React.createElement(
      Text as React.ComponentType<Record<string, unknown>>,
      { color: colors.foreground, wrap: "wrap" },
      text,
    ),
  );
}

function AssistantMessage({
  text,
  streaming,
  colors,
}: {
  text: string;
  streaming?: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
}): React.JSX.Element {
  const { Box, Text } = useInk();
  return React.createElement(
    Box as React.ComponentType<Record<string, unknown>>,
    { flexDirection: "row", gap: 0 },
    streaming
      ? React.createElement(
          Text as React.ComponentType<Record<string, unknown>>,
          { color: colors.muted },
          "… ",
        )
      : null,
    React.createElement(
      Text as React.ComponentType<Record<string, unknown>>,
      { color: colors.foreground, wrap: "wrap" },
      text,
    ),
  );
}

function ToolCallMessage({
  toolName,
  input,
  elapsedMs,
  colors,
}: {
  toolName: string;
  input: unknown;
  elapsedMs?: number;
  colors: ReturnType<typeof useTheme>["colors"];
}): React.JSX.Element {
  const { Box, Text } = useInk();
  const args = briefArgs(input);
  const elapsed =
    elapsedMs !== undefined ? ` (${(elapsedMs / 1000).toFixed(1)}s)` : "";

  return React.createElement(
    Box as React.ComponentType<Record<string, unknown>>,
    { flexDirection: "row", gap: 1 },
    React.createElement(
      Text as React.ComponentType<Record<string, unknown>>,
      { color: colors.toolCall },
      "⚙",
    ),
    React.createElement(
      Text as React.ComponentType<Record<string, unknown>>,
      { color: colors.toolCall, bold: true },
      toolName,
    ),
    args
      ? React.createElement(
          Text as React.ComponentType<Record<string, unknown>>,
          { color: colors.muted },
          args,
        )
      : null,
    elapsed
      ? React.createElement(
          Text as React.ComponentType<Record<string, unknown>>,
          { color: colors.muted },
          elapsed,
        )
      : null,
  );
}

function SubagentMessage({
  label,
  status,
  agentId,
  colors,
}: {
  label: string;
  status: RunStatus;
  agentId: string;
  colors: ReturnType<typeof useTheme>["colors"];
}): React.JSX.Element {
  const { Box, Text } = useInk();
  const badgeStatus = runStatusToBadgeStatus(status);
  // renderStatusSymbol returns ANSI-colored text; strip codes so Ink owns style
  const symbol = stripAnsi(renderStatusSymbol(badgeStatus));

  return React.createElement(
    Box as React.ComponentType<Record<string, unknown>>,
    { flexDirection: "row", gap: 1 },
    React.createElement(
      Text as React.ComponentType<Record<string, unknown>>,
      { color: colors.subagent },
      "◈",
    ),
    React.createElement(
      Text as React.ComponentType<Record<string, unknown>>,
      { color: colors.subagent, bold: true },
      label,
    ),
    React.createElement(
      Text as React.ComponentType<Record<string, unknown>>,
      { color: colors.muted },
      agentId,
    ),
    React.createElement(
      Text as React.ComponentType<Record<string, unknown>>,
      { color: colors.muted },
      symbol,
    ),
  );
}

function SystemMessage({
  text,
  colors,
}: {
  text: string;
  colors: ReturnType<typeof useTheme>["colors"];
}): React.JSX.Element {
  const { Text } = useInk();
  return React.createElement(
    Text as React.ComponentType<Record<string, unknown>>,
    { color: colors.muted, dimColor: true, wrap: "wrap" },
    text,
  );
}

function ErrorMessage({
  message,
  detail,
  colors,
}: {
  message: string;
  detail?: string;
  colors: ReturnType<typeof useTheme>["colors"];
}): React.JSX.Element {
  const { Box, Text } = useInk();
  return React.createElement(
    Box as React.ComponentType<Record<string, unknown>>,
    { flexDirection: "column" },
    React.createElement(
      Box as React.ComponentType<Record<string, unknown>>,
      { flexDirection: "row", gap: 1 },
      React.createElement(
        Text as React.ComponentType<Record<string, unknown>>,
        { color: colors.error, bold: true },
        "✗",
      ),
      React.createElement(
        Text as React.ComponentType<Record<string, unknown>>,
        { color: colors.error, wrap: "wrap" },
        message,
      ),
    ),
    detail
      ? React.createElement(
          Text as React.ComponentType<Record<string, unknown>>,
          { color: colors.muted, wrap: "wrap" },
          detail,
        )
      : null,
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function Message({ message }: MessageProps): React.JSX.Element {
  const theme = useTheme();
  const { Box, Text } = useInk();
  const { colors } = theme;
  const { content } = message;

  let inner: React.ReactNode;

  switch (content.kind) {
    case "user":
      inner = React.createElement(UserMessage, {
        text: content.text,
        colors,
      });
      break;

    case "assistant":
      inner = React.createElement(AssistantMessage, {
        text: content.text,
        streaming: content.streaming,
        colors,
      });
      break;

    case "tool_call":
      inner = React.createElement(ToolCallMessage, {
        toolName: content.toolName,
        input: content.input,
        elapsedMs: content.elapsedMs,
        colors,
      });
      break;

    case "subagent":
      inner = React.createElement(SubagentMessage, {
        label: content.label,
        status: content.status,
        agentId: content.agentId,
        colors,
      });
      break;

    case "system":
      inner = React.createElement(SystemMessage, {
        text: content.text,
        colors,
      });
      break;

    case "error":
      inner = React.createElement(ErrorMessage, {
        message: content.message,
        detail: content.detail,
        colors,
      });
      break;

    default: {
      // Exhaustiveness guard — unknown future kinds render as plain text
      const _exhaustive: never = content;
      void _exhaustive;
      // Text is already destructured above (hooks must not be conditional)
      inner = React.createElement(
        Text as React.ComponentType<Record<string, unknown>>,
        { color: colors.muted },
        "[unknown message kind]",
      );
    }
  }

  return React.createElement(
    Box as React.ComponentType<Record<string, unknown>>,
    { paddingY: 0 },
    inner,
  );
}
