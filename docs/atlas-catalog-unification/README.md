# Atlas + Agent-Catalog Unification

`packages/agent-catalog/` should be unified into `packages/atlas/`. Only atlas packages should remain.

## Current State

| Package | Dir | Purpose |
|---------|-----|---------|
| `@a5c-ai/atlas` | `packages/atlas/` | Graph schema, indexer, YAML loader, CLI, webui |
| `@a5c-ai/agent-catalog` | `packages/agent-catalog/` | Agent discovery, capability metadata, SDK integration |

## Overlap

Both packages deal with structured metadata about agents, models, and capabilities:
- **atlas**: graph nodes/edges in YAML, indexed at build time
- **agent-catalog**: runtime agent discovery, capability scoring, metadata queries

The agent-catalog is essentially the runtime query layer on top of atlas graph data.

## Target

Merge `agent-catalog` INTO `atlas` as a submodule or integrated source:

| Current | Target |
|---------|--------|
| `@a5c-ai/agent-catalog` | `@a5c-ai/atlas` (merged) |
| `packages/agent-catalog/src/` | `packages/atlas/src/catalog/` |
| `packages/agent-catalog/src/discovery.ts` | `packages/atlas/src/catalog/discovery.ts` |
| `packages/agent-catalog/src/models.ts` | `packages/atlas/src/catalog/models.ts` |
| `packages/agent-catalog/src/sdk.ts` | `packages/atlas/src/catalog/sdk.ts` |
| `packages/agent-catalog/src/data.ts` | `packages/atlas/src/catalog/data.ts` |

## References to Update

All packages importing `@a5c-ai/agent-catalog` need to switch to `@a5c-ai/atlas/catalog` or `@a5c-ai/atlas`:

```bash
grep -rl "@a5c-ai/agent-catalog" packages/ --include="*.ts" --include="*.json" | grep -v node_modules | grep -v dist
```

Key consumers:
- `packages/agent-platform/` — uses catalog for harness discovery, model selection
- `packages/agent-mux/adapters/` — uses catalog for adapter capabilities
- `packages/sdk/` — uses catalog for process library metadata

## Execution Plan

1. Move `packages/agent-catalog/src/*` → `packages/atlas/src/catalog/`
2. Update `packages/atlas/package.json` to include catalog exports
3. Add `@a5c-ai/atlas/catalog` export path
4. Find-replace `@a5c-ai/agent-catalog` → `@a5c-ai/atlas/catalog` (or `@a5c-ai/atlas`)
5. Remove `packages/agent-catalog/` directory
6. Update root workspace, tsconfig, CI
7. Regenerate lockfile
8. Build and test

## Build Order Impact

Currently atlas builds first (phase 1), then agent-catalog (phase 1). After merge, only atlas needs to build in phase 1.
