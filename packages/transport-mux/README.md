# transport-mux

`transport-mux` is the active runtime and release owner for the `amux-proxy` transport/proxy surface. This package exports the in-process runtime modules used by `amux launch`, ships the `amux-proxy` executable, and is the package published by the root release and staging workflows.

## Current status

This workspace now carries the active server/config/runtime surface in `src/`, and `amux launch` imports `@a5c-ai/transport-mux` when it prepares proxy runtime behavior for harnesses that need protocol bridging.

## Intended seam

The control-plane shape is:

1. `packages/agent-mux/cli/src/commands/launch.ts` decides whether a proxy is needed.
2. `packages/agent-mux/core/src/provider-resolver.ts` resolves canonical provider config.
3. `packages/agent-mux/adapters/src/translate-for-harness.ts` chooses the harness-facing protocol contract.
4. `packages/transport-mux` owns the exposed protocol handling and provider execution path.

Historical references still exist under `packages/agent-mux/amux-proxy`, but they are archival only and no longer define runtime, CI, or publish truth.

## What this package means right now

- it is the active npm release owner for the transport/proxy surface
- `src/config.ts`, `src/server.ts`, `src/runtime.ts`, and `src/types.ts` provide the runtime used by this workspace
- the published package ships the `amux-proxy` executable
- the docs capture the protocol/provider split and the historical archive boundary

## Operator checks

Use these workspace gates when changing the active runtime surface or its migration docs:

```bash
npm run build --workspace=@a5c-ai/transport-mux
npm run test --workspace=@a5c-ai/transport-mux
npm run scorecard:migration --workspace=@a5c-ai/transport-mux
```

Passing those commands proves the active package still compiles, its runtime tests still pass, and the migration scorecard still sees one owner for runtime/release truth.

## Current document set

- [Architecture](./architecture.md): intended protocol/provider boundaries and route contract
- [Migration](./migration.md): cutover state and archived legacy references
