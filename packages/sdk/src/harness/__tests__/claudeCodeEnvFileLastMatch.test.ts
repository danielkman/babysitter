/**
 * CLAUDE_ENV_FILE with multiple AGENT_SESSION_ID lines: must return the
 * LAST match (representing the most recently appended value).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs, writeFileSync as writeFileSyncAsync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { __resetCacheForTests, __setAncestorResolverForTests } from "../../utils/sessionMarker";
import { resolveSessionIdDetailed } from "../claudeCode";

let tmpDir: string;
let saved: Record<string, string | undefined>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-envfile-last-"));
  saved = {
    BABYSITTER_GLOBAL_STATE_DIR: process.env.BABYSITTER_GLOBAL_STATE_DIR,
    AGENT_SESSION_ID: process.env.AGENT_SESSION_ID,
    CLAUDE_ENV_FILE: process.env.CLAUDE_ENV_FILE,
    BABYSITTER_TRUST_ENV_SESSION: process.env.BABYSITTER_TRUST_ENV_SESSION,
  };
  process.env.BABYSITTER_GLOBAL_STATE_DIR = tmpDir;
  delete process.env.AGENT_SESSION_ID;
  delete process.env.BABYSITTER_TRUST_ENV_SESSION;
  __setAncestorResolverForTests(() => undefined); // no marker
  __resetCacheForTests();
});

afterEach(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  __resetCacheForTests();
  __setAncestorResolverForTests(undefined);
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("CLAUDE_ENV_FILE LAST match precedence", () => {
  it("returns the last AGENT_SESSION_ID line when multiple are present", () => {
    const envPath = path.join(tmpDir, "claude.env");
    writeFileSyncAsync(
      envPath,
      [
        `export SOMETHING_ELSE="hello"`,
        `export AGENT_SESSION_ID="OLD-ONE"`,
        `export OTHER="value"`,
        `export AGENT_SESSION_ID="NEWEST-ONE"`,
        ``,
      ].join("\n"),
    );
    process.env.CLAUDE_ENV_FILE = envPath;

    const r = resolveSessionIdDetailed();
    expect(r.sessionId).toBe("NEWEST-ONE");
    expect(r.resolvedFrom).toBe("env-file");
  });
});
