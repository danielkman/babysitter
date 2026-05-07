/**
 * Harness adapter registry with auto-detection.
 *
 * Central source of truth for harness-specific adapter factories, discovery
 * specs, and any specialized helper lookups that other modules need.
 */

import type { PromptContext } from "../prompts/types";
import type { HarnessAdapter, HarnessSpec } from "./types";
import { HarnessCapability as Cap } from "./types";
import {
  createClaudeCodeAdapter,
  resolveSessionIdDetailed as resolveClaudeCodeSessionDetails,
} from "./adapters/claude-code";
import type { SessionResolutionDetails } from "./adapters/claude-code";
import { createCodexAdapter } from "./adapters/codex";
import { createGeminiCliAdapter } from "./adapters/gemini-cli";
import { createPiAdapter } from "./adapters/pi";
import { createOhMyPiAdapter } from "./adapters/oh-my-pi";
import { createCursorAdapter } from "./adapters/cursor";
import { createGithubCopilotAdapter } from "./adapters/github-copilot";
import { createOpenCodeAdapter } from "./adapters/opencode";
import { createOpenClawAdapter } from "./adapters/openclaw";
import { createUnifiedAdapter } from "./unified/adapter";
import { UNIFIED_DISCOVERY_SPEC } from "./unified/discovery";
import { createCustomAdapter } from "./customAdapter";

// ---------------------------------------------------------------------------
// Discovery specs — derived from agent-catalog (which reads Atlas graph)
// ---------------------------------------------------------------------------

import { listPluginTargetDescriptors } from "@a5c-ai/agent-catalog";

const CAPABILITY_MAP: Record<string, Cap> = {
  SessionBinding: Cap.SessionBinding,
  StopHook: Cap.StopHook,
  Mcp: Cap.Mcp,
  HeadlessPrompt: Cap.HeadlessPrompt,
  Programmatic: Cap.Programmatic,
};

function buildDiscoverySpecs(): Map<string, HarnessSpec> {
  const specs = new Map<string, HarnessSpec>();
  try {
    for (const target of listPluginTargetDescriptors()) {
      if (!target.cliCommand) continue;
      specs.set(target.targetId, {
        name: target.targetId,
        cli: target.cliCommand,
        callerEnvVars: target.callerEnvVars ?? [],
        capabilities: (target.harnessCapabilities ?? [])
          .map((c) => CAPABILITY_MAP[c])
          .filter((c): c is Cap => c !== undefined),
        configPaths: target.configPaths ?? [],
      });
    }
  } catch {
    // Atlas/catalog not available (e.g. during initial bootstrap) — empty specs
  }
  return specs;
}

let cachedDiscoverySpecs: Map<string, HarnessSpec> | undefined;
function getDiscoverySpecs(): Map<string, HarnessSpec> {
  if (!cachedDiscoverySpecs) cachedDiscoverySpecs = buildDiscoverySpecs();
  return cachedDiscoverySpecs;
}

function getDiscoverySpec(name: string): HarnessSpec | undefined {
  return getDiscoverySpecs().get(name);
}

