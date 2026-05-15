# Krate — CLAUDE.md

Kubernetes-native Git forge runtime. Part of the babysitter monorepo.

## Packages

Krate is split into 4 packages under `packages/krate/`:

| Package | Name | Description |
|---------|------|-------------|
| **core** | `@a5c-ai/krate` | Resource model, controllers, HTTP API server, build scripts |
| **sdk** | `@a5c-ai/krate-sdk` | Client SDK — `createKrateApiController`, UI model helpers, auth, resource CRUD |
| **cli** | `@a5c-ai/krate-cli` | CLI entrypoint (`krate`) and MCP server mode (`krate mcp`) |
| **web** | `@a5c-ai/krate-web` | Next.js 16 + React 19 web console |

## Quick Commands

### Core (`packages/krate/core`)

```bash
npm run build     # Generate dist/ JSON snapshots
npm test          # Unit + integration tests (node:test) — 1259 tests
npm run e2e       # End-to-end package validation — 3 tests
npm run smoke     # MVP smoke assertions — 21 checks
npm run serve     # Start HTTP API on port 3080
npm run demo      # Print handoff summary
```

### SDK (`packages/krate/sdk`)

```bash
node --test tests/*.test.js   # SDK export + integration tests — 73 tests
```

### CLI (`packages/krate/cli`)

```bash
node --test tests/*.test.js   # CLI commands + MCP protocol tests — 51 tests
krate serve                   # Start HTTP API server
krate mcp                     # Start MCP (Model Context Protocol) server over stdio
```

### Web (`packages/krate/web`)

```bash
npm run build     # Next.js production build (Turbopack)
npm run dev       # Development server
```

## Architecture

- Pure ESM JavaScript (Node 20+, zero external deps in core)
- Kubernetes-first: all resources are K8s API objects (CRDs or aggregated)
- Control plane (etcd): Organization, User, Team, Repository, Policy
- Data plane (Postgres): PullRequest, Issue, Review, Pipeline, Job
- Git layer (Gitea): Repository storage, branches, SSH keys
- Agent layer: 12+ agent CRDs (stacks, runs, rules, sessions, memory, adapters, providers, projects, workspaces, approvals, permissions)
- External backends: Provider adapters (GitHub first), webhook/sync/write/conflict controllers
- Observability: Audit controller, event streaming, cost tracking

## MCP Server Mode

The CLI provides an MCP server (`krate mcp`) that exposes 14 tools, 3 prompts, and 2 resources over stdio:

**Tools:**
- `krate_snapshot` — org runtime snapshot
- `krate_list_resources` / `krate_get_resource` — read resources by kind
- `krate_apply_resource` / `krate_delete_resource` — write resources
- `krate_search` — full-text resource search
- `krate_list_stacks` / `krate_create_stack` — agent stacks
- `krate_dispatch_agent` — dispatch an agent run
- `krate_list_secrets` / `krate_create_secret` — secret management
- `krate_sync_external` — trigger external sync
- `krate_resolve_conflict` — resolve sync conflict
- `krate_audit_query` — query audit events

**CLI commands:** `krate serve`, `krate mcp`, `krate status`, `krate stacks`, `krate dispatch`, `krate apply`, `krate get`, `krate list`, `krate delete`, `krate version`

## Conventions

- No TypeScript — this is pure JavaScript with JSDoc types
- No external runtime dependencies in core (Node.js built-ins only)
- SDK re-exports core helpers for web/CLI consumers; web imports from `@a5c-ai/krate-sdk`
- Web console is in ../web/ (Next.js 16 + React 19)
- Helm chart is in ../charts/ (not an npm workspace)
- Resource taxonomy: 76 kinds across config (etcd) and aggregated (Postgres) storage, 75 CRDs
- Web console split into 7 modules (lib/krate-ui, lib/page-frame, pages/agent, pages/repo, pages/manage, pages/settings, pages/external)
- Auth middleware on all mutating API routes
- Async kubectl snapshot with stale-while-revalidate cache (30s TTL)

## Agent Mux Integration

- AgentStack, AgentDispatchRun, AgentTriggerRule, AgentSession, AgentMemory and 7+ more resource kinds fully implemented
- Agent adapter, transport binding, provider config, project, gateway, session transcript controllers
- Memory system: repository, source, ontology, query engine, import/snapshot
- Subagent orchestration with dispatch, supervision, tool scoping
- Permission review with cross-org denial, workspace policy enforcement
- External backend providers with GitHub adapter, webhook/sync/write/conflict controllers
