# External Agent Tasks

## Summary

Extend the `agent` task kind with an `external` flag that routes execution through agent-mux instead of the internal agent-core session. This lets processes delegate specialist work to the best available agent.

## Task Definition API

### Current (internal only)
```javascript
const analyzeTask = defineTask("analyze", (args) => ({
  kind: "agent",
  title: "Analyze codebase",
  agent: { name: "Analyzer", prompt: "Analyze the code..." },
}));
```

### New (external via agent-mux)
```javascript
const reviewTask = defineTask("review", (args) => ({
  kind: "agent",
  title: "Code review via Claude Code",
  agent: {
    name: "Code Reviewer",
    prompt: "Review the changes in the working directory...",
    external: true,           // NEW — dispatch via agent-mux
    adapter: "claude-code",   // NEW — which agent-mux adapter
    model: "claude-sonnet-4-6", // optional — model override
    provider: "anthropic",    // optional — provider override
    timeout: 300_000,         // optional — per-task timeout
    approvalMode: "yolo",     // optional — auto-approve tool use
    maxTurns: 10,             // optional — conversation turn limit
  },
}));
```

### Fallback behavior
```javascript
const flexibleTask = defineTask("flexible-review", (args) => ({
  kind: "agent",
  title: "Code review",
  agent: {
    name: "Reviewer",
    prompt: "Review the code...",
    external: true,
    adapter: "claude-code",
    // If claude-code not installed, fall back to internal agent-core
    fallbackToInternal: true,  // NEW — graceful degradation
  },
}));
```

## SDK Changes

### `packages/sdk/src/tasks/types.ts`

```typescript
interface AgentTaskOptions {
  name: string;
  prompt: string | { instructions: string[] };
  outputSchema?: Record<string, unknown>;
  // New fields for external dispatch:
  external?: boolean;
  adapter?: string;           // agent-mux adapter name
  model?: string;             // model override
  provider?: string;          // provider override
  timeout?: number;           // per-task timeout
  approvalMode?: "yolo" | "prompt";
  maxTurns?: number;
  fallbackToInternal?: boolean;
}

// Add to TaskDef
interface TaskDef {
  kind: TaskKind;
  agent?: AgentTaskOptions;   // existing field, extended
  // ...
}
```

### `packages/sdk/src/tasks/kinds/index.ts`

Add helper function:

```typescript
export function externalAgentTask(
  adapter: string,
  prompt: string,
  options?: { model?: string; timeout?: number; maxTurns?: number }
): Partial<TaskDef> {
  return {
    kind: "agent",
    agent: {
      name: adapter,
      prompt,
      external: true,
      adapter,
      ...options,
    },
  };
}
```

### `packages/sdk/src/runtime/intrinsics/task.ts`

In `runTaskIntrinsic()`, when the task kind is `"agent"` and `agent.external` is true:
- Validate that `agent.adapter` is set
- Set metadata flag `externalDispatch: true` on the effect
- The rest happens in effect resolution (agent-platform side)

## Files to Create/Modify

### New Files
- `packages/sdk/src/tasks/kinds/externalAgent.ts` — helper functions
- `packages/sdk/src/tasks/__tests__/externalAgent.test.ts` — unit tests

### Modified Files
- `packages/sdk/src/tasks/types.ts` — extend AgentTaskOptions, add external fields
- `packages/sdk/src/tasks/kinds/index.ts` — export externalAgentTask helper
- `packages/sdk/src/runtime/intrinsics/task.ts` — handle external flag in effect dispatch
- `packages/sdk/src/index.ts` — export new types

## Validation Rules

In `packages/agent-platform/src/harness/internal/createRun/planProcess/validationSource.ts`:
- Accept `external: true` on agent tasks
- Validate `adapter` is a non-empty string when `external: true`
- Warn (not error) if adapter is not in discovered agents list

## Process Template Update

When external agents are available, the process definition template should mention:

```
You may use external agent tasks to delegate work to installed agents:
- defineTask("id", (args) => ({
    kind: "agent",
    agent: { name: "...", prompt: "...", external: true, adapter: "claude-code" }
  }))
Available adapters: claude-code, codex, gemini-cli, ...
```
