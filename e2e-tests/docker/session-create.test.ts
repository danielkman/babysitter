import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  buildImage,
  dockerExecSafe,
  startContainer,
  stopContainer,
} from "./helpers";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

beforeAll(() => {
  buildImage(ROOT);
  startContainer();
}, 300_000);

afterAll(() => {
  stopContainer();
});

// ============================================================================
// Session create E2E tests
// ============================================================================

describe("Session create CLI", () => {
  test("babysitter-harness --help shows usage information", () => {
    const { stdout } = dockerExecSafe(
      "babysitter-harness --help",
    );
    // --help may exit 0 or 1 depending on implementation; check output content
    expect(stdout).toContain("babysitter-harness create-run");
    expect(stdout).toContain("prompt");
  });

  test("babysitter-harness call without --prompt or --process returns error", () => {
    const { stdout, exitCode } = dockerExecSafe(
      "babysitter-harness call --json 2>&1",
    );
    expect(exitCode).not.toBe(0);

    // Should indicate that required arguments are missing
    expect(stdout.toLowerCase()).toMatch(/prompt|process|error|missing/i);
  });

  test("babysitter-harness --help mentions agent or harness", () => {
    const { stdout } = dockerExecSafe(
      "babysitter-harness --help",
    );
    // Help output should reference harness or agent concepts
    expect(stdout.toLowerCase()).toMatch(/agent|harness/i);
  });

  test("babysitter-harness call with nonexistent process file returns error", () => {
    const { stdout, exitCode } = dockerExecSafe(
      "babysitter-harness call --process ./nonexistent.js --json 2>&1",
    );
    expect(exitCode).not.toBe(0);

    // Should indicate the process file was not found or is invalid
    expect(stdout.toLowerCase()).toMatch(/not found|no such|error|missing|exist/i);
  });
});

// ============================================================================
// API-gated session create tests (require ANTHROPIC_API_KEY)
// ============================================================================

describe.skipIf(!process.env.ANTHROPIC_API_KEY)(
  "Session create with API key",
  () => {
    test("babysitter-harness call --prompt without --harness or --process returns error", () => {
      const { exitCode } = dockerExecSafe(
        'babysitter-harness call --prompt "test session" --json',
      );
      // Without a harness or process, it should fail
      expect(exitCode).not.toBe(0);
    });
  },
);
