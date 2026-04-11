/**
 * Tests for GAP-HADAPT-008: Harness Selection Policies.
 */

import { describe, it, expect } from "vitest";
import {
  evaluatePolicy,
  getPolicyByName,
  getDefaultPolicy,
  createPolicyEvaluator,
  type PolicyEvaluatorResult,
} from "../selectionPolicies";
import type { HarnessCandidate } from "../capabilityRouter";
import { HarnessCapability as Cap } from "../types";

function makeCandidate(
  name: string,
  caps: Cap[],
  models: string[] = [],
): HarnessCandidate {
  return {
    name,
    capabilities: caps,
    supportedModels: models,
    availableTools: [],
    permissions: [],
  };
}

const fullFeatured = makeCandidate(
  "claude-code",
  [Cap.Programmatic, Cap.SessionBinding, Cap.StopHook, Cap.Mcp, Cap.HeadlessPrompt],
  ["claude-sonnet-4"],
);

const minimal = makeCandidate(
  "codex",
  [Cap.Programmatic, Cap.HeadlessPrompt],
  ["o3"],
);

const mid = makeCandidate(
  "gemini-cli",
  [Cap.Programmatic, Cap.HeadlessPrompt, Cap.StopHook],
  ["gemini-2.5-pro"],
);

describe("selectionPolicies (GAP-HADAPT-008)", () => {
  describe("getDefaultPolicy", () => {
    it("returns capability-first", () => {
      const policy = getDefaultPolicy();
      expect(policy.name).toBe("capability-first");
    });
  });

  describe("getPolicyByName", () => {
    it("returns correct policy for each name", () => {
      expect(getPolicyByName("capability-first").name).toBe("capability-first");
      expect(getPolicyByName("cost-optimized").name).toBe("cost-optimized");
      expect(getPolicyByName("latency-optimized").name).toBe("latency-optimized");
      expect(getPolicyByName("user-preferred").name).toBe("user-preferred");
    });

    it("throws for unknown policy name", () => {
      expect(() => getPolicyByName("unknown" as never)).toThrow();
    });
  });

  describe("createPolicyEvaluator", () => {
    it("returns a function that produces PolicyEvaluatorResult with correct policyName", () => {
      const policy = getPolicyByName("capability-first");
      const evaluate = createPolicyEvaluator(policy);
      const result = evaluate([fullFeatured, minimal], {});
      expect(result.policyName).toBe("capability-first");
      expect(typeof result.score).toBe("number");
    });
  });

  describe("evaluatePolicy", () => {
    describe("capability-first", () => {
      it("delegates to selectHarness and returns highest-scoring candidate", () => {
        const result = evaluatePolicy("capability-first", [fullFeatured, minimal], {});
        expect(result.selected?.name).toBe("claude-code");
        expect(result.policyName).toBe("capability-first");
        expect(result.score).toBeGreaterThan(0);
      });
    });

    describe("cost-optimized", () => {
      it("prefers candidate with fewer capabilities", () => {
        const result = evaluatePolicy("cost-optimized", [fullFeatured, minimal, mid], {});
        // codex has fewest capabilities, should be preferred for cost
        expect(result.selected?.name).toBe("codex");
        expect(result.policyName).toBe("cost-optimized");
      });
    });

    describe("latency-optimized", () => {
      it("prefers candidate with Programmatic + StopHook + SessionBinding capabilities", () => {
        const result = evaluatePolicy("latency-optimized", [fullFeatured, minimal, mid], {});
        // claude-code has StopHook + Programmatic + SessionBinding (highest latency score)
        expect(result.selected?.name).toBe("claude-code");
        expect(result.selected!.capabilities).toContain(Cap.StopHook);
        expect(result.selected!.capabilities).toContain(Cap.Programmatic);
      });
    });

    describe("user-preferred", () => {
      it("returns preferred harness when it qualifies", () => {
        const result = evaluatePolicy(
          "user-preferred",
          [fullFeatured, minimal, mid],
          {},
          { preferredHarness: "codex" },
        );
        expect(result.selected?.name).toBe("codex");
      });

      it("falls back to capability-first when no preference set", () => {
        const result = evaluatePolicy(
          "user-preferred",
          [fullFeatured, minimal],
          {},
        );
        // Without preference, should behave like capability-first
        expect(result.selected?.name).toBe("claude-code");
      });

      it("falls back to capability-first when preferred harness not in candidates", () => {
        const result = evaluatePolicy(
          "user-preferred",
          [fullFeatured, minimal],
          {},
          { preferredHarness: "nonexistent" },
        );
        expect(result.selected?.name).toBe("claude-code");
      });
    });

    it("returns selected: null for empty candidates", () => {
      const result = evaluatePolicy("capability-first", [], {});
      expect(result.selected).toBeNull();
      expect(result.score).toBe(0);
    });

    it("returns selected: null when no candidate meets threshold", () => {
      // Candidate missing required capabilities for breakpoint kind
      const noHeadless = makeCandidate("bare", [], []);
      const result = evaluatePolicy(
        "capability-first",
        [noHeadless],
        { requiredCapabilities: [Cap.HeadlessPrompt] },
      );
      expect(result.selected).toBeNull();
    });

    it("always includes routingResult in result", () => {
      const result = evaluatePolicy("capability-first", [fullFeatured], {});
      expect(result).toHaveProperty("routingResult");
    });

    it("disqualified candidates are excluded regardless of policy", () => {
      // Require SessionBinding — only claude-code has it
      const result = evaluatePolicy(
        "cost-optimized",
        [fullFeatured, minimal, mid],
        { requiredCapabilities: [Cap.SessionBinding] },
      );
      // Even though cost-optimized prefers fewer caps, only claude-code qualifies
      expect(result.selected?.name).toBe("claude-code");
    });
  });
});
