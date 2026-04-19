/**
 * setBabysitterSessionIdInEnvFile must append both AGENT_SESSION_ID and
 * BABYSITTER_SESSION_ID exports to CLAUDE_ENV_FILE. Append-only matches
 * Claude Code's shell-sourcing semantics: the file is sourced before each
 * Bash tool call and the last export wins. The resolver uses a global
 * last-match regex.
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
  it("appends both AGENT_SESSION_ID and BABYSITTER_SESSION_ID, preserving prior contents unchanged", () => {
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
    // Both new exports are appended.
    expect(after).toContain(`export AGENT_SESSION_ID="NEW"`);
    expect(after).toMatch(/export BABYSITTER_SESSION_ID="NEW"\n$/);
    // Unrelated exports are untouched.
    expect(after).toContain(`export PATH_ADDITION="/foo/bin"`);
    expect(after).toContain(`export SOMETHING="value"`);
    // Prior BABYSITTER_SESSION_ID stays — the resolver picks the last match.
    const babysitterMatches = [...after.matchAll(/^export BABYSITTER_SESSION_ID=.*$/gm)];
    expect(babysitterMatches).toHaveLength(2);
    // New AGENT_SESSION_ID is added.
    const agentMatches = [...after.matchAll(/^export AGENT_SESSION_ID=.*$/gm)];
    expect(agentMatches).toHaveLength(1);
  });

  it("creates a new file when target doesn't exist", () => {
    const envPath = path.join(tmpDir, "fresh.env");
    setBabysitterSessionIdInEnvFile(envPath, "FRESH");
    const after = readFileSync(envPath, "utf-8");
    expect(after).toBe(`export AGENT_SESSION_ID="FRESH"\nexport BABYSITTER_SESSION_ID="FRESH"\n`);
  });
});
