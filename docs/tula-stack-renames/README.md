# Tula Stack Renames

The agent stack packages should be renamed to use the "tula" brand consistently.

## Target Convention

| Current Package | Target Package | Current Dir | Target Dir |
|----------------|---------------|-------------|-----------|
| `@a5c-ai/agent-core` | `@a5c-ai/tula-core` | `packages/agent-core/` | `packages/tula-core/` |
| `@a5c-ai/agent-runtime` | `@a5c-ai/tula-runtime` | `packages/agent-runtime/` | `packages/tula-runtime/` |
| `@a5c-ai/agent-platform` | `@a5c-ai/tula-platform` | `packages/agent-platform/` | `packages/tula-platform/` |
| `@a5c-ai/tula` | `@a5c-ai/tula` (keep) | `packages/tula/` | `packages/tula/` (keep) |

## Scope

### Package References
```bash
# Count references
grep -rl "@a5c-ai/agent-core" packages/ docs/ .github/ --include="*.ts" --include="*.json" --include="*.yml" --include="*.md" | grep -v node_modules | grep -v dist | wc -l
grep -rl "@a5c-ai/agent-runtime" packages/ docs/ .github/ --include="*.ts" --include="*.json" --include="*.yml" --include="*.md" | grep -v node_modules | grep -v dist | wc -l
grep -rl "@a5c-ai/agent-platform" packages/ docs/ .github/ --include="*.ts" --include="*.json" --include="*.yml" --include="*.md" | grep -v node_modules | grep -v dist | wc -l
```

### Import Paths
Every `import ... from "@a5c-ai/agent-core"` etc. needs updating across the monorepo.

### CI/CD
- `.github/workflows/ci.yml` — build steps reference `packages/agent-core`, `packages/agent-platform`, etc.
- `.github/workflows/publish.yml` — publish steps for each package
- `.github/workflows/live-stack.yml` — build phases

### Atlas Graph
- `packages/atlas/graph/agent-stack/` — core-impls, runtime-impls, platform-impls reference these packages

### Documentation
- `docs/agent-layer-gaps.md` — references agent-core, agent-runtime, agent-platform throughout
- `docs/agent-reference/*.md` — architecture docs
- `docs/agent-stack/hooks/*.md` — hook coverage matrix

## Execution Plan

1. `git mv packages/agent-core packages/tula-core`
2. `git mv packages/agent-runtime packages/tula-runtime`
3. `git mv packages/agent-platform packages/tula-platform`
4. Find-replace `@a5c-ai/agent-core` → `@a5c-ai/tula-core` across all files
5. Find-replace `@a5c-ai/agent-runtime` → `@a5c-ai/tula-runtime`
6. Find-replace `@a5c-ai/agent-platform` → `@a5c-ai/tula-platform`
7. Update `packages/agent-core` → `packages/tula-core` in paths
8. Update tsconfig references
9. Regenerate package-lock.json
10. Build and test

## Notes

- The `agent-mux` family keeps its name (it's the multiplexer for ALL agents, not just tula)
- `babysitter-sdk` keeps its name (it's the SDK for the babysitter orchestration engine)
- Only the L4/L5/L6 stack packages that ARE tula get renamed
