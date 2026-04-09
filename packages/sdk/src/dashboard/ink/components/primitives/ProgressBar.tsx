/**
 * ProgressBar — text-based progress bar primitive for the Babysitter TUI.
 *
 * Exports:
 *   - renderProgressBar(options) — pure function
 *   - ProgressBar — React component (uses InkContext + ThemeContext)
 */

import React from "react";
import { useInk } from "../../contexts/InkContext.js";
import { useTheme } from "../../hooks/useTheme.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressBarInput {
  progress: number;
  width?: number;
  fillChar?: string;
  emptyChar?: string;
  showLabel?: boolean;
}

export interface ProgressBarOutput {
  bar: string;
  label: string;
  filledCount: number;
}

export interface ProgressBarProps extends ProgressBarInput {}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 20;
const DEFAULT_FILL = "\u2588"; // "█"
const DEFAULT_EMPTY = "\u2591"; // "░"

// ---------------------------------------------------------------------------
// Pure function
// ---------------------------------------------------------------------------

export function renderProgressBar(input: ProgressBarInput): ProgressBarOutput {
  const width = input.width ?? DEFAULT_WIDTH;
  const fillChar = input.fillChar ?? DEFAULT_FILL;
  const emptyChar = input.emptyChar ?? DEFAULT_EMPTY;
  const showLabel = input.showLabel ?? false;

  const clamped = Math.max(0, Math.min(1, input.progress));

  const filledCount = Math.round(clamped * width);
  const emptyCount = width - filledCount;

  const bar = fillChar.repeat(filledCount) + emptyChar.repeat(emptyCount);

  const pct = Math.round(clamped * 100);
  const label = showLabel ? ` ${pct}%` : "";

  return { bar, label, filledCount };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProgressBar(props: ProgressBarProps): React.JSX.Element {
  const { Box, Text } = useInk();
  const { colors } = useTheme();
  const { bar, label } = renderProgressBar(props);

  return React.createElement(
    Box as React.ComponentType<Record<string, unknown>>,
    { flexDirection: "row" },
    React.createElement(
      Text as React.ComponentType<Record<string, unknown>>,
      { color: colors.primary },
      bar,
    ),
    label
      ? React.createElement(
          Text as React.ComponentType<Record<string, unknown>>,
          { color: colors.muted },
          label,
        )
      : null,
  );
}