// Named exports for backward compatibility (consumers import these directly)
export const CLAUDE_CODE_DISCOVERY_SPEC: HarnessSpec = { get name() { return getDiscoverySpec("claude-code")?.name ?? "claude-code"; }, get cli() { return getDiscoverySpec("claude-code")?.cli ?? "claude"; }, get callerEnvVars() { return getDiscoverySpec("claude-code")?.callerEnvVars ?? ["CLAUDE_ENV_FILE"]; }, get capabilities() { return getDiscoverySpec("claude-code")?.capabilities ?? [Cap.SessionBinding, Cap.StopHook, Cap.Mcp, Cap.HeadlessPrompt]; }, get configPaths() { return getDiscoverySpec("claude-code")?.configPaths ?? [".claude"]; } };
export const PI_DISCOVERY_SPEC: HarnessSpec = { get name() { return getDiscoverySpec("pi")?.name ?? "pi"; }, get cli() { return getDiscoverySpec("pi")?.cli ?? "pi"; }, get callerEnvVars() { return getDiscoverySpec("pi")?.callerEnvVars ?? ["PI_SESSION_ID"]; }, get capabilities() { return getDiscoverySpec("pi")?.capabilities ?? [Cap.Programmatic, Cap.SessionBinding, Cap.HeadlessPrompt]; }, get configPaths() { return getDiscoverySpec("pi")?.configPaths ?? [".pi"]; } };
export const CODEX_DISCOVERY_SPEC: HarnessSpec = { get name() { return getDiscoverySpec("codex")?.name ?? "codex"; }, get cli() { return getDiscoverySpec("codex")?.cli ?? "codex"; }, get callerEnvVars() { return getDiscoverySpec("codex")?.callerEnvVars ?? []; }, get capabilities() { return getDiscoverySpec("codex")?.capabilities ?? [Cap.SessionBinding, Cap.StopHook, Cap.HeadlessPrompt]; }, get configPaths() { return getDiscoverySpec("codex")?.configPaths ?? [".codex"]; } };
export const CURSOR_DISCOVERY_SPEC: HarnessSpec = { get name() { return getDiscoverySpec("cursor")?.name ?? "cursor"; }, get cli() { return getDiscoverySpec("cursor")?.cli ?? "cursor"; }, get callerEnvVars() { return getDiscoverySpec("cursor")?.callerEnvVars ?? []; }, get capabilities() { return getDiscoverySpec("cursor")?.capabilities ?? [Cap.SessionBinding, Cap.StopHook, Cap.HeadlessPrompt]; }, get configPaths() { return getDiscoverySpec("cursor")?.configPaths ?? [".cursor"]; } };
export const GEMINI_CLI_DISCOVERY_SPEC: HarnessSpec = { get name() { return getDiscoverySpec("gemini")?.name ?? "gemini-cli"; }, get cli() { return getDiscoverySpec("gemini")?.cli ?? "gemini"; }, get callerEnvVars() { return getDiscoverySpec("gemini")?.callerEnvVars ?? []; }, get capabilities() { return getDiscoverySpec("gemini")?.capabilities ?? [Cap.SessionBinding, Cap.StopHook, Cap.HeadlessPrompt]; }, get configPaths() { return getDiscoverySpec("gemini")?.configPaths ?? [".gemini"]; } };
export const GITHUB_COPILOT_DISCOVERY_SPEC: HarnessSpec = { get name() { return getDiscoverySpec("github-copilot")?.name ?? "github-copilot"; }, get cli() { return getDiscoverySpec("github-copilot")?.cli ?? "gh"; }, get callerEnvVars() { return getDiscoverySpec("github-copilot")?.callerEnvVars ?? []; }, get capabilities() { return getDiscoverySpec("github-copilot")?.capabilities ?? [Cap.SessionBinding, Cap.StopHook, Cap.HeadlessPrompt]; }, get configPaths() { return getDiscoverySpec("github-copilot")?.configPaths ?? [".github", ".copilot"]; } };
export const OH_MY_PI_DISCOVERY_SPEC: HarnessSpec = { get name() { return getDiscoverySpec("oh-my-pi")?.name ?? "oh-my-pi"; }, get cli() { return getDiscoverySpec("oh-my-pi")?.cli ?? "pi"; }, get callerEnvVars() { return getDiscoverySpec("oh-my-pi")?.callerEnvVars ?? []; }, get capabilities() { return getDiscoverySpec("oh-my-pi")?.capabilities ?? [Cap.SessionBinding, Cap.StopHook, Cap.Programmatic]; }, get configPaths() { return getDiscoverySpec("oh-my-pi")?.configPaths ?? [".omp"]; } };
export const OPENCODE_DISCOVERY_SPEC: HarnessSpec = { get name() { return getDiscoverySpec("opencode")?.name ?? "opencode"; }, get cli() { return getDiscoverySpec("opencode")?.cli ?? "opencode"; }, get callerEnvVars() { return getDiscoverySpec("opencode")?.callerEnvVars ?? []; }, get capabilities() { return getDiscoverySpec("opencode")?.capabilities ?? [Cap.SessionBinding, Cap.StopHook, Cap.HeadlessPrompt]; }, get configPaths() { return getDiscoverySpec("opencode")?.configPaths ?? [".opencode"]; } };
export const OPENCLAW_DISCOVERY_SPEC: HarnessSpec = { get name() { return getDiscoverySpec("openclaw")?.name ?? "openclaw"; }, get cli() { return getDiscoverySpec("openclaw")?.cli ?? "openclaw"; }, get callerEnvVars() { return getDiscoverySpec("openclaw")?.callerEnvVars ?? []; }, get capabilities() { return getDiscoverySpec("openclaw")?.capabilities ?? [Cap.Programmatic, Cap.HeadlessPrompt]; }, get configPaths() { return getDiscoverySpec("openclaw")?.configPaths ?? [".openclaw"]; } };

export type { SessionResolutionDetails } from "./adapters/claude-code";

interface HarnessRegistryEntry {
  name: string;
  adapterFactory: () => HarnessAdapter;
  discoverySpec?: HarnessSpec;
  resolveSessionIdDetailed?: (
    explicit?: string,
  ) => SessionResolutionDetails;
}

