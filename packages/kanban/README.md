# @a5c-ai/kanban

[![npm version](https://img.shields.io/npm/v/@a5c-ai/kanban.svg)](https://www.npmjs.com/package/@a5c-ai/kanban)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Board-, issue-, and workspace-first kanban surface for Babysitter orchestration.

<!-- docs-status:start -->
> Status: Public package.
> Canonical docs home: [Package and Plugin Docs Map](../../docs/package-and-plugin-map.md).
> This README is the canonical product/package overview for the kanban surface.
<!-- docs-status:end -->

## What It Is

`@a5c-ai/kanban` is a single Next.js app under `packages/kanban` that combines:

- board-driven planning and execution
- first-class issue and backlog tracking
- workspace lifecycle inventory and control
- Babysitter run observability
- agent-mux session creation and live session browsing
- hook approval and inbox flows routed through agent-mux

The package is intentionally thin. It should wrap existing `agent-mux` capabilities instead of reimplementing deep gateway, session, or transport logic locally. If the UI needs a capability that does not exist yet, extend `agent-mux` directly and consume it here.

## Target Product Model

`packages/kanban` is not an observer dashboard with a kanban label.
Its target product model is:

- board as the primary planning surface
- issues as the unit of intent, policy, priority, and acceptance
- workspaces as the execution environment owned by those issues
- runs, sessions, breakpoints, and telemetry as observability overlays on top of board execution

That contract keeps the package name honest without pretending the rest of the system should be rebuilt locally. Shared semantics still belong in `agent-mux` and adjacent services; this package should orchestrate and present them.

## Current Product Shape

- Backlog API backed by shared issue, project, and board snapshots
- Dashboard board with workflow columns, swimlanes, policy hooks, and move validation
- Workspace lifecycle inventory and recovery/archive/cleanup controls
- Run dashboard with live updates from Babysitter watcher state
- Session browser and new-session flow backed by agent-mux
- Reconstructed session execution views with flow, timeline, transcript, and file-attention tabs
- Gateway login and token persistence for local agent-mux access
- Inbox and hook approval surfaces backed by agent-mux UI primitives
- Compendium-based shell, forms, buttons, and branding primitives
- Settings page for runtime and gateway visibility

## Realtime Session Execution View

`@a5c-ai/kanban` now ships the shared reconstructed execution view in two places:

- session pages at `sessions/[sessionId]`, where session review sits alongside prompt input, runtime links, and execution-context overlays
- the run detail activity panel at `runs/[runId]`, where users can switch from the raw event stream into the same realtime flow view

That view is projected from live `agent-mux` event buffers through `@a5c-ai/agent-mux-ui/session-flow`, and exposes:

- flow lanes grouped by run/agent
- chronological timeline entries across the selected session or run
- reconstructed transcript turns
- file-attention summaries and shortcuts into the workspace/runtime when available

This package owns where the view appears in the kanban product. The reusable projection/model logic still belongs in `agent-mux-ui`.

## Task Tags Specification

Full parity planning for original Vibe Kanban-style `Task Tags` now lives in [specs/task-tags-spec.md](./specs/task-tags-spec.md).

That spec defines reusable snippet tags as a separate feature from issue labels and captures:

- shared type ownership between `packages/agent-mux/core` and `packages/kanban`
- expected Settings/API/editor surfaces in `packages/kanban`
- implementation slices and acceptance criteria
- CI/release contracts through the existing `kanban` workflow and central release pipelines

## Dispatch Context Labels Specification

Structured planning for `Dispatch Context Labels` now lives in [specs/dispatch-context-labels-spec.md](./specs/dispatch-context-labels-spec.md), with backlog decomposition in [specs/dispatch-context-labels-subtasks.md](./specs/dispatch-context-labels-subtasks.md).

This feature is intentionally separate from both Task Tags and issue labels:

- issue labels continue to categorize board/project work
- Task Tags continue to insert reusable freeform snippets with `@`
- Dispatch Context Labels carry structured task/issue context into dispatched-agent execution
- default agent settings still choose the executor/profile rather than the work-item context

The specification captures:

- shared type ownership between `packages/agent-mux/core` and `packages/kanban`
- first-phase package-local storage/API ownership in `packages/kanban`
- dispatch-time projection and post-dispatch auditability expectations
- CI/release contracts tied to the existing `kanban` package and repo workflows
- package-local verification through `test:dispatch-context-labels` and `verify:release`

## Remaining Gaps

The package still has meaningful product gaps, but they are now downstream of the target model rather than evidence that the package should be treated as observability-first:

- Dispatch Context Labels are now specified but not yet shipped
- deeper review and diff workflows
- richer preview and runtime surfaces per workspace
- repository and pull-request lifecycle controls
- multi-user collaboration and permissions

## Quick Start

### Run directly from the monorepo

```bash
npm install
npm run build --workspace=@a5c-ai/kanban
npm run build:cli --workspace=@a5c-ai/kanban
npm run start --workspace=@a5c-ai/kanban
```

### Development

```bash
npm run dev --workspace=@a5c-ai/kanban
```

The app runs on `http://localhost:4800` by default.

## CLI

The package also publishes a `kanban` CLI entrypoint:

```bash
kanban --help
```

The CLI launches the packaged Next.js app for the kanban surface with the same packaging flow used in the monorepo.

## Design System

The app should use the Compendium design system for user-facing controls and shared branding. When new UI is added:

- prefer Compendium components first
- keep local styling aligned with existing Compendium tokens
- avoid adding one-off primitives when Compendium already covers the case

## Scope Boundaries

- `packages/kanban` owns the Next.js shell and Babysitter-specific workflow presentation
- `packages/agent-mux` owns deep gateway, session, transport, shared kanban primitives, and the reusable `session-flow` projection seam
- missing transport or session features should be added to `agent-mux`, then consumed here

## Release Verification

Use the existing release checks to confirm the documented surface still matches what ships:

```bash
npm run build --workspace=@a5c-ai/kanban
npm run build:cli --workspace=@a5c-ai/kanban
npm run test:realtime --workspace=@a5c-ai/kanban
npm run verify:release --workspace=@a5c-ai/kanban
npm run verify:metadata
npm pack --json --dry-run --workspace=@a5c-ai/kanban
```

Release reviewers should be able to infer from this README that the package now includes the reconstructed session execution view on session pages and in run activity, without reading the implementation.

## Gap Map

Feature gaps versus the original Vibe Kanban implementation are tracked in [gaps-and-debt.md](./gaps-and-debt.md).
