# Workspace Validation Map

This document is the repo-level source of truth for which npm workspaces are active, which ones are release-critical, and which workflow path validates them.

If a workspace stays active, it must meet one of these conditions:

- it is validated in `.github/workflows/ci.yml`
- it is validated in the release/staging workflows because that is the only meaningful contract surface
- it is explicitly called out here as intentionally excluded

## Release-critical workspace families

These workspaces ship public packages or release-facing operational behavior. They are expected to stay aligned with both CI and release workflows.

| Workspace or family | Role | Validation path |
| --- | --- | --- |
| `packages/sdk` (`@a5c-ai/babysitter-sdk`) | Core SDK and CLI runtime | `.github/workflows/ci.yml` jobs `test` and `packages-sdk`, plus `release.yml` and `staging-publish.yml` |
| `packages/breakpoints-mux` | Published breakpoint runtime | `.github/workflows/ci.yml` job `test`, plus `release.yml` and `staging-publish.yml` |
| `packages/agent-plugins-mux` | Published plugin compiler/runtime package | `.github/workflows/ci.yml` job `test`, plus `release.yml` and `staging-publish.yml` |
| `packages/kanban` (`@a5c-ai/kanban`) | Published kanban package and CLI, including Task Tags spec/feature slices | `.github/workflows/ci.yml` job `kanban`, plus `release.yml` and `staging-publish.yml` |
| `packages/observer-dashboard` | Published observer dashboard package | `.github/workflows/ci.yml` job `observer-dashboard`, plus `release.yml` and `staging-publish.yml` |
| `packages/hooks-mux/*` | Published hooks-mux packages | `.github/workflows/ci.yml` job `test`, plus `release.yml` and `staging-publish.yml` |
| `packages/agent-mux/*` | Published agent-mux packages | `.github/workflows/ci.yml` job `test`, plus `release.yml` and `staging-publish.yml` |
| `packages/babysitter` and `plugins/babysitter-*` | Published metapackage and harness plugin packages | `.github/workflows/ci.yml` job `test`, plus `release.yml` and `staging-publish.yml` |

## Internal-only active workspaces

These workspaces are part of the active monorepo and ship code or operational behavior inside the repo, but they are not current public publish targets.

| Workspace | Role | Validation path |
| --- | --- | --- |
| `packages/agent-core` | Internal harness support package | `.github/workflows/ci.yml` job `test`, plus `release.yml` and `staging-publish.yml` |
| `packages/babysitter-agent` | Internal harness runtime CLI | `.github/workflows/ci.yml` job `test` |
| `packages/agent-catalog` | private, non-release workspace package for the metadata catalog consumed by SDK, agent-mux, hooks-mux, plugin compiler, and catalog UI | `.github/workflows/ci.yml` job `workspace-coverage` |
| `packages/catalog` | Internal Next.js catalog UI | `.github/workflows/ci.yml` job `workspace-coverage` |
| `packages/babysitter-tui-plugins` | Internal TUI plugin package for babysitter observability | `.github/workflows/ci.yml` job `workspace-coverage` |
| `packages/transport-mux` | Internal transport/proxy runtime workspace with package-local QA commands | `.github/workflows/ci.yml` job `workspace-coverage` (`build` + `lint` + `typecheck` + `test` + `scorecard:migration`) |

## Explicit exclusions

There are currently no active npm workspaces that are intentionally excluded from validation. `packages/transport-mux` now participates in the workspace-coverage job through its package-local `lint`, `typecheck`, and `test` commands alongside `build` and `scorecard:migration`.