const HARNESS_REGISTRY: readonly HarnessRegistryEntry[] = [
  {
    name: "codex",
    adapterFactory: createCodexAdapter,
    discoverySpec: CODEX_DISCOVERY_SPEC,
  },
  {
    name: "oh-my-pi",
    adapterFactory: createOhMyPiAdapter,
    discoverySpec: OH_MY_PI_DISCOVERY_SPEC,
  },
  {
    name: "pi",
    adapterFactory: createPiAdapter,
    discoverySpec: PI_DISCOVERY_SPEC,
  },
  {
    name: "openclaw",
    adapterFactory: createOpenClawAdapter,
    discoverySpec: OPENCLAW_DISCOVERY_SPEC,
  },
  {
    name: "opencode",
    adapterFactory: createOpenCodeAdapter,
    discoverySpec: OPENCODE_DISCOVERY_SPEC,
  },
  {
    name: "claude-code",
    adapterFactory: createClaudeCodeAdapter,
    discoverySpec: CLAUDE_CODE_DISCOVERY_SPEC,
    resolveSessionIdDetailed: resolveClaudeCodeSessionDetails,
  },
  {
    name: "gemini-cli",
    adapterFactory: createGeminiCliAdapter,
    discoverySpec: GEMINI_CLI_DISCOVERY_SPEC,
  },
  {
    name: "cursor",
    adapterFactory: createCursorAdapter,
    discoverySpec: CURSOR_DISCOVERY_SPEC,
  },
  {
    name: "github-copilot",
    adapterFactory: createGithubCopilotAdapter,
    discoverySpec: GITHUB_COPILOT_DISCOVERY_SPEC,
  },
  {
    name: "unified",
    adapterFactory: createUnifiedAdapter,
    discoverySpec: UNIFIED_DISCOVERY_SPEC,
  },
  {
    name: "custom",
    adapterFactory: createCustomAdapter,
  },
] as const;

const harnessRegistryByName = new Map(
  HARNESS_REGISTRY.map((entry) => [entry.name, entry]),
);

export const KNOWN_HARNESSES: readonly HarnessSpec[] = [
  ...Array.from(getDiscoverySpecs().values()),
  UNIFIED_DISCOVERY_SPEC,
];

function createKnownAdapters(): HarnessAdapter[] {
  return HARNESS_REGISTRY.map((entry) => entry.adapterFactory());
}

export function getHarnessDiscoverySpec(name: string): HarnessSpec | null {
  return KNOWN_HARNESSES.find((spec) => spec.name === name) ?? null;
}

export function getHarnessCallerEnvVars(name: string): string[] {
  return [...(getHarnessDiscoverySpec(name)?.callerEnvVars ?? [])];
}

export function getSessionResolutionDetails(
  name: string,
  explicit?: string,
): SessionResolutionDetails | null {
  const resolver = harnessRegistryByName.get(name)?.resolveSessionIdDetailed;
  return resolver ? resolver(explicit) : null;
}

export function createPromptContextForHarness(
  name: string,
  overrides?: Partial<PromptContext>,
): PromptContext | null {
  const adapter = getAdapterByName(name);
  if (!adapter?.getPromptContext) {
    return null;
  }
  const base = adapter.getPromptContext({
    interactive: overrides?.interactive,
  });
  return overrides ? { ...base, ...overrides } : base;
}

/**
 * Probe each registered adapter and return the first that reports active.
 * Falls back to the custom adapter (which requires explicit args).
 */
export function detectAdapter(): HarnessAdapter {
  for (const adapter of createKnownAdapters()) {
    if (adapter.isActive()) return adapter;
  }
  return createCustomAdapter();
}

/**
 * Look up an adapter by harness name (e.g. "claude-code").
 * Returns null if the name is not recognized.
 */
export function getAdapterByName(name: string): HarnessAdapter | null {
  const entry = harnessRegistryByName.get(name);
  return entry ? entry.adapterFactory() : null;
}

/**
 * List the names of all supported harnesses.
 */
export function listSupportedHarnesses(): string[] {
  return HARNESS_REGISTRY.map((entry) => entry.name);
}

let current: HarnessAdapter | null = null;

/**
 * Get the active harness adapter (auto-detected on first call).
 */
export function getAdapter(): HarnessAdapter {
  if (!current) {
    current = detectAdapter();
  }
  return current;
}

/**
 * Override the active adapter (useful for testing).
 */
export function setAdapter(adapter: HarnessAdapter): void {
  current = adapter;
}

/**
 * Reset the singleton so the next `getAdapter()` call re-detects.
 */
export function resetAdapter(): void {
  current = null;
}
