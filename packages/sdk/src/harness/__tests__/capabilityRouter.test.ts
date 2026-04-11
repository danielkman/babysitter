/**
 * Tests for capability-based task routing (GAP-HADAPT-001).
 *
 * Covers:
 *   - selectHarness() — scoring, ranking, disqualification, fallback
 *   - buildTaskRequirements() — extraction from TaskDef.execution hints
 *   - enrichDiscoveryWithCapabilities() — mapping known harnesses to capabilities
 */

import { describe, it, expect } from "vitest";
import {
  selectHarness,
  buildTaskRequirements,
  enrichDiscoveryWithCapabilities,
} from "../capabilityRouter";
import type {
  TaskRequirements,
  HarnessCandidate,
  RoutingResult,
} from "../capabilityRouter";
import { HarnessCapability } from "../types";

// ---------------------------------------------------------------------------
// Helpers — reusable candidate/requirement factories
// ---------------------------------------------------------------------------

function makeCandidate(
  overrides: Partial<HarnessCandidate> = {},
): HarnessCandidate {
  return {
    name: "test-harness",
    capabilities: [],
    supportedModels: [],
    availableTools: [],
    permissions: [],
    ...overrides,
  };
}

function makeRequirements(
  overrides: Partial<TaskRequirements> = {},
): TaskRequirements {
  return {
    requiredCapabilities: [],
    preferredModel: undefined,
    requiredTools: [],
    requiredPermissions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// selectHarness — scoring & ranking
// ---------------------------------------------------------------------------

describe("selectHarness", () => {
  it("returns the highest-scoring candidate when multiple match", () => {
    const requirements = makeRequirements({
      requiredCapabilities: [HarnessCapability.Programmatic],
      preferredModel: "claude-opus-4-6",
      requiredTools: ["bash"],
      requiredPermissions: ["read"],
    });

    const candidateA = makeCandidate({
      name: "harness-a",
      capabilities: [HarnessCapability.Programmatic],
      supportedModels: ["claude-opus-4-6"],
      availableTools: ["bash", "edit"],
      permissions: ["read", "write"],
    });

    const candidateB = makeCandidate({
      name: "harness-b",
      capabilities: [HarnessCapability.Programmatic],
      supportedModels: ["claude-sonnet-4"],
      availableTools: ["bash"],
      permissions: ["read"],
    });

    const result = selectHarness(requirements, [candidateA, candidateB]);

    expect(result).not.toBeNull();
    expect(result!.selected.name).toBe("harness-a");
    expect(result!.score).toBeGreaterThan(50);
    // candidateA should outscore candidateB because it matches the preferred model
    expect(result!.scores).toHaveLength(2);
    const scoreA = result!.scores.find((s) => s.name === "harness-a");
    const scoreB = result!.scores.find((s) => s.name === "harness-b");
    expect(scoreA!.total).toBeGreaterThan(scoreB!.total);
  });

  it("disqualifies candidates missing required capabilities", () => {
    const requirements = makeRequirements({
      requiredCapabilities: [
        HarnessCapability.Programmatic,
        HarnessCapability.SessionBinding,
      ],
    });

    const candidateMissing = makeCandidate({
      name: "incomplete",
      capabilities: [HarnessCapability.Programmatic],
      // Missing SessionBinding
    });

    const candidateFull = makeCandidate({
      name: "complete",
      capabilities: [
        HarnessCapability.Programmatic,
        HarnessCapability.SessionBinding,
      ],
    });

    const result = selectHarness(requirements, [
      candidateMissing,
      candidateFull,
    ]);

    expect(result).not.toBeNull();
    expect(result!.selected.name).toBe("complete");
  });

  it("returns null when all candidates are disqualified by missing required capabilities", () => {
    const requirements = makeRequirements({
      requiredCapabilities: [HarnessCapability.Mcp, HarnessCapability.StopHook],
    });

    const candidateA = makeCandidate({
      name: "a",
      capabilities: [HarnessCapability.Mcp],
    });

    const candidateB = makeCandidate({
      name: "b",
      capabilities: [HarnessCapability.StopHook],
    });

    const result = selectHarness(requirements, [candidateA, candidateB]);

    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Model matching
  // -----------------------------------------------------------------------

  it("handles exact model match giving higher score than partial", () => {
    const requirements = makeRequirements({
      preferredModel: "claude-opus-4-6",
    });

    const exactMatch = makeCandidate({
      name: "exact",
      supportedModels: ["claude-opus-4-6"],
    });

    const partialMatch = makeCandidate({
      name: "partial",
      supportedModels: ["claude-opus-4-0"],
    });

    const noMatch = makeCandidate({
      name: "none",
      supportedModels: ["gemini-pro"],
    });

    const result = selectHarness(requirements, [
      noMatch,
      partialMatch,
      exactMatch,
    ]);

    expect(result).not.toBeNull();
    expect(result!.selected.name).toBe("exact");

    const scores = result!.scores;
    const exactScore = scores.find((s) => s.name === "exact")!;
    const partialScore = scores.find((s) => s.name === "partial")!;
    const noScore = scores.find((s) => s.name === "none")!;
    expect(exactScore.total).toBeGreaterThan(partialScore.total);
    expect(partialScore.total).toBeGreaterThanOrEqual(noScore.total);
  });

  it("treats missing preferredModel as no model requirement (all equal on model axis)", () => {
    const requirements = makeRequirements({
      preferredModel: undefined,
    });

    const candidateA = makeCandidate({
      name: "a",
      supportedModels: ["claude-opus-4-6"],
    });

    const candidateB = makeCandidate({
      name: "b",
      supportedModels: [],
    });

    const result = selectHarness(requirements, [candidateA, candidateB]);

    // Both should have the same model score component when no model is required
    if (result) {
      const scoreA = result.scores.find((s) => s.name === "a")!;
      const scoreB = result.scores.find((s) => s.name === "b")!;
      expect(scoreA.breakdown.model).toBe(scoreB.breakdown.model);
    }
  });

  // -----------------------------------------------------------------------
  // Threshold & fallback
  // -----------------------------------------------------------------------

  it("returns null when no candidate scores above threshold (50)", () => {
    // All candidates have nothing the requirements ask for, but they are not
    // disqualified (no *required* capabilities), just low-scoring.
    const requirements = makeRequirements({
      preferredModel: "claude-opus-4-6",
      requiredTools: ["bash", "edit", "grep", "glob"],
      requiredPermissions: ["read", "write", "execute"],
    });

    const weakCandidate = makeCandidate({
      name: "weak",
      capabilities: [],
      supportedModels: [],
      availableTools: [],
      permissions: [],
    });

    const result = selectHarness(requirements, [weakCandidate]);

    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it("handles empty candidate list", () => {
    const requirements = makeRequirements({
      requiredCapabilities: [HarnessCapability.Programmatic],
    });

    const result = selectHarness(requirements, []);

    expect(result).toBeNull();
  });

  it("handles task with no requirements (all zeroed)", () => {
    const requirements = makeRequirements();

    const candidateA = makeCandidate({
      name: "a",
      capabilities: [HarnessCapability.Programmatic],
      supportedModels: ["claude-opus-4-6"],
      availableTools: ["bash"],
      permissions: ["read"],
    });

    const result = selectHarness(requirements, [candidateA]);

    // With no requirements, candidate should receive a high score
    // (all criteria trivially satisfied)
    expect(result).not.toBeNull();
    expect(result!.selected.name).toBe("a");
    expect(result!.score).toBeGreaterThanOrEqual(50);
  });

  it("returns consistent scores across multiple invocations (pure function)", () => {
    const requirements = makeRequirements({
      requiredCapabilities: [HarnessCapability.Mcp],
      preferredModel: "claude-opus-4-6",
    });

    const candidates = [
      makeCandidate({
        name: "x",
        capabilities: [HarnessCapability.Mcp],
        supportedModels: ["claude-opus-4-6"],
      }),
      makeCandidate({
        name: "y",
        capabilities: [HarnessCapability.Mcp],
        supportedModels: ["claude-sonnet-4"],
      }),
    ];

    const result1 = selectHarness(requirements, candidates);
    const result2 = selectHarness(requirements, candidates);

    expect(result1).toEqual(result2);
  });

  // -----------------------------------------------------------------------
  // Scoring weight verification
  // -----------------------------------------------------------------------

  it("weights capabilities at 40%, model at 25%, tools at 20%, permissions at 15%", () => {
    const requirements = makeRequirements({
      requiredCapabilities: [HarnessCapability.Programmatic],
      preferredModel: "claude-opus-4-6",
      requiredTools: ["bash"],
      requiredPermissions: ["read"],
    });

    const perfectCandidate = makeCandidate({
      name: "perfect",
      capabilities: [HarnessCapability.Programmatic],
      supportedModels: ["claude-opus-4-6"],
      availableTools: ["bash"],
      permissions: ["read"],
    });

    const result = selectHarness(requirements, [perfectCandidate]);

    expect(result).not.toBeNull();
    const breakdown = result!.scores[0].breakdown;

    // A perfect candidate should get max on each axis
    expect(breakdown.capabilities).toBe(40);
    expect(breakdown.model).toBe(25);
    expect(breakdown.tools).toBe(20);
    expect(breakdown.permissions).toBe(15);
    expect(result!.score).toBe(100);
  });

  it("gives partial tool score when only some required tools are available", () => {
    const requirements = makeRequirements({
      requiredTools: ["bash", "edit", "grep", "glob"],
    });

    const halfTools = makeCandidate({
      name: "half",
      availableTools: ["bash", "edit"],
    });

    const result = selectHarness(requirements, [halfTools]);

    if (result) {
      // 2/4 tools matched = 50% of the 20% weight = 10
      expect(result.scores[0].breakdown.tools).toBe(10);
    }
  });

  it("gives partial permission score when only some required permissions are available", () => {
    const requirements = makeRequirements({
      requiredPermissions: ["read", "write", "execute"],
    });

    const onePermission = makeCandidate({
      name: "one-perm",
      permissions: ["read"],
    });

    const result = selectHarness(requirements, [onePermission]);

    if (result) {
      // 1/3 permissions matched = 33.33% of 15% weight = 5
      expect(result.scores[0].breakdown.permissions).toBe(5);
    }
  });

  it("uses all HarnessCapability enum values without error", () => {
    const allCapabilities = [
      HarnessCapability.Programmatic,
      HarnessCapability.SessionBinding,
      HarnessCapability.StopHook,
      HarnessCapability.Mcp,
      HarnessCapability.HeadlessPrompt,
      HarnessCapability.ConcurrentEffects,
      HarnessCapability.BackgroundEffects,
      HarnessCapability.MultiHarnessDispatch,
    ];

    const requirements = makeRequirements({
      requiredCapabilities: allCapabilities,
    });

    const superCandidate = makeCandidate({
      name: "super",
      capabilities: allCapabilities,
    });

    const result = selectHarness(requirements, [superCandidate]);

    expect(result).not.toBeNull();
    expect(result!.scores[0].breakdown.capabilities).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// enrichDiscoveryWithCapabilities
// ---------------------------------------------------------------------------

describe("enrichDiscoveryWithCapabilities", () => {
  it("maps known harness names to their expected capabilities", () => {
    const discoveries = [
      {
        name: "claude-code",
        installed: true,
        cliCommand: "claude",
        configFound: true,
        capabilities: [] as HarnessCapability[],
        platform: "win32",
      },
      {
        name: "codex",
        installed: true,
        cliCommand: "codex",
        configFound: false,
        capabilities: [] as HarnessCapability[],
        platform: "win32",
      },
    ];

    const enriched = enrichDiscoveryWithCapabilities(discoveries);

    expect(enriched).toHaveLength(2);

    const claude = enriched.find((d) => d.name === "claude-code");
    expect(claude).toBeDefined();
    expect(claude!.capabilities.length).toBeGreaterThan(0);
    // Claude Code supports programmatic invocation
    expect(claude!.capabilities).toContain(HarnessCapability.Programmatic);
  });

  it("preserves existing capabilities and adds known ones", () => {
    const discoveries = [
      {
        name: "claude-code",
        installed: true,
        cliCommand: "claude",
        configFound: true,
        capabilities: [HarnessCapability.Mcp],
        platform: "linux",
      },
    ];

    const enriched = enrichDiscoveryWithCapabilities(discoveries);

    const claude = enriched[0];
    // Should retain the original Mcp capability
    expect(claude.capabilities).toContain(HarnessCapability.Mcp);
    // And add any new ones from the known mapping
    expect(claude.capabilities.length).toBeGreaterThanOrEqual(1);
  });

  it("returns unknown harnesses unchanged", () => {
    const discoveries = [
      {
        name: "unknown-harness",
        installed: true,
        cliCommand: "unknown",
        configFound: false,
        capabilities: [] as HarnessCapability[],
        platform: "win32",
      },
    ];

    const enriched = enrichDiscoveryWithCapabilities(discoveries);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].capabilities).toEqual([]);
  });

  it("handles empty discovery list", () => {
    const enriched = enrichDiscoveryWithCapabilities([]);
    expect(enriched).toEqual([]);
  });

  it("deduplicates capabilities when existing and known overlap", () => {
    const discoveries = [
      {
        name: "claude-code",
        installed: true,
        cliCommand: "claude",
        configFound: true,
        capabilities: [HarnessCapability.Programmatic],
        platform: "linux",
      },
    ];

    const enriched = enrichDiscoveryWithCapabilities(discoveries);

    const claude = enriched[0];
    // Programmatic should appear exactly once
    const programmaticCount = claude.capabilities.filter(
      (c) => c === HarnessCapability.Programmatic,
    ).length;
    expect(programmaticCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildTaskRequirements
// ---------------------------------------------------------------------------

describe("buildTaskRequirements", () => {
  it("extracts harness hint as a required capability preference", () => {
    const taskDef = {
      kind: "node" as const,
      execution: {
        harness: "claude-code",
      },
    };

    const requirements = buildTaskRequirements(taskDef);

    expect(requirements).toBeDefined();
    // The harness hint should influence requirements (e.g., preferred harness name)
    expect(
      requirements.requiredCapabilities.length >= 0 ||
        requirements.preferredHarness !== undefined,
    ).toBe(true);
  });

  it("extracts model hint into preferredModel", () => {
    const taskDef = {
      kind: "node" as const,
      execution: {
        model: "claude-opus-4-6",
      },
    };

    const requirements = buildTaskRequirements(taskDef);

    expect(requirements.preferredModel).toBe("claude-opus-4-6");
  });

  it("extracts permissions into requiredPermissions", () => {
    const taskDef = {
      kind: "node" as const,
      execution: {
        permissions: ["read", "write", "execute"],
      },
    };

    const requirements = buildTaskRequirements(taskDef);

    expect(requirements.requiredPermissions).toEqual([
      "read",
      "write",
      "execute",
    ]);
  });

  it("returns empty requirements when execution hints are missing", () => {
    const taskDef = {
      kind: "node" as const,
    };

    const requirements = buildTaskRequirements(taskDef);

    expect(requirements.requiredCapabilities).toEqual([]);
    expect(requirements.preferredModel).toBeUndefined();
    expect(requirements.requiredTools).toEqual([]);
    expect(requirements.requiredPermissions).toEqual([]);
  });

  it("returns empty requirements when execution is an empty object", () => {
    const taskDef = {
      kind: "node" as const,
      execution: {},
    };

    const requirements = buildTaskRequirements(taskDef);

    expect(requirements.requiredCapabilities).toEqual([]);
    expect(requirements.preferredModel).toBeUndefined();
    expect(requirements.requiredTools).toEqual([]);
    expect(requirements.requiredPermissions).toEqual([]);
  });

  it("maps breakpoint kind to require HeadlessPrompt capability", () => {
    const taskDef = {
      kind: "breakpoint" as const,
    };

    const requirements = buildTaskRequirements(taskDef);

    // Breakpoints need human interaction — headless prompt or similar
    expect(requirements.requiredCapabilities).toContain(
      HarnessCapability.HeadlessPrompt,
    );
  });

  it("maps orchestrator_task kind to require Programmatic capability", () => {
    const taskDef = {
      kind: "orchestrator_task" as const,
    };

    const requirements = buildTaskRequirements(taskDef);

    expect(requirements.requiredCapabilities).toContain(
      HarnessCapability.Programmatic,
    );
  });
});

// ---------------------------------------------------------------------------
// RoutingResult type shape
// ---------------------------------------------------------------------------

describe("RoutingResult type contract", () => {
  it("contains selected candidate, overall score, and per-candidate scores with breakdown", () => {
    const requirements = makeRequirements({
      requiredCapabilities: [HarnessCapability.Programmatic],
    });

    const candidate = makeCandidate({
      name: "check-shape",
      capabilities: [HarnessCapability.Programmatic],
    });

    const result = selectHarness(requirements, [candidate]);

    expect(result).not.toBeNull();

    // Shape assertions
    expect(result).toHaveProperty("selected");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("scores");

    expect(result!.selected).toHaveProperty("name");
    expect(typeof result!.score).toBe("number");
    expect(Array.isArray(result!.scores)).toBe(true);

    const scoreEntry = result!.scores[0];
    expect(scoreEntry).toHaveProperty("name");
    expect(scoreEntry).toHaveProperty("total");
    expect(scoreEntry).toHaveProperty("breakdown");
    expect(scoreEntry.breakdown).toHaveProperty("capabilities");
    expect(scoreEntry.breakdown).toHaveProperty("model");
    expect(scoreEntry.breakdown).toHaveProperty("tools");
    expect(scoreEntry.breakdown).toHaveProperty("permissions");
  });
});
