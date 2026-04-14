import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getSessionMarkerPath,
  writeSessionMarker,
  readSessionMarker,
  findHarnessAncestorPid,
  __resetCacheForTests,
  __setAncestorResolverForTests,
} from "../../utils/sessionMarker";

let tmpDir: string;
let savedGlobalStateDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-marker-test-"));
  savedGlobalStateDir = process.env.BABYSITTER_GLOBAL_STATE_DIR;
  process.env.BABYSITTER_GLOBAL_STATE_DIR = tmpDir;
  __resetCacheForTests();
});

afterEach(async () => {
  if (savedGlobalStateDir === undefined) {
    delete process.env.BABYSITTER_GLOBAL_STATE_DIR;
  } else {
    process.env.BABYSITTER_GLOBAL_STATE_DIR = savedGlobalStateDir;
  }
  __resetCacheForTests();
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("getSessionMarkerPath", () => {
  it("returns a deterministic, harness-slug-keyed path", () => {
    const a = getSessionMarkerPath("claude-code", 1234);
    const b = getSessionMarkerPath("claude-code", 1234);
    expect(a).toBe(b);
    expect(a).toBe(path.join(tmpDir, "state", "current-session-claude-code-pid-1234"));
  });

  it("slugifies non-kebab harness names", () => {
    const p = getSessionMarkerPath("Claude Code!", 5);
    expect(p).toBe(path.join(tmpDir, "state", "current-session-claude-code-pid-5"));
  });

  it("keeps different harnesses in different files", () => {
    const a = getSessionMarkerPath("claude-code", 1);
    const b = getSessionMarkerPath("codex", 1);
    expect(a).not.toBe(b);
  });
});

describe("write/read round-trip with injected ancestor", () => {
  it("round-trips a session id when ancestor resolver returns self", () => {
    __setAncestorResolverForTests(() => ({ pid: process.pid }));

    const written = writeSessionMarker("claude-code", "sess-123");
    expect(written).toBe(
      path.join(tmpDir, "state", `current-session-claude-code-pid-${process.pid}`),
    );
    expect(readSessionMarker("claude-code")).toBe("sess-123");
  });

  it("writeSessionMarker returns undefined when ancestor cannot be found", () => {
    __setAncestorResolverForTests(() => undefined);
    expect(writeSessionMarker("claude-code", "ignored")).toBeUndefined();
    expect(readSessionMarker("claude-code")).toBeUndefined();
  });

  it("readSessionMarker returns undefined when ancestor is dead", () => {
    // 999999 is almost certainly not a live process.
    __setAncestorResolverForTests(() => ({ pid: 999999 }));
    expect(readSessionMarker("claude-code")).toBeUndefined();
  });

  it("two different harnesses produce two different marker files", () => {
    __setAncestorResolverForTests(() => ({ pid: process.pid }));
    writeSessionMarker("claude-code", "claude-session");
    writeSessionMarker("codex", "codex-session");
    expect(readSessionMarker("claude-code")).toBe("claude-session");
    expect(readSessionMarker("codex")).toBe("codex-session");
  });
});

describe("findHarnessAncestorPid (real walk)", () => {
  it(
    "returns undefined cleanly when no target name matches",
    async () => {
      const first = findHarnessAncestorPid(["__no_such_process_name_xyz__"]);
      expect(first).toBeUndefined();
      // Second call hits the cache path.
      const second = findHarnessAncestorPid(["__no_such_process_name_xyz__"]);
      expect(second).toBeUndefined();
    },
    30_000,
  );
});
