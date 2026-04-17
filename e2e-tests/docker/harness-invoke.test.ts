import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  buildImage,
  dockerExecSafe,
  startContainer,
  stopContainer,
} from "./helpers";
import { createMockHarness, cleanupMockHarnesses } from "./helpers-harness";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const MOCK_HARNESS_NAME = "mock-test-harness";

beforeAll(() => {
  buildImage(ROOT);
  startContainer();
  createMockHarness("", MOCK_HARNESS_NAME, "mock harness output", 0);
}, 300_000);

afterAll(() => {
  cleanupMockHarnesses("", MOCK_HARNESS_NAME);
  stopContainer();
});

// ============================================================================
// Harness invoke E2E tests
// ============================================================================

describe("Harness invoke", () => {
  test("invoke non-existent harness returns error JSON", () => {
    const { stdout, exitCode } = dockerExecSafe(
      "babysitter-harness invoke nonexistent-harness-xyz --prompt \"test\" --json 2>&1",
    );
    expect(exitCode).not.toBe(0);

    // Output should contain error information (may be JSON or text)
    const combined = stdout.toLowerCase();
    expect(combined).toMatch(/error|unknown/i);
  });

  test("invoke without --prompt returns error", () => {
    const { stdout, exitCode } = dockerExecSafe(
      "babysitter-harness invoke some-harness --json 2>&1",
    );
    expect(exitCode).not.toBe(0);

    // Should indicate that --prompt is required
    expect(stdout.toLowerCase()).toContain("prompt");
  });

  test("invoke without harness name returns error", () => {
    const { stdout, exitCode } = dockerExecSafe(
      "babysitter-harness invoke --json 2>&1",
    );
    expect(exitCode).not.toBe(0);

    // Should indicate that a harness name or argument is required
    const combined = stdout.toLowerCase();
    expect(combined).toMatch(/harness|argument|require/i);
  });
});
