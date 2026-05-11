# Krate — CLAUDE.md

Kubernetes-native Git forge runtime. Part of the babysitter monorepo.

## Quick Commands

```bash
npm run build     # Generate dist/ JSON snapshots
npm test          # Unit + integration tests (node:test)
npm run e2e       # End-to-end package validation
npm run smoke     # MVP smoke assertions
npm run serve     # Start HTTP API on port 3080
npm run demo      # Print handoff summary
```

## Architecture

- Pure ESM JavaScript (Node 20+, zero external deps)
- Kubernetes-first: all resources are K8s API objects (CRDs or aggregated)
- Control plane (etcd): Organization, User, Team, Repository, Policy
- Data plane (Postgres): PullRequest, Issue, Review, Pipeline, Job
- Git layer (Gitea): Repository storage, branches, SSH keys

## Conventions

- No TypeScript — this is pure JavaScript with JSDoc types
- No external runtime dependencies in core (Node.js built-ins only)
- Web console is in ../web/ (Next.js 16 + React 19)
- Helm chart is in ../charts/ (not an npm workspace)
- Resource taxonomy: 49 kinds across config (etcd) and aggregated (Postgres) storage

## Agent Mux Integration (Future)

- AgentStack, AgentDispatchRun, AgentTriggerRule resources defined in docs/agents/
- Optional peerDependencies on @a5c-ai/agent-mux and @a5c-ai/babysitter-sdk
- Controller/UI/API not yet implemented
