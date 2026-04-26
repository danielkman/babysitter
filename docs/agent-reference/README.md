# Agent Reference

Use this directory as the source of truth for repository-level AI agent guidance.
`babysitter/AGENTS.md` and `babysitter/CLAUDE.md` should stay short and point here.

## Start Here

- [Command Surfaces](./command-surfaces.md) explains which CLI surfaces belong to `babysitter` vs `babysitter-harness`, plus the current runs-directory defaults.
- [Repo Map](./repo-map.md) summarizes the monorepo packages, entry points, and high-value dev commands.
- [Runtime And Layout](./runtime-and-layout.md) covers the deterministic replay loop, run directory structure, and event model.
- [Process Authoring Policy](./process-authoring.md) captures the repo-specific rules for creating Babysitter processes for user requests.

## Related Docs

- [Plugins Overview](../plugins.md) explains the plugin model and lifecycle.
- [Plugin CLI Reference](../plugins/cli-reference.md) documents `babysitter plugin:*` commands.
