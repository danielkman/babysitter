/**
 * Base harness adapter class.
 *
 * Provides default implementations for all HarnessAdapter methods.
 * Each harness adapter extends this class and overrides only the
 * methods that have truly harness-specific behavior.
 */

import * as path from "node:path";
import { normalizeSessionStateDir } from "../config";
import type { PromptContext } from "../prompts/types";
import {
  createDefaultCliSetupSnippet,
  createPromptContext,
} from "../prompts/contextShared";
import type {
  HarnessAdapter,
  HarnessCapability,
  HookHandlerArgs,
  SessionBindOptions,
  SessionBindResult,
} from "./types";
import { bindSession } from "./hooks/sessionBinding";
import { handleStopHookCommon } from "./hooks/stopHookHandler";
import { buildStopHookContinuation } from "./hooks/stopHookContinuation";
import { initializeSessionState, readStdin, parseHookInput, safeStr } from "./hooks/utils";

// ---------------------------------------------------------------------------
// Adapter configuration interface
// ---------------------------------------------------------------------------

export interface AdapterConfig {
  /** Harness identifier (e.g. "claude-code"). */
  name: string;
  /** Human-readable label (e.g. "Claude Code"). */
  displayName: string;
  /** Env vars that indicate this harness is active. */
  activationEnvVars: string[];
  /** Capabilities advertised by this harness. */
  capabilities: HarnessCapability[];
  /** Term used for the mechanism that continues the orchestration loop. */
  loopControlTerm: string;
  /** Whether this adapter auto-resolves session IDs from environment. */
  autoResolvesSession: boolean;
  /** Env vars to check for plugin root. */
  pluginRootEnvVars: string[];
  /** Env vars to check for session ID (in priority order). */
  sessionIdEnvVars: string[];

  // ── Prompt context fields ──
  /** Capabilities list for prompt context. */
  promptCapabilities: string[];
  /** Plugin root variable expression for shell interpolation. */
  pluginRootVar: string;
  /** Whether orchestration uses stop-hook (true) or in-turn (false). */
  hookDriven: boolean;
  /** Name of the interactive question tool. */
  interactiveToolName: string;
  /** Description of session env var resolution. */
  sessionEnvVars: string;
  /** Whether this harness supports intent fidelity checks. */
  hasIntentFidelityChecks: boolean;
  /** Whether this harness has non-negotiables section. */
  hasNonNegotiables: boolean;
}

// ---------------------------------------------------------------------------
// Base adapter class
// ---------------------------------------------------------------------------

export abstract class BaseHarnessAdapter implements HarnessAdapter {
  constructor(protected readonly config: AdapterConfig) {}

  get name(): string {
    return this.config.name;
  }

  isActive(): boolean {
    return this.config.activationEnvVars.some((v) => !!process.env[v]);
  }

  autoResolvesSessionId(): boolean {
    return this.config.autoResolvesSession;
  }

  resolveSessionId(parsed: { sessionId?: string }): string | undefined {
    if (parsed.sessionId) return parsed.sessionId;
    for (const envVar of this.config.sessionIdEnvVars) {
      if (process.env[envVar]) return process.env[envVar];
    }
    return undefined;
  }

  resolveStateDir(args: {
    stateDir?: string;
    pluginRoot?: string;
  }): string | undefined {
    return normalizeSessionStateDir(
      args.stateDir ?? process.env.BABYSITTER_STATE_DIR,
    );
  }

  resolvePluginRoot(args: { pluginRoot?: string }): string | undefined {
    if (args.pluginRoot) return path.resolve(args.pluginRoot);
    for (const envVar of this.config.pluginRootEnvVars) {
      const val = process.env[envVar];
      if (val) return path.resolve(val);
    }
    return undefined;
  }

  getCapabilities(): HarnessCapability[] {
    return this.config.capabilities;
  }

