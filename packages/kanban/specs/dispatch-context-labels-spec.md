# Dispatch Context Labels Specification

## Purpose

This document defines `Dispatch Context Labels` for [`packages/kanban`](../README.md) as a feature family separate from both issue labels and Task Tags.

The feature exists to let a task or issue carry reusable, structured context into the dispatched agent experience without:

- mutating board categorization labels
- relying on freeform Task Tag snippet expansion
- overloading default agent/profile selection

## Scope

This specification covers:

- shared type ownership for dispatch-context label definitions and attachments
- first-phase package-local storage and API ownership
- settings and issue/task attachment UX expectations
- deterministic projection into dispatch/attempt/workspace/session context
- auditability requirements after dispatch
- testing, packaging, and CI/release compatibility

This specification does not claim the feature is already implemented.

## Relationship To Existing Concepts

### Issue labels

Current shared kanban types already expose `KanbanLabel` for issue/project categorization in [`packages/agent-mux/core/src/kanban.ts`](../../agent-mux/core/src/kanban.ts).

Those labels remain responsible for:

- categorization
- filtering
- board/project semantics

They must **not** be repurposed as prompt-context instructions.

### Task Tags

[`task-tags-spec.md`](./task-tags-spec.md) defines reusable `@`-inserted snippets for descriptions and follow-ups.

Task Tags remain responsible for:

- text authoring acceleration
- editable snippet insertion
- freeform prompt scaffolding

They must **not** become structured dispatch metadata.

### Default agent and profile settings

Default agent configuration selects the executor/profile/variant used for attempts and follow-ups.

Dispatch Context Labels remain responsible for:

- what contextual instructions follow the work item into execution

They do **not** choose:

- which agent runs
- which profile/variant is selected
- which workspace policy is active

## Product Definition

### What a Dispatch Context Label is

A `Dispatch Context Label` is a reusable label definition whose meaning is rendered into dispatched-agent context in a deterministic, inspectable way.

Examples:

- `strict_api_contract`
- `preserve_migrations`
- `ui_copy_review`
- `tests_first`
- `no_schema_changes`

Each label definition carries:

- a stable key
- a human-readable label
- optional help text
- a deterministic instruction payload or renderable context block
- ordering metadata

Each issue/task may attach zero or more dispatch-context labels by reference.

### What a Dispatch Context Label is not

A Dispatch Context Label is not:

- a `KanbanLabel` used for board categorization
- a Task Tag snippet inserted into freeform text
- a default agent/profile setting
- an invisible prompt macro with no audit trail

## First-Phase Ownership

### Shared type ownership

Shared types and normalization helpers belong in:

- [`packages/agent-mux/core/src/kanban.ts`](../../agent-mux/core/src/kanban.ts)
- [`packages/agent-mux/core/tests/kanban.test.ts`](../../agent-mux/core/tests/kanban.test.ts)

This is the seam that keeps `packages/kanban` from inventing a UI-only model.

### First-phase storage and CRUD ownership

Unless the same milestone explicitly promotes storage into a shared system of record, first-phase persistence and CRUD belong in `packages/kanban`:

- [`packages/kanban/src/lib/services/kanban-storage.ts`](../src/lib/services/kanban-storage.ts)
- [`packages/kanban/src/lib/services/backlog-query-service.ts`](../src/lib/services/backlog-query-service.ts)
- [`packages/kanban/src/app/api/backlog/route.ts`](../src/app/api/backlog/route.ts)
- [`packages/kanban/src/hooks/use-backlog.ts`](../src/hooks/use-backlog.ts)

That means:

- shared types live in `agent-mux`
- local file-backed storage starts in `kanban`
- migration to shared storage remains possible later

## Proposed Data Model

The implementation should target structures equivalent to:

```ts
interface KanbanDispatchContextLabelDefinition {
  id: string;
  key: string;
  label: string;
  instruction: string;
  description?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface KanbanDispatchContextLabelRef {
  labelId: string;
}
```

The issue model should then gain an attachment seam equivalent to one of:

```ts
dispatch: {
  contextLabels: readonly KanbanDispatchContextLabelRef[];
}
```

or

```ts
dispatchContextLabels: readonly KanbanDispatchContextLabelRef[];
```

The final placement is an implementation detail, but the spec requires:

- attachment by reference, not by copying prompt text
- deterministic render order
- stable keys for auditability and testing
- coexistence with existing `labels`

## Rendering Contract

Dispatch Context Labels must project into execution through an explicit render step rather than ad-hoc string concatenation hidden in UI code.

The spec requires a helper seam equivalent to:

```ts
renderDispatchContextLabels(
  definitions: KanbanDispatchContextLabelDefinition[],
  refs: KanbanDispatchContextLabelRef[],
): string
```

Minimum rendering rules:

- render order is stable and deterministic
- rendered output is inspectable before or at dispatch time
- the rendered block does not overwrite the issue description
- the rendered block can be traced back to the attached label ids/keys

## Auditability Requirements

Applied Dispatch Context Labels must remain visible in execution-adjacent surfaces.

The first implementation phase should plan for visibility in or through:

