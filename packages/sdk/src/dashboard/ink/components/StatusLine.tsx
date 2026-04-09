/**
 * StatusLine — orchestration status line component for the Babysitter TUI.
 *
 * Exports:
 *   - formatElapsed(ms)                   — pure helper
 *   - phaseToColorKey(phase)              — pure helper
 *   - formatCostForStatus(cost)           — pure helper
 *   - truncateRunId(id)                   — pure helper
 *   - formatStatusSegments(status, colors) — pure function
 *   - StatusLine                          — React component
 */

import React from "react";
import { useInk } from "../contexts/InkContext.js";
import { useTheme } from "../hooks/useTheme.js";
import type { OrchestrationStatus, OrchestrationPhase, ThemeColors } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusSegment {
  text: string;
  colorKey: string;
  bold?: boolean;
}

export interface StatusLineProps {
  status: OrchestrationStatus;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes}m`;
}

export function phaseToColorKey(phase: OrchestrationPhase): string {
  switch (phase) {
    case "complete":
      return "success";
    case "failed":
      return "error";
    case "waiting":
      return "warning";
    case "planning":
    case "executing":
    case "verifying":
      return "primary";
  }
}

export function formatCostForStatus(cost: number): string {
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function truncateRunId(id: string): string {
  if (id.length <= 12) return id;
  return id.slice(0, 12);
}

export function formatStatusSegments(
  status: OrchestrationStatus,
  _colors: ThemeColors,
): StatusSegment[] {
  const segments: StatusSegment[] = [];

  // Phase segment (bold)
  segments.push({
    text: status.phase.toUpperCase(),
    colorKey: phaseToColorKey(status.phase),
    bold: true,
  });

  // Run ID segment
  segments.push({
    text: truncateRunId(status.runId),
    colorKey: "muted",
  });

  // Iteration segment
  segments.push({
    text: `iter:${status.iteration}`,
    colorKey: "foreground",
  });

  // Effects segment
  segments.push({
    text: `effects:${status.resolvedEffects}/${status.totalEffects}`,
    colorKey: status.pendingEffects > 0 ? "warning" : "success",
  });

  // Elapsed segment
  segments.push({
    text: formatElapsed(status.elapsedMs),
    colorKey: "muted",
  });

  // Optional: token usage
  if (status.tokenUsage) {
    segments.push({
      text: `tokens:${status.tokenUsage.total}`,
      colorKey: "muted",
    });
  }

  // Optional: cost
  if (status.cost !== undefined) {
    segments.push({
      text: formatCostForStatus(status.cost),
      colorKey: "muted",
    });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusLine({ status }: StatusLineProps): React.JSX.Element {
  const { Box, Text } = useInk();
  const { colors } = useTheme();
  const segments = formatStatusSegments(status, colors);

  return React.createElement(
    Box as React.ComponentType<Record<string, unknown>>,
    { flexDirection: "row", gap: 1 },
    ...segments.map((seg, idx) =>
      React.createElement(
        Text as React.ComponentType<Record<string, unknown>>,
        {
          key: idx,
          color: (colors as unknown as Record<string, string>)[seg.colorKey] ?? colors.foreground,
          bold: seg.bold ?? false,
        },
        seg.text,
      ),
    ),
  );
}
