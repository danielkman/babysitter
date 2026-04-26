# Runtime And Layout

This page is the short runtime model for contributors who need to reason about replay, run state, or journal repair.

## Deterministic Replay Loop

The core orchestration flow spans the SDK runtime and storage layers:

1. Acquire `run.lock`.
2. Build the replay engine from `run.json`, the journal, and the derived state cache.
3. Import the process entrypoint.
4. Run the process inside `withProcessContext(...)`.
5. When the process requests an unresolved effect, the runtime throws an effect-pending exception instead of executing side effects inline.
6. External orchestration resolves effects and posts results through `babysitter task:post`.
7. The next iteration replays resolved effects and advances deterministically.

Relevant source roots:

- [`packages/sdk/src/runtime/`](../../packages/sdk/src/runtime)
- [`packages/sdk/src/storage/`](../../packages/sdk/src/storage)
- [`packages/sdk/src/tasks/`](../../packages/sdk/src/tasks)

## Run Directory Layout

Default layout under the active runs root:

```text
<runsRoot>/<runId>/
├── run.json
├── inputs.json
├── run.lock
├── journal/
├── tasks/<effectId>/
├── state/state.json
├── blobs/
└── process/
```

Use the active runs root from [Command Surfaces](./command-surfaces.md): global `~/.a5c/runs` by default, repo-local only when configured or when probing legacy runs.

## Journal Event Model

The event stream is append-only and centers on:

- `RUN_CREATED`
- `EFFECT_REQUESTED`
- `EFFECT_RESOLVED`
- `RUN_COMPLETED`
- `RUN_FAILED`

The state cache is derived data. If it drifts from the journal, repair with `run:rebuild-state`. If journal entries are malformed or partially written, use `run:repair-journal` carefully after inspecting the affected run.

## Effects

Processes request work through `ProcessContext` intrinsics such as:

- `ctx.task()`
- `ctx.breakpoint()`
- `ctx.sleepUntil()`
- `ctx.orchestratorTask()`
- `ctx.hook()`
- `ctx.parallel.all()` and `ctx.parallel.map()`

Those APIs are part of the SDK runtime contract, not ad hoc process behavior. Changes here need replay, serialization, and state-cache discipline.
