import type {
  HarnessInstallOptions,
  HarnessInstallResult,
} from "../../../harness";
import { installHarnessViaAmux } from "../../../harness/install";
import {
  BabysitterRuntimeError,
  ErrorCategory,
  formatErrorWithContext,
  toStructuredError,
} from "../../../runtime/exceptions";

export interface HarnessInstallCommandArgs extends HarnessInstallOptions {
  harnessName?: string;
}

function supportsColors(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  return Boolean(process.stderr?.isTTY);
}

function formatInstallResult(payload: HarnessInstallResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.warning) {
    console.log(`Warning: ${payload.warning}`);
  }
  if (payload.summary) {
    console.log(payload.summary);
  }
  if (payload.command) {
    console.log(`Command: ${payload.command}`);
  }
  if (payload.output) {
    console.log(payload.output);
  }
  if (payload.location) {
    console.log(`Location: ${payload.location}`);
  }
}

function requireHarnessName(
  harnessName: string | undefined,
  commandName: string,
): string {
  if (!harnessName) {
    throw new BabysitterRuntimeError(
      "MissingArgument",
      `${commandName} requires a harness name as the first argument`,
      {
        category: ErrorCategory.Validation,
        suggestions: [`babysitter ${commandName} codex`],
      },
    );
  }
  return harnessName;
}

/**
 * Install a harness CLI via agent-mux.
 */
export async function handleHarnessInstall(args: HarnessInstallCommandArgs): Promise<number> {
  const harnessName = requireHarnessName(args.harnessName, "harness:install");
  const result = await installHarnessViaAmux(harnessName, args);
  formatInstallResult(result, args.json);
  return 0;
}

/**
 * Install a babysitter plugin for a harness.
 *
 * Plugin installation remains harness-specific since it involves babysitter's
 * own plugin packaging, not general CLI installation. This delegates to the
 * babysitter plugin system rather than per-adapter install logic.
 */
export function handleHarnessInstallPlugin(args: HarnessInstallCommandArgs): number {
  const harnessName = requireHarnessName(args.harnessName, "harness:install-plugin");
  const result: HarnessInstallResult = {
    harness: harnessName,
    summary: `Use "babysitter plugin:install" to install babysitter plugins for ${harnessName}. ` +
      `Direct harness plugin installation has been consolidated into the plugin system.`,
  };
  formatInstallResult(result, args.json);
  return 0;
}

export function formatHarnessInstallError(error: unknown, json: boolean): number {
  const err = error instanceof Error
    ? error
    : new Error(String(error));

  if (json) {
    console.error(JSON.stringify(toStructuredError(err), null, 2));
  } else {
    console.error(formatErrorWithContext(err, { colors: supportsColors() }));
  }
  return 1;
}
