import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  emitProgress,
  formatElapsed,
  createStreamingProgressCallbacks,
} from "../harnessUtils";

describe("Terminal progress output", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  describe("formatElapsed", () => {
    it("formats sub-second durations", () => {
      expect(formatElapsed(0)).toBe("<1s");
      expect(formatElapsed(500)).toBe("<1s");
      expect(formatElapsed(999)).toBe("<1s");
    });

    it("formats seconds", () => {
      expect(formatElapsed(1000)).toBe("1s");
      expect(formatElapsed(1500)).toBe("1s");
      expect(formatElapsed(5000)).toBe("5s");
      expect(formatElapsed(59000)).toBe("59s");
    });

    it("formats minutes and seconds", () => {
      expect(formatElapsed(60000)).toBe("1m 0s");
      expect(formatElapsed(90000)).toBe("1m 30s");
      expect(formatElapsed(125000)).toBe("2m 5s");
      expect(formatElapsed(600000)).toBe("10m 0s");
    });

    it("handles negative values", () => {
      expect(formatElapsed(-100)).toBe("<1s");
    });
  });

  describe("emitProgress — iteration-start", () => {
    it("writes iteration number to stderr in cli mode", () => {
      emitProgress(
        { phase: "2", status: "iteration-start", iteration: 3, elapsedMs: 5000 },
        false,
        false,
        "cli",
      );
      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("iteration 3");
      expect(output).toContain("5s");
    });

    it("outputs JSON in json mode", () => {
      const consoleSpy = vi.spyOn(console, "log").mockReturnValue();
      emitProgress(
        { phase: "2", status: "iteration-start", iteration: 1, elapsedMs: 0 },
        true,
        false,
        "json",
      );
      expect(consoleSpy).toHaveBeenCalled();
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(parsed.status).toBe("iteration-start");
      expect(parsed.iteration).toBe(1);
      consoleSpy.mockRestore();
    });

    it("is silent in tui mode", () => {
      emitProgress(
        { phase: "2", status: "iteration-start", iteration: 1 },
        false,
        false,
        "tui",
      );
      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });

  describe("emitProgress — effect-start", () => {
    it("writes effect kind and title to stderr", () => {
      emitProgress(
        {
          phase: "2",
          status: "effect-start",
          effectKind: "agent",
          effectTitle: "Write tests",
          effectHarness: "claude-code",
        },
        false,
        false,
        "cli",
      );
      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("agent");
      expect(output).toContain("Write tests");
      expect(output).toContain("claude-code");
    });

    it("falls back to effectId when no title", () => {
      emitProgress(
        {
          phase: "2",
          status: "effect-start",
          effectKind: "shell",
          effectId: "eff-123",
        },
        false,
        false,
        "cli",
      );
      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("eff-123");
    });
  });

  describe("emitProgress — iteration-summary", () => {
    it("writes elapsed time and effect count to stderr", () => {
      emitProgress(
        {
          phase: "2",
          status: "iteration-summary",
          iteration: 2,
          effectsResolved: 3,
          elapsedMs: 15000,
        },
        false,
        false,
        "cli",
      );
      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("3");
      expect(output).toContain("15s");
    });

    it("includes token estimate when present", () => {
      emitProgress(
        {
          phase: "2",
          status: "iteration-summary",
          iteration: 1,
          effectsResolved: 1,
          elapsedMs: 2000,
          tokenEstimate: 4500,
        },
        false,
        false,
        "cli",
      );
      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("4500");
    });
  });

  describe("createStreamingProgressCallbacks", () => {
    it("returns StreamingOutputOptions for cli mode", () => {
      const callbacks = createStreamingProgressCallbacks("cli", "claude-code");
      expect(callbacks).toBeDefined();
      expect(callbacks!.onLine).toBeTypeOf("function");
    });

    it("onLine writes to stderr with prefix", () => {
      const callbacks = createStreamingProgressCallbacks("cli", "claude-code");
      callbacks!.onLine!("hello world", "stdout");
      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain("hello world");
    });

    it("truncates long lines", () => {
      const callbacks = createStreamingProgressCallbacks("cli", "test-harness");
      const longLine = "x".repeat(300);
      callbacks!.onLine!(longLine, "stdout");
      const output = stderrSpy.mock.calls[0][0] as string;
      // Should be truncated — not contain the full 300 chars
      expect(output.length).toBeLessThan(350);
    });

    it("returns undefined for json mode", () => {
      const callbacks = createStreamingProgressCallbacks("json", "claude-code");
      expect(callbacks).toBeUndefined();
    });

    it("returns undefined for tui mode", () => {
      const callbacks = createStreamingProgressCallbacks("tui", "claude-code");
      expect(callbacks).toBeUndefined();
    });
  });
});
