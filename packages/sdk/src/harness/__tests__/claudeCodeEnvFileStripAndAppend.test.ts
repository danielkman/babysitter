/**
 * setBabysitterSessionIdInEnvFile must append a new BABYSITTER_SESSION_ID
 * export to CLAUDE_ENV_FILE. Append-only matches Claude Code's shell-sourcing
 * semantics: the file is sourced before each Bash tool call and the last
 * export wins. The resolver uses a global last-match regex.
 *
 * Do NOT rewrite or rename-swap the file: Claude Code may retain a cached
 * handle or inode reference, and rewriting breaks the env-sourcing contract.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs, writeFileSync as writeFileSyncAsync, readFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { setBabysitterSessionIdInEnvFile } from "../claudeCode";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-envfile-strip-"));
});

afterEach(async () => {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("setBabysitterSessionIdInEnvFile", () => {
  it("appends new BABYSITTER_SESSION_ID, preserving prior contents unchanged", () => {
    const envPath = path.join(tmpDir, "claude.env");
    const prior = [
      `export PATH_ADDITION="/foo/bin"`,
      `export BABYSITTER_SESSION_ID="OLD"`,
      `export SOMETHING="value"`,
      ``,
    ].join("\n");
    writeFileSyncAsync(envPath, prior);

    setBabysitterSessionIdInEnvFile(envPath, "NEW");

    const after = readFileSync(envPath, "utf-8");
    // File starts with the prior contents verbatim — append semantics preserve
    // file identity (no rewrite, no rename-swap).
    expect(after.startsWith(prior)).toBe(true);
    // The new export is appended.
    expect(after).toMatch(/export BABYSITTER_SESSION_ID="NEW"\n$/);
    // Unrelated exports are untouched.
    expect(after).toContain(`export PATH_ADDITION="/foo/bin"`);
    expect(after).toContain(`export SOMETHING="value"`);
    // Prior BABYSITTER_SESSION_ID stays — the resolver picks the last match.
    const matches = [...after.matchAll(/^export BABYSITTER_SESSION_ID=.*$/gm)];
    expect(matches).toHaveLength(2);
  });

  it("creates a new file when target doesn't exist", () => {
    const envPath = path.join(tmpDir, "fresh.env");
    setBabysitterSessionIdInEnvFile(envPath, "FRESH");
    const after = readFileSync(envPath, "utf-8");
    expect(after).toBe(`export BABYSITTER_SESSION_ID="FRESH"\n`);
  });
});
