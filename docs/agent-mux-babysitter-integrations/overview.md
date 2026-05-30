# Overview — Agent-Mux Babysitter Integration

## Goal

Allow babysitter processes to discover what agents and models are available in the environment and dispatch work to them. When agent-mux is installed, processes gain access to external agents (claude-code, codex, gemini-cli, copilot, etc.) as first-class task targets alongside the internal agent-core session.

## Architecture

```
Process Definition (defineTask)
  │
  ├─ kind: "agent" (internal)
  │   → agent-core session (direct API call, current behavior)
  │
  └─ kind: "agent", external: true, agent: "claude-code"
      → SDK detects agent-mux availability
      → agent-platform resolveEffect routes to amuxBridge
      → agent-mux spawns claude-code with prompt
      → result streamed back through journal
```

## Capability Layers

### Layer 1: Discovery (SDK)
SDK optionally detects agent-mux and queries available agents/models. This information is injected into process creation context so the LLM can make informed decisions about task delegation.

### Layer 2: Task Definition (SDK)
`defineTask` gains support for `agent` kind tasks with an `external` flag. The `agent` field specifies which agent-mux adapter to use. The `model` field specifies which model to request.

### Layer 3: Effect Resolution (agent-platform)
When `orchestrateIteration` encounters an external agent effect, it routes through the existing amuxBridge infrastructure in agent-platform, which already handles harness→adapter mapping, event streaming, and cost tracking.

### Layer 4: Process Authoring (SDK + agent-platform)
Process creation prompts and templates are updated to include available agents/models when agent-mux is detected. The conformance validation is updated to accept external agent tasks.

## Key Constraint

Agent-mux is **optional**. The SDK must work without it. Discovery returns empty results when agent-mux is not installed. External agent tasks fail with a clear error if agent-mux is unavailable at runtime.

## Packages Affected

| Package | Changes |
|---------|---------|
| `packages/sdk` | Discovery API, agent task kind, task intrinsic, process template context |
| `packages/agent-platform` | Effect resolution routing, process prompt updates, validation |
| `packages/agent-core` | None (internal agent tasks unchanged) |
| `packages/agent-mux` | None (existing run/launch API sufficient) |
| `packages/agent-mux/core` | Optional: expose adapter-registry as importable module |

## Non-Goals (This Phase)

- Streaming subagent output back to parent in real-time
- Multi-agent orchestration patterns (group chat, voting across external agents)
- External agent session continuity (each dispatch is a fresh session)
- Cost budget enforcement across external dispatches (tracked but not enforced)
