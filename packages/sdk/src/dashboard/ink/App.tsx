/**
 * App — root TUI component for the Babysitter terminal UI.
 *
 * This file is only ever loaded via dynamic import() from render.ts, so by
 * the time this module executes the Ink ESM bundle has already been imported
 * and its exports are passed in via InkProvider.  Components in the tree
 * retrieve Box/Text/useInput via the useInk() hook instead of receiving them
 * as props.  This avoids any direct static import of ESM-only modules from a
 * CommonJS compilation unit.
 *
 * Layout (column, full height):
 *   ┌──────────────────────────────┐
 *   │ StatusBar  (1 row)           │
 *   ├──────────────────────────────┤
 *   │ MessagePane  (flex: 1)       │
 *   ├──────────────────────────────┤
 *   │ PromptBar  (1–3 rows)        │
 *   └──────────────────────────────┘
 */

import React from "react";

import { InkProvider } from "./contexts/InkContext.js";
import { SessionProvider } from "./contexts/SessionContext.js";
import { ThemeProvider, neonDarkTheme } from "./contexts/ThemeContext.js";
import { ClockProvider } from "./contexts/ClockContext.js";
import { useInk } from "./contexts/InkContext.js";
import { useSession } from "./hooks/useSession.js";
import { StatusBar } from "./components/StatusBar.js";
import { MessagePane } from "./components/MessagePane.js";
import { PromptBar } from "./components/PromptBar.js";
import type { TuiConfig, Theme, VerbosityLevel } from "./types.js";

// Re-export InkProvider so render.ts can reference it from the same require()
export { InkProvider };

// ---------------------------------------------------------------------------
// Legacy type exports — kept for backward compatibility with any existing
// imports that reference InkBox/InkText from App.js
// ---------------------------------------------------------------------------

export type InkBox = React.ComponentType<Record<string, unknown> & { children?: React.ReactNode }>;
export type InkText = React.ComponentType<Record<string, unknown> & { children?: React.ReactNode }>;

// ---------------------------------------------------------------------------
// Inner App (rendered inside all providers)
// ---------------------------------------------------------------------------

const VERBOSITY_CYCLE: VerbosityLevel[] = ["minimal", "normal", "verbose"];

function AppInner(): React.JSX.Element {
  const { Box, useInput } = useInk();
  const { state, dispatch } = useSession();

  // 'v' key cycles verbosity at the app level
  useInput(
    (input: string) => {
      if (input === "v") {
        const current = state.verbosity;
        const idx = VERBOSITY_CYCLE.indexOf(current);
        const next = VERBOSITY_CYCLE[(idx + 1) % VERBOSITY_CYCLE.length];
        dispatch({ type: "SET_VERBOSITY", verbosity: next as VerbosityLevel });
      }
    },
  );

  return React.createElement(
    Box as React.ComponentType<Record<string, unknown>>,
    {
      flexDirection: "column",
      height: "100%",
    },
    React.createElement(StatusBar, null),
    React.createElement(MessagePane, null),
    React.createElement(PromptBar, null),
  );
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

export default function App({
  runId,
  verbosity = "normal",
  theme,
}: TuiConfig): React.JSX.Element {
  const resolvedTheme: Theme = theme ?? neonDarkTheme;

  return (
    <SessionProvider initialRunId={runId} initialVerbosity={verbosity}>
      <ThemeProvider theme={resolvedTheme}>
        <ClockProvider intervalMs={100}>
          <AppInner />
        </ClockProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
