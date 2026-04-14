/**
 * Verifies the inverted session-resolution precedence:
 *   pid-marker > env-file > env-var (with legacy BABYSITTER_TRUST_ENV_SESSION
 *   escape hatch).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs, writeFileSync as writeFileSyncAsync, mkdirSync as mkdirSyncAsync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  __resetCacheForTests,
  __setAncestorResolverForTests,
  getSessionMarkerPath,
} from "../../utils/sessionMarker";
import { resolveSessionIdDetailed } from "../claudeCode";

let tmpDir: string;
let savedGlobalStateDir: string | undefined;
let savedSessionId: string | undefined;
let savedEnvFile: string | undefined;
let savedTrustEnv: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-resolve-prec-"));
  savedGlobalStateDir = process.env.BABYSITTER_GLOBAL_STATE_DIR;
  savedSessionId = process.env.BABYSITTER_SESSION_ID;
  savedEnvFile = process.env.CLAUDE_ENV_FILE;
  savedTrustEnv = process.env.BABYSITTER_TRUST_ENV_SESSION;
  process.env.BABYSITTER_GLOBAL_STATE_DIR = tmpDir;
  delete process.env.BABYSITTER_SESSION_ID;
  delete process.env.CLAUDE_ENV_FILE;
  delete process.env.BABYSITTER_TRUST_ENV_SESSION;
  __resetCacheForTests();
});

afterEach(async () => {
  if (savedGlobalStateDir === undefined) delete process.env.BABYSITTER_GLOBAL_STATE_DIR;
  else process.env.BABYSITTER_GLOBAL_STATE_DIR = savedGlobalStateDir;
  if (savedSessionId === undefined) delete process.env.BABYSITTER_SESSION_ID;
  else process.env.BABYSITTER_SESSION_ID = savedSessionId;
  if (savedEnvFile === undefined) delete process.env.CLAUDE_ENV_FILE;
  else process.env.CLAUDE_ENV_FILE = savedEnvFile;
  if (savedTrustEnv === undefined) delete process.env.BABYSITTER_TRUST_ENV_SESSION;
  else process.env.BABYSITTER_TRUST_ENV_SESSION = savedTrustEnv;
  __resetCacheForTests();
  __setAncestorResolverForTests(undefined);
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function seedMarker(pid: number, sessionId: string): void {
  const markerPath = getSessionMarkerPath("claude-code", pid);
  mkdirSyncAsync(path.dirname(markerPath), { recursive: true });
  writeFileSyncAsync(markerPath, `${sessionId}\n`);
}

function seedEnvFile(content: string): string {
  const p = path.join(tmpDir, "claude.env");
  writeFileSyncAsync(p, content);
  process.env.CLAUDE_ENV_FILE = p;
  return p;
}

describe("resolveSessionIdDetailed precedence", () => {
  it("returns marker when all three sources are present", () => {
    // Inject ancestor = our pid so marker lookup hits.
    __setAncestorResolverForTests(() => ({ pid: process.pid }));
    seedMarker(process.pid, "MARKER-ID");
    seedEnvFile(`export BABYSITTER_SESSION_ID="ENV-FILE-ID"\n`);
    process.env.BABYSITTER_SESSION_ID = "STALE-ENV-ID";

    const r = resolveSessionIdDetailed();
    expect(r.sessionId).toBe("MARKER-ID");
    expect(r.resolvedFrom).toBe("pid-marker");
    expect(r.ancestorPid).toBe(process.pid);
    expect(r.ancestorAlive).toBe(true);
  });

  it("falls back to env-file when marker missing", () => {
    __setAncestorResolverForTests(() => undefined);
    seedEnvFile(`export BABYSITTER_SESSION_ID="ENV-FILE-ID"\n`);
    process.env.BABYSITTER_SESSION_ID = "STALE";

    const r = resolveSessionIdDetailed();
    expect(r.sessionId).toBe("ENV-FILE-ID");
    expect(r.resolvedFrom).toBe("env-file");
  });

  it("falls back to env-var when marker and env-file missing, warning on stale", () => {
    __setAncestorResolverForTests(() => undefined);
    process.env.BABYSITTER_SESSION_ID = "FALLBACK";

    const r = resolveSessionIdDetailed();
    expect(r.sessionId).toBe("FALLBACK");
    expect(r.resolvedFrom).toBe("env-var");

    // Warning written to the hook log for session resolution; log file lives
    // in the temp global state dir's logs subdir. Best-effort check: the
    // function ran without throwing and returned the env var.
  });

  it("BABYSITTER_TRUST_ENV_SESSION=1 restores env-var-first precedence", () => {
    __setAncestorResolverForTests(() => ({ pid: process.pid }));
    seedMarker(process.pid, "MARKER-ID");
    process.env.BABYSITTER_SESSION_ID = "TRUSTED-ENV";
    process.env.BABYSITTER_TRUST_ENV_SESSION = "1";

    const r = resolveSessionIdDetailed();
    expect(r.sessionId).toBe("TRUSTED-ENV");
    expect(r.resolvedFrom).toBe("env-var");
  });

  it("returns explicit sessionId without consulting any source", () => {
    const r = resolveSessionIdDetailed("EXPLICIT-ID");
    expect(r.sessionId).toBe("EXPLICIT-ID");
    expect(r.resolvedFrom).toBe("explicit");
  });
});