- backlog issue state
- dispatch or attempt-creation UI
- workspace/session execution context views
- run/session detail surfaces that explain what context was sent

Relevant current paths include:

- [`packages/kanban/src/app/settings/page.tsx`](../src/app/settings/page.tsx)
- [`packages/kanban/src/app/sessions/[sessionId]/page.tsx`](../src/app/sessions/[sessionId]/page.tsx)
- [`packages/kanban/src/components/workspaces/workspace-runtime-panel.tsx`](../src/components/workspaces/workspace-runtime-panel.tsx)
- [`packages/kanban/src/components/details/agent-panel.tsx`](../src/components/details/agent-panel.tsx)

The exact UI surface can phase in over time, but the feature is underspecified unless the implementation can answer:

1. Which dispatch-context labels were attached?
2. What did they render into?
3. Where can a reviewer see that after dispatch?

## API And Storage Expectations

### Reusable definition management

The first phase should support reusable definition CRUD. This may use dedicated routes or backlog-route actions, but the semantics must cover:

- list definitions
- create definition
- edit definition
- delete definition

### Issue/task attachment management

The first phase should also support attaching/removing label refs from issues/tasks.

If the backlog route remains consolidated, the route contract must still preserve distinct intent between:

- managing reusable definitions
- attaching refs to issues
- updating board categorization labels

## UX Requirements

### Settings management

`packages/kanban` should expose a management surface for reusable definitions, likely starting in:

- [`packages/kanban/src/app/settings/page.tsx`](../src/app/settings/page.tsx)

The surface must support:

- list existing definitions
- create new definition
- edit definition
- delete definition
- validate duplicate/invalid keys

### Issue/task attachment

Users must be able to attach/remove dispatch-context labels from the relevant issue/task flow.

The spec intentionally allows that to land in either:

- issue detail / issue authoring UX
- a task-specific attachment control

but the attachment UX must remain distinct from:

- board labels
- Task Tag insertion

### Dispatch preview

At least one execution-adjacent surface should show how attached labels affect dispatch context before or during agent start.

## Integration Boundaries

### `packages/agent-mux/core`

Own:

- shared types
- normalization rules
- render helper seam if shared reuse is required

Do not own first-phase local kanban CRUD unless the same milestone explicitly promotes storage.

### `packages/kanban`

Own first-phase:

- definition management UX
- issue/task attachment UX
- local storage/API
- dispatch preview and audit composition
- package-local tests and release verification

### CI/CD and packaging

This feature must preserve compatibility with:

- [`packages/kanban/package.json`](../package.json)
- [`packages/kanban/scripts/verify-release.mjs`](../scripts/verify-release.mjs)
- [`/.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)
- [`/.github/workflows/release.yml`](../../../.github/workflows/release.yml)
- [`/.github/workflows/staging-publish.yml`](../../../.github/workflows/staging-publish.yml)

Because `@a5c-ai/kanban` already publishes `specs/` through `files[]`, new spec assets are part of the release-sensitive package surface.

## Testing Contract

Implementation work should cover:

- shared type/model tests in `packages/agent-mux/core/tests/kanban.test.ts`
- storage and API tests in `packages/kanban/src/lib/services/__tests__/backlog-query-service.test.ts`
- UI tests for definition management and issue attachment
- execution-surface tests covering render/audit visibility where the feature lands
- release-contract verification that published `specs/` assets remain included and `verify:release` still passes

## Acceptance Criteria

The spec is implementation-ready only when all of the following are true:

1. Dispatch Context Labels are clearly separated from `KanbanLabel`, Task Tags, and default agent settings.
2. Shared type ownership and first-phase package-local CRUD ownership are both explicit.
3. The render/projection seam into dispatched-agent context is defined.
4. Auditability requirements name concrete downstream surfaces.
5. CI/release compatibility is tied to existing package and workflow paths.
6. The backlog decomposition can be opened as dependency-mapped `Debt` issues under `ACA-253`.

## Implementation Slices

### Slice 1: Shared type contract

Target:

- `packages/agent-mux/core/src/kanban.ts`
- `packages/agent-mux/core/tests/kanban.test.ts`

Goal:

- define shared dispatch-context label types and normalization without conflating them with `KanbanLabel`

### Slice 2: Local storage and backlog API

Target:

- `packages/kanban/src/lib/services/kanban-storage.ts`
- `packages/kanban/src/lib/services/backlog-query-service.ts`
- `packages/kanban/src/app/api/backlog/route.ts`
- `packages/kanban/src/hooks/use-backlog.ts`

Goal:

- persist definitions and issue attachments through migration-friendly local seams

### Slice 3: Management and attachment UX

Target:

- `packages/kanban/src/app/settings/page.tsx`
- issue/task authoring surfaces when available

Goal:

- let users manage reusable definitions and attach them without UI conflation

### Slice 4: Dispatch projection and auditability

Target:

- session/workspace/detail surfaces
- shared render helper seam

Goal:

- make the feature visible at dispatch time and reviewable after dispatch

### Slice 5: Verification and release hardening

Target:

- package tests
- `verify:release`
- repo CI/release workflows

Goal:

- keep the feature compatible with the published `@a5c-ai/kanban` surface
