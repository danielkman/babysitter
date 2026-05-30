# Agent Layer Gaps — agent-core (L4), agent-runtime (L5), agent-platform (L6)

Comprehensive inventory of missing capabilities, stub implementations, and architectural weaknesses.

---

## agent-core (L4) — 47 gaps

### Critical (blocks production use)

| Gap | File | Description |
|-----|------|-------------|
| No streaming | `session.ts:200-257` | `prompt()` waits for full response, emits single `text_delta` with everything. No token-by-token streaming. |
| No multi-turn history | `session.ts:217-223` | Messages rebuilt from scratch each call. No persistent conversation context across `prompt()` calls. |
| `abort()` is no-op | `session.ts:332-334` | In-flight API calls cannot be cancelled. AbortController exists but isn't exposed. |
| No structured output | `session.ts`, `types.ts` | No JSON mode, schema validation, or typed returns. All responses are plain text. |
| Token usage discarded | `session.ts:163-177` | Parsed from API response but never returned to caller or tracked cumulatively. |

### High (major feature gaps)

| Gap | File | Description |
|-----|------|-------------|
| No vision/multimodal | `session.ts` | Only text prompts. No image input, no base64, no vision tools. |
| No tool AbortSignal | `types.ts:86-96` | Custom tools can't be cancelled by framework. Each must own its timeout. |
| Token estimation broken | `context/token-estimator.ts` | Hardcoded `chars/4` for all models. Wrong for Claude (~3.5), GPT-4 (~4.2). Context overflow risk. |
| `calc` tool missing | `types.ts:145` | Listed in `AGENT_CORE_TOOL_NAMES` but no implementation exists. Runtime error if called. |
| `initialize()` is no-op | `session.ts:196-198` | No connection warmup, no schema cache, no health check. |
| No DI for LLM client | `session.ts:40-97` | Endpoint resolution hardcoded. Cannot inject custom fetch for testing/mocking. |
| Browser tool fragile | `agenticTools/browser/tool.ts` | Global singleton, no connection pool, no resource limits, screenshot returns metadata not images. |
| Web search hardcoded | `agenticTools/web/tools.ts:47-54` | DuckDuckGo HTML scraping only. No pluggable backend. Fragile to DOM changes. |
| No error types | `agenticTools/shared/results.ts` | All errors → text strings. No `ToolNotFoundError`, `TimeoutError`, etc. |
| Context summary is concatenation | `context/strategies/summary.ts:18-39` | No actual summarization. Evicted entries just joined with newlines. |

### Medium (architectural weaknesses)

| Gap | Description |
|-----|-------------|
| Concurrent strategy naive | `Promise.allSettled` with no per-agent timeout, no partial results, no graceful degradation |
| Group-chat moderator fragile | String matching for agent selection, no validation against agent list |
| Handoff has no state passing | Second agent doesn't know what first agent did. No context transfer. |
| No loop cancellation token | `run()` generator can't be externally cancelled |
| Oversight is single-pass | `maxRetries = 0` hardcoded. Reviewer can reject but no retry mechanism. |
| Delegation timeout ignored | `timeout` parameter accepted but never enforced |
| No plugin/extension API | DeferredToolRegistry exists but minimally integrated |
| No caching anywhere | Tool results, web fetches, schema fetches — nothing cached |
| Hardcoded limits | 50MB output, 120s bash, 30s search — not configurable |
| 7 test files for 59 sources | Agentic tools, error paths, loop strategies untested |
| Endpoint resolution duplicates agent-mux | Provider handling reimplemented instead of shared |

---

## agent-runtime (L5) — 48 gaps

### Critical

| Gap | File | Description |
|-----|------|-------------|
| K8s executor is stub | `execution/modes/kubernetes.ts:52-94` | Manifest builder only. No `kubectl apply`, no log streaming, no completion polling. Marks "running" without executing. |
| No crash recovery | `daemon/lifecycle.ts:78-148` | Daemon death loses all pending work. No auto-restart, no watchdog. |
| Queue is in-memory only | `daemon/loop.ts:37-52` | `const queue: TriggerEvent[] = []`. Lost on restart. No disk-backed persistence. |
| onTrigger errors crash daemon | `daemon/loop.ts:57-70` | Callback errors are unhandled rejections. Single bad trigger crashes everything. |
| Resource budgets not enforced | `resources/manager.ts` | Limits checked but not blocking. Agents can exceed budgets. |
| Telemetry has no export | `telemetry/provider.ts` | InMemoryTelemetryProvider only. Traces lost on process exit. No OTLP, no file export. |

### High

| Gap | File | Description |
|-----|------|-------------|
| No process isolation | `execution/modes/local.ts:50-60` | Full parent env access. No namespaces, chroot, seccomp, or capabilities restriction. |
| No graceful drain | `daemon/lifecycle.ts:152-226` | SIGTERM + grace period, but no coordinated queue drain. Active runs waited but no cancellation signal. |
| No hot reload | `daemon/lifecycle.ts` | Config changes require full restart. Queue/active runs lost. |
| SSH — no verification | `execution/modes/ssh.ts` | StrictHostKeyChecking=no. No retry, no pooling, no keepalive. |
| Docker — no daemon check | `execution/modes/docker.ts` | Assumes Docker running. No image pull check, no resource limits (--cpus/--memory). |
| No dead letter queue | `daemon/loop.ts` | Failed triggers not recorded or retried. No backoff, no failure metrics. |
| No trigger deduplication | `daemon/fileWatcher.ts`, `daemon/timerScheduler.ts` | Same file matching multiple patterns fires multiple times. |
| Background processes — no backpressure | `backgroundProcessRegistry.ts:137-142` | stdout/stderr appended with no size limit. OOM risk on high-output processes. |

