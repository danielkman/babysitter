/**
 * SessionView — wraps the existing session components (StatusBar + MessagePane
 * + PromptBar) as a navigable view within the dashboard shell.
 *
 * Escape key dispatches GO_BACK (but only when input is not active in the
 * PromptBar, to avoid conflict with Escape-to-clear-input).
 *
 * The runId comes from NavigationContext.
 *
 * Box/Text are obtained from InkContext via useInk() — no prop drilling.
 */

import React, { useCallback } from "react";
import { useInk } from "../contexts/InkContext.js";
import type { InkKey } from "../contexts/InkContext.js";
import { useNavigation } from "../hooks/useNavigation.js";
import { useSession } from "../hooks/useSession.js";
import { StatusBar } from "../components/StatusBar.js";
import { MessagePane } from "../components/MessagePane.js";
import { PromptBar } from "../components/PromptBar.js";
import type { TuiMessage } from "../types.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionView(): React.JSX.Element {
  const { Box, useInput } = useInk();
  const { state: navState, dispatch: navDispatch } = useNavigation();
  const { state: sessionState, dispatch: sessionDispatch } = useSession();

  // Bind the navigation runId to session state if they differ
  React.useEffect(() => {
    if (navState.selectedRunId && navState.selectedRunId !== sessionState.runId) {
      sessionDispatch({ type: "SET_RUN_ID", runId: navState.selectedRunId });
    }
  }, [navState.selectedRunId, sessionState.runId, sessionDispatch]);

  // Escape goes back to dashboard (only when prompt input is not active)
  useInput(
    (_input: string, key: InkKey) => {
      if (key.escape && !sessionState.inputActive) {
        navDispatch({ type: "GO_BACK" });
      }
    },
  );

  // Handle message submission from the PromptBar
  const handleSubmit = useCallback(
    (text: string) => {
      const message: TuiMessage = {
        id: `msg-${Date.now()}`,
        timestamp: new Date().toISOString(),
        verbosity: "minimal",
        content: { kind: "user", text },
      };
      sessionDispatch({ type: "APPEND_MESSAGE", message });
      sessionDispatch({ type: "SET_INPUT_ACTIVE", active: false });
    },
    [sessionDispatch],
  );

  return React.createElement(
    Box as React.ComponentType<Record<string, unknown>>,
    {
      flexDirection: "column",
      height: "100%",
    },
    React.createElement(StatusBar, null),
    React.createElement(MessagePane, null),
    React.createElement(PromptBar, { onSubmit: handleSubmit }),
  );
}
