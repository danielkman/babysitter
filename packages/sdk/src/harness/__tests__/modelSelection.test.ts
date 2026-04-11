/**
 * Tests for GAP-HADAPT-002: Model Selection Per Task.
 */

import { describe, it, expect } from "vitest";
import {
  resolveModelForTask,
  type ModelSelectionResult,
} from "../modelSelection";
import type { HarnessCandidate } from "../capabilityRouter";
import { HarnessCapability as Cap } from "../types";

function makeCandidate(
  name: string,
  caps: Cap[],
  model?: string,
): HarnessCandidate {
  return {
    name,
    capabilities: caps,
    supportedModels: model ? [model] : [],
    availableTools: [],
    permissions: [],
  };
}

const claudeCode = makeCandidate(
  "claude-code",
  [Cap.Programmatic, Cap.SessionBinding, Cap.StopHook, Cap.Mcp, Cap.HeadlessPrompt],
  "claude-sonnet-4",
);

const codex = makeCandidate(
  "codex",
  [Cap.Programmatic, Cap.HeadlessPrompt],
  "o3",
);

const gemini = makeCandidate(
  "gemini-cli",
  [Cap.Programmatic, Cap.HeadlessPrompt],
  "gemini-2.5-pro",
);

describe("resolveModelForTask (GAP-HADAPT-002)", () => {
  it("selects harness matching task model preference", () => {
    const result: ModelSelectionResult = resolveModelForTask(
      { kind: "agent", execution: { model: "o3" } },
      [claudeCode, codex, gemini],
    );

    expect(result.selectedHarness).toBe("codex");
    expect(result.selectedModel).toBe("o3");
    expect(result.reason).toContain("model");
  });

  it("returns default harness when no model preference", () => {
    const result = resolveModelForTask(
      { kind: "agent" },
      [claudeCode, codex],
    );

    expect(result.selectedHarness).toBeDefined();
    expect(result.selectedModel).toBeUndefined();
  });

  it("falls back when no harness matches preferred model", () => {
    const result = resolveModelForTask(
      { kind: "agent", execution: { model: "gpt-5" } },
      [claudeCode, codex],
    );

    expect(result.selectedHarness).toBeDefined();
    expect(result.fallback).toBe(true);
  });

  it("returns null when no candidates available", () => {
    const result = resolveModelForTask(
      { kind: "agent", execution: { model: "o3" } },
      [],
    );

    expect(result.selectedHarness).toBeNull();
  });

  it("respects required capabilities alongside model preference", () => {
    const result = resolveModelForTask(
      { kind: "breakpoint", execution: { model: "gemini-2.5-pro" } },
      [claudeCode, codex, gemini],
    );

    // breakpoint requires HeadlessPrompt — all have it, but gemini matches model
    expect(result.selectedHarness).toBe("gemini-cli");
  });

  it("prefers exact model match over family match", () => {
    const sonnet = makeCandidate(
      "claude-sonnet",
      [Cap.Programmatic, Cap.HeadlessPrompt],
      "claude-sonnet-4",
    );
    const opus = makeCandidate(
      "claude-opus",
      [Cap.Programmatic, Cap.HeadlessPrompt],
      "claude-opus-4",
    );

    const result = resolveModelForTask(
      { kind: "agent", execution: { model: "claude-opus-4" } },
      [sonnet, opus],
    );

    expect(result.selectedHarness).toBe("claude-opus");
  });
});
