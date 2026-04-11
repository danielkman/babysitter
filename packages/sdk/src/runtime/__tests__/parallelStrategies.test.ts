/**
 * Tests for GAP-PAR-009: Parallel Effect Execution Strategies.
 */

import { describe, it, expect } from "vitest";
import {
  applyStrategy,
  type ParallelStrategyResult,
} from "../parallelStrategies";

describe("parallelStrategies (GAP-PAR-009)", () => {
  describe("all-or-nothing", () => {
    it("returns all results when all succeed", () => {
      const results = [1, 2, 3];
      const errors: Array<{ index: number; error: unknown }> = [];
      const out = applyStrategy("all-or-nothing", results, errors);
      expect(out.results).toEqual([1, 2, 3]);
      expect(out.successCount).toBe(3);
      expect(out.totalCount).toBe(3);
      expect(out.errors).toEqual([]);
      expect(out.strategy).toBe("all-or-nothing");
    });

    it("throws when any effect failed", () => {
      const results = [1, undefined, 3];
      const errors = [{ index: 1, error: new Error("boom") }];
      expect(() =>
        applyStrategy("all-or-nothing", results, errors),
      ).toThrow("boom");
    });

    it("throws first error when multiple fail", () => {
      const results = [undefined, undefined];
      const errors = [
        { index: 0, error: new Error("first") },
        { index: 1, error: new Error("second") },
      ];
      expect(() =>
        applyStrategy("all-or-nothing", results, errors),
      ).toThrow("first");
    });
  });

  describe("best-effort", () => {
    it("returns partial results and errors on mixed outcomes", () => {
      const results = [10, undefined, 30];
      const errors = [{ index: 1, error: new Error("fail") }];
      const out = applyStrategy("best-effort", results, errors);
      expect(out.results).toEqual([10, undefined, 30]);
      expect(out.errors).toHaveLength(1);
      expect(out.successCount).toBe(2);
      expect(out.totalCount).toBe(3);
    });

    it("returns empty results and full errors when all fail", () => {
      const results = [undefined, undefined];
      const errors = [
        { index: 0, error: new Error("a") },
        { index: 1, error: new Error("b") },
      ];
      const out = applyStrategy("best-effort", results, errors);
      expect(out.successCount).toBe(0);
      expect(out.errors).toHaveLength(2);
    });

    it("does not throw on failures", () => {
      const results = [undefined];
      const errors = [{ index: 0, error: new Error("fail") }];
      expect(() =>
        applyStrategy("best-effort", results, errors),
      ).not.toThrow();
    });
  });

  describe("first-success", () => {
    it("returns first successful result", () => {
      const results = [undefined, 42, 99];
      const errors = [{ index: 0, error: new Error("nope") }];
      const out = applyStrategy("first-success", results, errors);
      expect(out.results).toEqual([42]);
      expect(out.successCount).toBe(1);
    });

    it("throws when all fail", () => {
      const results = [undefined, undefined];
      const errors = [
        { index: 0, error: new Error("a") },
        { index: 1, error: new Error("b") },
      ];
      expect(() =>
        applyStrategy("first-success", results, errors),
      ).toThrow();
    });

    it("returns first non-undefined result even if no errors", () => {
      const results = [undefined, "hello"];
      const errors: Array<{ index: number; error: unknown }> = [];
      const out = applyStrategy("first-success", results, errors);
      expect(out.results).toEqual(["hello"]);
    });
  });

  describe("quorum", () => {
    it("passes when enough results meet threshold", () => {
      const results = [1, 2, 3, undefined, undefined];
      const errors = [
        { index: 3, error: new Error("a") },
        { index: 4, error: new Error("b") },
      ];
      const out = applyStrategy("quorum", results, errors, {
        quorumThreshold: 0.5,
      });
      expect(out.successCount).toBe(3);
      expect(out.totalCount).toBe(5);
    });

    it("fails when quorum not met", () => {
      const results = [1, undefined, undefined, undefined, undefined];
      const errors = [
        { index: 1, error: new Error("a") },
        { index: 2, error: new Error("b") },
        { index: 3, error: new Error("c") },
        { index: 4, error: new Error("d") },
      ];
      expect(() =>
        applyStrategy("quorum", results, errors, {
          quorumThreshold: 0.6,
        }),
      ).toThrow(/quorum/i);
    });

    it("throws for empty results array", () => {
      expect(() =>
        applyStrategy("quorum", [], []),
      ).toThrow(/quorum/i);
    });

    it("defaults quorum threshold to 0.5 when not provided", () => {
      const results = [1, 2, undefined];
      const errors = [{ index: 2, error: new Error("x") }];
      // 2/3 >= 0.5 → passes
      const out = applyStrategy("quorum", results, errors);
      expect(out.successCount).toBe(2);
    });
  });

  it("throws TypeError for unknown strategy", () => {
    expect(() =>
      applyStrategy("unknown" as never, [], []),
    ).toThrow(TypeError);
  });

  it("strategy field always matches input strategy name", () => {
    for (const name of [
      "all-or-nothing",
      "best-effort",
      "first-success",
      "quorum",
    ] as const) {
      const out = applyStrategy(name, [1], []);
      expect(out.strategy).toBe(name);
    }
  });
});