  getPromptContext(opts?: { interactive?: boolean | undefined }): PromptContext {
    return createPromptContext(
      {
        harness: this.config.name,
        harnessLabel: this.config.displayName,
        capabilities: this.config.promptCapabilities,
        pluginRootVar: this.config.pluginRootVar,
        loopControlTerm: this.config.loopControlTerm,
        sessionBindingFlags: "",
        hookDriven: this.config.hookDriven,
        interactiveToolName: this.config.interactiveToolName,
        sessionEnvVars: this.config.sessionEnvVars,
        resumeFlags: "",
        cliSetupSnippet: createDefaultCliSetupSnippet(),
        iterateFlags: "",
        hasIntentFidelityChecks: this.config.hasIntentFidelityChecks,
        hasNonNegotiables: this.config.hasNonNegotiables,
      },
      opts ? { interactive: opts.interactive } : undefined,
    );
  }

  async bindSession(opts: SessionBindOptions): Promise<SessionBindResult> {
    const stateDir = this.resolveStateDir({
      stateDir: opts.stateDir,
      pluginRoot: opts.pluginRoot,
    });
    return bindSession({
      harness: this.config.name,
      stateDir: stateDir ?? "",
      opts,
    });
  }

  async handleStopHook(args: HookHandlerArgs): Promise<number> {
    const common = await handleStopHookCommon(args, {
      harness: this.config.name,
      sessionIdFields: ["session_id", "conversation_id"],
      useDetailedRunState: true,
      pluginRootEnvVars: this.config.pluginRootEnvVars,
      resolveStateDir: (a) =>
        normalizeSessionStateDir(
          a.stateDir ?? process.env.BABYSITTER_STATE_DIR,
        ),
    });
    if (!common.shouldContinue) {
      return common.exitCode;
    }
    const { reason, systemMessage } = await buildStopHookContinuation({
      nextIteration: common.nextIteration,
      maxIterations: common.state.maxIterations,
      runState: common.runStateDetails?.runState ?? "",
      pendingKinds: common.runStateDetails?.pendingKinds ?? "",
      completionProof: common.runStateDetails?.completionProof ?? "",
      prompt: common.prompt,
      resolvedPluginRoot: common.resolvedPluginRoot,
      runId: common.state.runId ?? undefined,
      runsDir: common.runsDir,
      entrypointImportPath: common.runStateDetails?.entrypointImportPath,
    });
    process.stdout.write(
      JSON.stringify({ decision: "block", reason, systemMessage }) + "\n",
    );
    return 0;
  }

  async handleSessionStartHook(args: HookHandlerArgs): Promise<number> {
    let rawInput: string;
    try {
      rawInput = await readStdin();
    } catch {
      process.stdout.write("{}\n");
      return 0;
    } finally {
      if (typeof process.stdin.unref === "function") {
        process.stdin.unref();
      }
    }

    const hookInput = parseHookInput(rawInput);
    const sessionId =
      safeStr(hookInput, "session_id") ||
      safeStr(hookInput, "conversation_id") ||
      process.env.AGENT_SESSION_ID ||
      "";

    if (!sessionId) {
      process.stdout.write("{}\n");
      return 0;
    }

    const stateDir = normalizeSessionStateDir(
      args.stateDir ?? process.env.BABYSITTER_STATE_DIR,
    );
    if (stateDir) {
      await initializeSessionState(sessionId, stateDir, {
        verbose: args.verbose,
      });
    }

    process.stdout.write("{}\n");
    return 0;
  }

  findHookDispatcherPath(_startCwd: string): string | null {
    return null;
  }

  getMissingSessionIdHint(): string {
    return `Pass --session-id explicitly or ensure the ${this.config.name} hook context provides one.`;
  }

  supportsHookType(_hookType: string): boolean {
    return true;
  }

  getUnsupportedHookMessage(hookType: string): string {
    return `Hook type "${hookType}" is not supported by the ${this.config.name} adapter.`;
  }
}
