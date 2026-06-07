import { loadCompressionConfig } from "@a5c-ai/babysitter-sdk";
// NOTE: loadCompressionConfig reads .a5c/compression.json from disk.
// This is a configuration-reading function shared between genty and
// the SDK runtime. It remains as an SDK import.

export function loadCompressionConfigSafe(cwd: string) {
  try {
    return loadCompressionConfig(cwd);
  } catch {
    return null;
  }
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildCompactionSettings(enabled: boolean): {
  compaction: {
    enabled: boolean;
    reserveTokens?: number;
    keepRecentTokens?: number;
  };
  branchSummary?: {
    reserveTokens?: number;
    skipPrompt?: boolean;
  };
} {
  if (!enabled) {
    return {
      compaction: { enabled: false },
    };
  }

  return {
    compaction: {
      enabled: true,
      reserveTokens: readPositiveIntegerEnv("BABYSITTER_PI_COMPACTION_RESERVE_TOKENS", 8_192),
      keepRecentTokens: readPositiveIntegerEnv("BABYSITTER_PI_COMPACTION_KEEP_RECENT_TOKENS", 12_288),
    },
    branchSummary: {
      reserveTokens: readPositiveIntegerEnv("BABYSITTER_PI_BRANCH_SUMMARY_RESERVE_TOKENS", 4_096),
      skipPrompt: false,
    },
  };
}
