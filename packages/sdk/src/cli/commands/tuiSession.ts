/**
 * tuiSession command — Launch the Ink-based interactive TUI session.
 *
 * This is distinct from the existing readline-based `tui` command.  It wires
 * the Ink TUI (packages/sdk/src/dashboard/ink/) into the CLI as the
 * `tui:session` command so both implementations can coexist.
 *
 * Flags:
 *   --workspace <dir>      Workspace root (informational, passed to TUI config)
 *   --run-id   <id>        Bind the TUI to an existing run
 *   --verbosity <level>    "minimal" | "normal" | "verbose"  (default: "normal")
 *   --harness   <name>     Harness hint passed through to TUI config
 *
 * The Ink module is ESM-only.  We delegate all dynamic imports to
 * createTuiSession() in dashboard/ink/render.ts, which already handles the
 * indirect-import pattern used throughout the SDK.
 */

import type { VerbosityLevel } from "../../dashboard/ink/types";

export interface TuiSessionArgs {
  /** Optional run ID to bind the session to. */
  runId?: string;
  /** Verbosity level forwarded to the TUI. */
  verbosity?: VerbosityLevel;
  /** Workspace directory (informational). */
  workspace?: string;
  /** Harness name hint. */
  harness?: string;
}

/**
 * Validate that `value` is a recognised VerbosityLevel, returning the default
 * "normal" when it is not so callers never have to guard against `undefined`.
 */
function toVerbosityLevel(value: string | undefined): VerbosityLevel {
  if (value === "minimal" || value === "normal" || value === "verbose") {
    return value;
  }
  return "normal";
}

/**
 * Launch the Ink-based interactive TUI session and wait until the user exits.
 *
 * Returns 0 on clean exit, 1 if the TUI could not be started.
 */
export async function handleTuiSession(args: TuiSessionArgs): Promise<number> {
  try {
    // createTuiSession lives in a CJS-compatible module that handles dynamic
    // import of the ESM-only `ink` package internally.
    const { createTuiSession } = await import("../../dashboard/ink/render");

    const session = await createTuiSession({
      runId: args.runId,
      verbosity: toVerbosityLevel(args.verbosity),
      // Render to stderr by default (same as render.ts default) so stdout
      // remains clean for programmatic consumers.
      useStderr: true,
    });

    await session.waitUntilExit();
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[tui:session] Failed to launch Ink TUI: ${message}\n`);
    return 1;
  }
}