### Medium

| Gap | Description |
|-----|-------------|
| No CPU/memory/disk tracking | Only token/cost budgets. No system resource quotas. |
| No admission control | No pre-flight budget check before effect dispatch. |
| Cron — no named days/months, no timezone | Basic 5-field only. No `JAN`, `MON`, `L`, `#N`, `@reboot`. |
| No event-driven triggers | File/webhook/timer only. No message queue (RabbitMQ/Kafka/SQS). |
| No trigger rate limiting | Runaway sender can spam queue. |
| No structured logging | Append-only JSON log. No levels, no filtering, no rotation. |
| Health checks — no percentiles | Average latency only. No P50/P95/P99. |
| No metrics export | Snapshots computed but never sent to monitoring (Prometheus, CloudWatch). |
| No systemd/supervisor integration | Manual start/stop. No restart on reboot. |
| No distributed tracing | No W3C trace context, no OTLP spans. |
| No config migration | No version field. Schema changes break existing daemons. |
| Limited test coverage | No daemon loop integration tests, no crash recovery tests. |

---

## agent-platform (L6) — 40+ gaps

### Critical (blocks platform viability)

| Gap | File | Description |
|-----|------|-------------|
| MCP not integrated | `src/mcp/client/*` | Full MCP client, transport, executor implemented but NOT wired into orchestration. Tool routing disconnected. |
| ConcurrentEffects not implemented | `src/harness/types.ts:30` | Capability declared but effects processed sequentially. No Promise.all batching. |
| Breakpoints not integrated | `src/breakpoints/*` | Approval chains, delegation, postures defined but never invoked during orchestration. |
| Cost tracking not integrated | `src/cost/effectCost.ts` | Per-effect cost aggregation exists but not called during effect resolution. |
| Session budget not enforced | `src/session/cost.ts` | Implemented but never checked in orchestration loop. No auto-pause on exceeded budget. |

### High

| Gap | File | Description |
|-----|------|-------------|
| BackgroundEffects not implemented | `src/harness/types.ts:32` | Declared but no non-blocking effect dispatch. Orchestration blocks on every effect. |
| MultiHarnessDispatch not implemented | `src/harness/types.ts:34` | No support for distributing effects across multiple harnesses. |
| Session history not wired | `src/session/history.ts` | Decision trail and run summary defined but not captured during orchestration. |
| Session compaction not triggered | `src/compression/compaction.ts` | Logic exists but never invoked based on state size thresholds. |
| Capability router unused | `src/harness/capabilityRouter.ts` | Scorer implemented but not used for task routing. |
| Model selection unused | `src/harness/modelSelection.ts` | Exists but not invoked during task dispatch. |
| Fallback chains unused | `src/harness/fallbackChains.ts` | Implemented but never called. |
| Sandbox policy not enforced | `src/governance/sandboxPolicy.ts` | Rules defined but not enforced on tool execution. |
| MCP channels disconnected | `src/mcp/channels/*` | Allowlist, inbound queue, outbound sender exist but not connected to interaction routing. |
| Streaming output not implemented | `src/harness/types.ts:93-100` | Type defined but no streaming callbacks in effect resolution. |

### Medium

| Gap | Description |
|-----|-------------|
| No conditional task routing | Can't branch orchestration based on effect results. |
| No checkpointing | No mid-run savepoints for resuming complex workflows. |
| No rollback/undo | Can't reverse completed effects. |
| No nested orchestration | No sub-orchestrations or workflow composition. |
| No process versioning | Breaking changes in process definitions unmanaged. |
| No multi-agent orchestration | No agent pools, discovery, or load balancing. |
| No tool discovery/registry population | `deferredToolRegistry.ts` exists but not populated. |
| No rate limiting per harness | No token bucket or sliding window. |
| No process dependency management | Tasks within a process can't declare dependencies. |
| Sequential-only orchestration | Orchestration loop is single-stream, single-harness. |
| Session context not available in plan phase | Context injection missing in planProcess. |
| Daemon max concurrent runs hardcoded to 4 | Not configurable. |
| Selection policies unused | `src/harness/selectionPolicies.ts` defined but never called. |

---

## Cross-Layer Integration Gaps

| Gap | Layers | Description |
|-----|--------|-------------|
| Background process registry duplicated | L4↔L5 | Same code in 5 files across agent-core, agent-runtime, agent-platform |
| Shell invocation duplicated | L4↔L5↔L6 | 5 locations with different flags (now unified but still duplicated) |
| Endpoint resolution duplicated | L4↔agent-mux | agent-core reimplements provider handling that agent-mux owns |
| Cost tracking disconnected | L4→L5→L6 | Token usage parsed in L4, budgets in L5, enforcement supposed in L6 — none connected |
| Session state fragmented | L5↔L6 | Runtime has session types, platform has session management — not integrated |
| Telemetry isolated | L5 | In-memory only, never exported to L6 or external systems |
| Resource limits advisory | L5→L6 | Budgets exist in L5, capability routing in L6 — neither enforced at spawn time |

---

## Priority Fix Order

**P0 — Unblock production agent use:**
1. Streaming responses in agent-core session
2. Multi-turn conversation history
3. Wire MCP into agent-platform orchestration
4. Implement ConcurrentEffects (parallel within-harness)
5. Token usage tracking end-to-end

**P1 — Unblock platform features:**
1. Structured output / JSON mode
2. Vision/multimodal input
3. Breakpoint integration into governance
4. Cost budget enforcement in orchestration
5. Background effects (non-blocking dispatch)

**P2 — Production hardening:**
1. K8s executor implementation
2. Crash recovery + persistent queue in daemon
3. Process isolation/sandboxing
4. Distributed tracing (OTLP)
5. Tool cancellation via AbortSignal
