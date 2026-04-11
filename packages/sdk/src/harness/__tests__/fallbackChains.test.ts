/**
 * Tests for GAP-HADAPT-004: Harness Fallback Chains.
 */

import { describe, it, expect } from "vitest";
import {
  createFallbackChain,
  resolveFallbackHarness,
  type FallbackChain,
  type FallbackResolution,
} from "../fallbackChains";

describe("createFallbackChain (GAP-HADAPT-004)", () => {
  it("creates a chain from ordered harness names", () => {
    const chain: FallbackChain = createFallbackChain(
      ["claude-code", "codex", "gemini-cli"],
    );

    expect(chain.harnesses).toEqual(["claude-code", "codex", "gemini-cli"]);
    expect(chain.maxRetries).toBe(2); // default: chain.length - 1
  });

  it("accepts custom maxRetries", () => {
    const chain = createFallbackChain(
      ["claude-code", "codex"],
      { maxRetries: 1 },
    );

    expect(chain.maxRetries).toBe(1);
  });

  it("clamps maxRetries to chain length", () => {
    const chain = createFallbackChain(
      ["claude-code", "codex"],
      { maxRetries: 10 },
    );

    // Cannot retry more times than alternatives exist
    expect(chain.maxRetries).toBe(1);
  });

  it("handles single-harness chain", () => {
    const chain = createFallbackChain(["claude-code"]);

    expect(chain.harnesses).toEqual(["claude-code"]);
    expect(chain.maxRetries).toBe(0);
  });

  it("deduplicates harness names", () => {
    const chain = createFallbackChain(
      ["claude-code", "codex", "claude-code"],
    );

    expect(chain.harnesses).toEqual(["claude-code", "codex"]);
  });
});

describe("resolveFallbackHarness (GAP-HADAPT-004)", () => {
  const chain = createFallbackChain(
    ["claude-code", "codex", "gemini-cli"],
  );

  it("resolves primary harness on first attempt", () => {
    const result: FallbackResolution = resolveFallbackHarness(
      chain,
      [],
    );

    expect(result.harness).toBe("claude-code");
    expect(result.attempt).toBe(1);
    expect(result.isFallback).toBe(false);
  });

  it("falls back to next harness after failure", () => {
    const result = resolveFallbackHarness(
      chain,
      ["claude-code"],
    );

    expect(result.harness).toBe("codex");
    expect(result.attempt).toBe(2);
    expect(result.isFallback).toBe(true);
  });

  it("falls back to third harness after two failures", () => {
    const result = resolveFallbackHarness(
      chain,
      ["claude-code", "codex"],
    );

    expect(result.harness).toBe("gemini-cli");
    expect(result.attempt).toBe(3);
    expect(result.isFallback).toBe(true);
  });

  it("returns null when all harnesses exhausted", () => {
    const result = resolveFallbackHarness(
      chain,
      ["claude-code", "codex", "gemini-cli"],
    );

    expect(result.harness).toBeNull();
    expect(result.exhausted).toBe(true);
  });

  it("respects maxRetries limit", () => {
    const limitedChain = createFallbackChain(
      ["claude-code", "codex", "gemini-cli"],
      { maxRetries: 1 },
    );

    // After 1 retry (2 attempts total), stop
    const result = resolveFallbackHarness(
      limitedChain,
      ["claude-code", "codex"],
    );

    expect(result.harness).toBeNull();
    expect(result.exhausted).toBe(true);
  });

  it("skips failed harnesses in resolution order", () => {
    // If codex failed first (out of order), still resolve correctly
    const result = resolveFallbackHarness(
      chain,
      ["codex"],
    );

    // Primary is claude-code, codex failed, so next non-failed is claude-code
    expect(result.harness).toBe("claude-code");
  });
});
