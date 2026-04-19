import * as path from "node:path";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { appendEvent } from "../../storage/journal";
import type { EffectRecord } from "../../runtime/types";
import { getGlobalLogDir, getGlobalStateDir } from "../../config";
import {
  findHarnessAncestorPid,
  getSessionMarkerPath,
  hasSessionMarkerCandidate,
  isSessionPidMarkerEnabled,
  readSessionMarker,
} from "../../utils/sessionMarker";
import { isProcessAlive } from "../../utils/processLiveness";

export interface HookLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  setContext(key: string, value: string): void;
}

export function createHookLogger(hookName: string): HookLogger {
  const logDir = getGlobalLogDir();
  const logFile = logDir ? path.join(logDir, `${hookName}.log`) : null;
  const context: Record<string, string> = {};

  if (logFile) {
    try {
      mkdirSync(logDir, { recursive: true });
    } catch {
      // Best-effort
    }
  }

  function write(level: string, message: string): void {
    if (!logFile) return;
    const ts = new Date().toISOString();
    const ctxParts = Object.entries(context).map(([k, v]) => `${k}=${v}`);
    const ctxStr = ctxParts.length > 0 ? ` [${ctxParts.join(" ")}]` : "";
    try {
      appendFileSync(logFile, `[${level}] ${ts}${ctxStr} ${message}\n`);
    } catch {
      // Best-effort
    }
  }

  return {
    info: (msg: string) => write("INFO", msg),
    warn: (msg: string) => write("WARN", msg),
    error: (msg: string) => write("ERROR", msg),
    setContext: (key: string, value: string) => {
      context[key] = value;
    },
  };
}

export async function appendStopHookEvent(
  runDir: string,
  data: {
    sessionId: string;
    iteration: number;
    decision: "approve" | "block";
    reason: string;
    runState: string;
    pendingKinds: string;
    hasPromise: boolean;
  },
): Promise<void> {
  try {
    await appendEvent({
      runDir,
      eventType: "STOP_HOOK_INVOKED",
      event: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Best-effort
  }
}

export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export interface ClaudeCodeStopHookInput {
  session_id?: string;
  transcript_path?: string;
  last_assistant_message?: string;
}

export interface ClaudeCodeSessionStartHookInput {
  session_id?: string;
}

export function parseHookInput(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed JSON
  }
  return {};
}

export function safeStr(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  return typeof val === "string" ? val : "";
}

export function countPendingByKind(records: EffectRecord[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    const key = record.kind ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(
    Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function isOnlyBreakpoints(pendingByKind: Record<string, number>): boolean {
  const keys = Object.keys(pendingByKind);
  return keys.length === 1 && keys[0] === "breakpoint";
}

export async function cleanupSession(
  filePath: string,
  deleteSessionFile: (filePath: string) => Promise<unknown>,
): Promise<void> {
  try {
    await deleteSessionFile(filePath);
  } catch {
    // Best-effort
  }
}

function findClaudeAncestorPid(): number | undefined {
  const info = findHarnessAncestorPid(["claude"]);
  return info?.pid;
}

export function getCurrentSessionIdFilePath(): string | undefined {
  if (!isSessionPidMarkerEnabled()) {
    return undefined;
  }
  const ancestorPid = findClaudeAncestorPid();
  if (!ancestorPid) return undefined;
  return getSessionMarkerPath("claude-code", ancestorPid);
}

export function resolveCurrentSessionIdFromEnv(): string | undefined {
  return resolveSessionIdDetailed().sessionId;
}

export interface SessionResolutionDetails {
  sessionId?: string;
  resolvedFrom: "pid-marker" | "env-file" | "env-var" | "explicit" | "none";
  ancestorPid: number | null;
  ancestorAlive: boolean | null;
}

export function resolveSessionIdDetailed(explicit?: string): SessionResolutionDetails {
  if (explicit) {
    return {
      sessionId: explicit,
      resolvedFrom: "explicit",
      ancestorPid: null,
      ancestorAlive: null,
    };
  }

  const trustEnv =
    process.env.AGENT_TRUST_ENV_SESSION === "1" ||
    process.env.BABYSITTER_TRUST_ENV_SESSION === "1";
  const log = createHookLogger("babysitter-session-resolution");
  let ancestorDetails: Pick<SessionResolutionDetails, "ancestorPid" | "ancestorAlive"> | undefined;

  const getAncestorDetails = (): Pick<
    SessionResolutionDetails,
    "ancestorPid" | "ancestorAlive"
  > => {
    if (ancestorDetails) {
      return ancestorDetails;
    }

    if (!hasSessionMarkerCandidate("claude-code")) {
      ancestorDetails = {
        ancestorPid: null,
        ancestorAlive: null,
      };
      return ancestorDetails;
    }

    const ancestor = findHarnessAncestorPid(["claude"]);
    const ancestorPid = ancestor?.pid ?? null;
    ancestorDetails = {
      ancestorPid,
      ancestorAlive: ancestorPid !== null ? isProcessAlive(ancestorPid) : null,
    };
    return ancestorDetails;
  };

  const agentSessionId = process.env.AGENT_SESSION_ID;

  if (trustEnv && agentSessionId) {
    return {
      sessionId: agentSessionId,
      resolvedFrom: "env-var",
      ...getAncestorDetails(),
    };
  }

  if (!trustEnv) {
    const fromMarker = readSessionMarker("claude-code");
    if (fromMarker) {
      return {
        sessionId: fromMarker,
        resolvedFrom: "pid-marker",
        ...getAncestorDetails(),
      };
    }
  }

  const envFile = process.env.CLAUDE_ENV_FILE;
  if (envFile) {
    try {
      const content = readFileSync(envFile, "utf-8");
      const agentMatches = [...content.matchAll(/export AGENT_SESSION_ID="([^"]+)"/g)];
      const agentLast = agentMatches.at(-1)?.[1];
      if (agentLast) {
        return {
          sessionId: agentLast,
          resolvedFrom: "env-file",
          ...getAncestorDetails(),
        };
      }
    } catch {
      // non-fatal
    }
  }

  if (agentSessionId) {
    const stateFile = path.join(getGlobalStateDir(), `${agentSessionId}.md`);
    if (!existsSync(stateFile)) {
      log.warn(
        `AGENT_SESSION_ID=${agentSessionId} is set but no matching state file at ${stateFile} — likely stale from a prior Claude Code session. Run 'babysitter session:cleanup' or 'unset AGENT_SESSION_ID'.`,
      );
    }
    return {
      sessionId: agentSessionId,
      resolvedFrom: "env-var",
      ...getAncestorDetails(),
    };
  }

  return {
    sessionId: undefined,
    resolvedFrom: "none",
    ...getAncestorDetails(),
  };
}

export const __resolveCurrentSessionIdFromEnvForTests = resolveCurrentSessionIdFromEnv;

export function setBabysitterSessionIdInEnvFile(
  envFile: string,
  sessionId: string,
): void {
  appendFileSync(envFile, `export AGENT_SESSION_ID="${sessionId}"\n`);
}
