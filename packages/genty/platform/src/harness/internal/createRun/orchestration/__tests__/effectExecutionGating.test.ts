import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EffectAction } from "../../../../../types";
import { resolveEffect } from "../effects";

/**
 * #949 — genty/platform resolveEffect auto-exec / auto-dispatch must be gated:
 *   - shell + node auto-EXECUTION behind BABYSITTER_EXECUTE_TASKS (default OFF)
 *   - agent + skill auto-DISPATCH behind BABYSITTER_CROSS_SUBAGENTS (default OFF)
 *
 * Default OFF => genty EMITS the effect (returns pending) instead of running it,
 * matching the plugin/host emit-only contract. genty's autonomous runtime
 * entrypoint opts these flags ON, so this gating does not regress standalone runs.
 *
 * These assertions are RED until the gating lands: today resolveEffect always
 * executes/dispatches regardless of the env flags.
 */

// Shell auto-exec seam: effects.ts shell branch calls execShellEffect (planProcess),
// node branch calls invokePromptEffect (effectsHelpers), agent/skill dispatch via
// tasks-adapter (resolveViaTasksMuxIfRoutable) and invokeAgentHarness.
const execShellEffect = vi.fn(async () => ({ stdout: "shell ran", stderr: "", exitCode: 0 }));
const invokeAgentHarness = vi.fn(async () => ({ status: "ok", value: "agent ran" }));
const invokePromptEffect = vi.fn(async () => ({ status: "ok", value: "node ran" }));
const routeTask = vi.fn();
const submitBreakpoint = vi.fn();

vi.mock("../../planProcess", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    execShellEffect: (...args: unknown[]) => execShellEffect(...(args as [])),
    buildAgentPrompt: () => "prompt",
    coerceAgentResultValue: (_def: unknown, v: unknown) => v,
  };
});

vi.mock("../effectsHelpers", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    invokeAgentHarness: (...args: unknown[]) => invokeAgentHarness(...(args as [])),
    invokePromptEffect: (...args: unknown[]) => invokePromptEffect(...(args as [])),
    isRetryableEffectError: () => false,
  };
});

vi.mock("@a5c-ai/tasks-adapter", () => ({
  routeTask: (...args: unknown[]) => routeTask(...(args as [])),
  AgentMuxResponderBackend: class {
    submitBreakpoint = (...args: unknown[]) => submitBreakpoint(...(args as []));
  },
}));

const ENV_KEYS = ["BABYSITTER_EXECUTE_TASKS", "BABYSITTER_CROSS_SUBAGENTS"] as const;

function shellAction(): EffectAction {
  return {
    effectId: "eff-shell",
    invocationKey: "key-shell",
    kind: "shell",
    taskDef: {
      kind: "shell",
      title: "Run a shell command",
      shell: { command: "echo", args: ["hi"] },
    },
  } as unknown as EffectAction;
}

function nodeAction(): EffectAction {
  return {
    effectId: "eff-node",
    invocationKey: "key-node",
    kind: "node",
    taskDef: { kind: "node", title: "Run a node task" },
  } as unknown as EffectAction;
}

function agentAction(): EffectAction {
  return {
    effectId: "eff-agent",
    invocationKey: "key-agent",
    kind: "agent",
    taskDef: {
      kind: "agent",
      title: "Dispatch an agent",
      agent: { responderType: "agent", adapter: "codex", prompt: { task: "review" } },
    },
  } as unknown as EffectAction;
}

describe("#949 genty resolveEffect env-gated execution", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    execShellEffect.mockClear();
    invokeAgentHarness.mockClear();
    invokePromptEffect.mockClear();
    routeTask.mockReset();
    submitBreakpoint.mockReset();
    routeTask.mockReturnValue({
      responderType: "agent",
      route: "adapters",
      responder: { id: "codex", adapter: "codex" },
    });
    submitBreakpoint.mockResolvedValue({
      answers: [{ text: "agent ran", responderId: "codex", responderName: "Codex" }],
    });
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
      else delete process.env[k];
    }
    vi.restoreAllMocks();
  });

  describe("shell effects (BABYSITTER_EXECUTE_TASKS)", () => {
    it("does NOT execute the shell command when the flag is unset (emits/pending)", async () => {
      delete process.env.BABYSITTER_EXECUTE_TASKS;
      const result = await resolveEffect(shellAction(), "genty", { workspace: "/repo" });

      expect(execShellEffect).not.toHaveBeenCalled();
      expect(result.status).toBe("pending");
    });

    it("executes the shell command when BABYSITTER_EXECUTE_TASKS=1", async () => {
      process.env.BABYSITTER_EXECUTE_TASKS = "1";
      const result = await resolveEffect(shellAction(), "genty", { workspace: "/repo" });

      expect(execShellEffect).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("ok");
    });
  });

  describe("node effects (BABYSITTER_EXECUTE_TASKS)", () => {
    it("does NOT execute the node task when the flag is unset (emits/pending)", async () => {
      delete process.env.BABYSITTER_EXECUTE_TASKS;
      const result = await resolveEffect(nodeAction(), "genty", { workspace: "/repo" });

      expect(invokePromptEffect).not.toHaveBeenCalled();
      expect(result.status).toBe("pending");
    });

    it("executes the node task when BABYSITTER_EXECUTE_TASKS=1", async () => {
      process.env.BABYSITTER_EXECUTE_TASKS = "1";
      const result = await resolveEffect(nodeAction(), "genty", { workspace: "/repo" });

      expect(invokePromptEffect).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("ok");
    });
  });

  describe("agent effects (BABYSITTER_CROSS_SUBAGENTS)", () => {
    it("does NOT dispatch the agent when the flag is unset (emits/pending)", async () => {
      delete process.env.BABYSITTER_CROSS_SUBAGENTS;
      const result = await resolveEffect(agentAction(), "genty", { workspace: "/repo" });

      // Neither the cross-harness tasks-adapter route nor the harness fallback fires.
      expect(routeTask).not.toHaveBeenCalled();
      expect(submitBreakpoint).not.toHaveBeenCalled();
      expect(invokeAgentHarness).not.toHaveBeenCalled();
      expect(result.status).toBe("pending");
    });

    it("dispatches the agent when BABYSITTER_CROSS_SUBAGENTS=1", async () => {
      process.env.BABYSITTER_CROSS_SUBAGENTS = "1";
      const result = await resolveEffect(agentAction(), "genty", { workspace: "/repo" });

      expect(routeTask).toHaveBeenCalledTimes(1);
      expect(submitBreakpoint).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("ok");
    });
  });
});
