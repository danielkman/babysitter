# Task Tags Specification

## Purpose

This document defines the full `Task Tags` feature for [`packages/kanban`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/packages/kanban/README.md) as a parity and adaptation slice based on the original Vibe Kanban product.

In the original product, Task Tags are reusable text snippets inserted by typing `@` in task descriptions and follow-up messages. They are not issue labels, board tags, or workflow metadata. This package already models issue labels through shared kanban types in [`packages/agent-mux/core/src/kanban.ts`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/packages/agent-mux/core/src/kanban.ts), so Task Tags must be specified as a separate feature family.

## Scope

This specification covers:

- shared Task Tag domain types and storage expectations
- package-level API and settings ownership in `packages/kanban`
- insertion UX for task description and follow-up/prompt authoring surfaces
- integration expectations with existing shared packages and seeded local services
- validation, testing, and CI/CD requirements
- implementation slices for backlog decomposition

This specification does not claim the feature is implemented today.

## Upstream Parity Contract

The original Vibe Kanban behavior that must be preserved or adapted is:

- Task Tags are reusable snippets, not labels.
- Users invoke them by typing `@` in task text-entry contexts.
- Autocomplete filters tags by name/key and inserts tag content at the cursor.
- The same concept is reused across task-creation and follow-up/prompt workflows.
- Tag keys use machine-safe naming such as `snake_case`.

For `packages/kanban`, parity means preserving those semantics while fitting the current `board-, issue-, and workspace-first` product contract and the shared `agent-mux` seam model.

## Product Definition

### Relationship to Dispatch Context Labels

Task Tags are freeform snippet helpers.

Dispatch Context Labels are a separate feature family specified in [`dispatch-context-labels-spec.md`](./dispatch-context-labels-spec.md).

The distinction is normative:

- Task Tags insert editable snippet text into descriptions and follow-ups.
- Dispatch Context Labels attach structured execution context to a task/issue and project that context into the dispatched agent flow.
- Task Tags must not become hidden dispatch metadata.
- Dispatch Context Labels must not be implemented as plain `@` snippet expansion.

### What a Task Tag is

A `Task Tag` is a reusable snippet definition that can be expanded into freeform text authoring surfaces. It is intended for prompt scaffolds such as:

- `bug_report`
- `feature_request`
- `code_review_checklist`
- `deployment_validation`

Each Task Tag has:

- a stable key used for `@` lookup and insertion
- a human-readable label
- snippet content/body
- optional description/help text
- ordering metadata for autocomplete and settings management
- optional grouping or scope metadata if future shared storage needs it

### What a Task Tag is not

A Task Tag is not:

- a `KanbanLabel` on an issue or project
- a board swimlane or workflow status
- a repository/PR/CI metadata flag
- a collaborator/team permission primitive

The existing label model in [`packages/agent-mux/core/src/kanban.ts`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/packages/agent-mux/core/src/kanban.ts) should stay focused on issue/project categorization.

## Users and Workflows

### Primary workflows

1. A user opens a task-creation or follow-up surface.
2. The user types `@`.
3. The UI opens a filtered Task Tags menu.
4. Selecting a tag inserts the snippet body at the cursor position.
5. The inserted text remains editable after expansion.

### Secondary workflows

1. A user opens Settings.
2. The user creates, edits, reorders, or deletes reusable Task Tags.
3. The updated Task Tag library is available in all supported authoring surfaces without reloading hidden app state.

### Migration workflow

If seed/local storage remains the first implementation phase, the package must still define a migration path from local seeded Task Tags to shared system-of-record storage once `agent-mux` grows the needed primitives.

## Required Integration Points

### Shared package integration

#### `packages/agent-mux/core`

[`packages/agent-mux/core/src/kanban.ts`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/packages/agent-mux/core/src/kanban.ts) is the correct home for any shared Task Tag types that must be consumed across packages.

Expected additions in a later implementation slice:

- `KanbanTaskTag`
- `KanbanTaskTagScope` if scope is needed
- normalization helpers if shared seed/system-of-record behavior is required

Task Tags must be modeled alongside kanban primitives without overloading `KanbanLabel`.

#### `packages/kanban`

The package owns the first user-facing feature surface:

- settings management UI
- local API routes for CRUD
- insertion/autocomplete behavior in task authoring flows
- package-local tests and release verification

Relevant existing files that should anchor the implementation:

- [`packages/kanban/src/app/settings/page.tsx`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/packages/kanban/src/app/settings/page.tsx)
- [`packages/kanban/src/app/api/backlog/route.ts`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/packages/kanban/src/app/api/backlog/route.ts)
- [`packages/kanban/src/hooks/use-backlog.ts`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/packages/kanban/src/hooks/use-backlog.ts)
- [`packages/kanban/src/lib/services/backlog-query-service.ts`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/packages/kanban/src/lib/services/backlog-query-service.ts)

#### Compendium and UI primitives

Task Tags management should use existing shared UI conventions rather than creating a divergent settings/editor subsystem. New controls should compose current app and Compendium patterns rather than inventing a parallel design system.

### Runtime/API integration

The first implementation phase should specify these routes even if they begin as local seeded storage:

- `GET /api/task-tags`
- `POST /api/task-tags`
- `PATCH /api/task-tags/:taskTagId`
- `DELETE /api/task-tags/:taskTagId`

If route shape must stay consolidated initially, the spec must still preserve CRUD semantics above even if the temporary implementation uses a single route file.

### First-phase storage decision

Unless the implementation deliberately promotes Task Tags into a shared `agent-mux` storage slice in the same milestone, the default first-phase owner is `packages/kanban`.

That means:

- first persisted CRUD behavior should live behind package-local services and API routes
- package-local storage may start seeded/file-backed if it preserves a clean migration seam
- promotion into shared storage is a follow-on decision, not an excuse to leave first-phase ownership undefined

Any shared-storage promotion must update this spec, the implementation backlog, and the type ownership notes together.

### Authoring-surface integration

Task Tags must be usable in:

- task creation descriptions
- follow-up/prompt authoring for attempts
- any future task template authoring surface

If one of those surfaces is not yet present in `packages/kanban`, the implementation must still:

- expose shared insertion primitives
- document the deferred UI surface explicitly
- avoid hard-coding the feature to Settings-only or a single text area

## Proposed Data Model

The implementation should target a structure equivalent to:

```ts
interface KanbanTaskTag {
  id: string;
  key: string; // snake_case lookup token used after @
  label: string;
  content: string;
  description?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}
```

Minimum constraints:

- `key` is unique and case-normalized for lookup.
- `key` supports `snake_case`.
- `content` is inserted verbatim, then remains editable in-place.
- autocomplete ordering is stable and deterministic.
- insertion must not mutate issue labels or board state.

## UX Requirements

### Settings surface

The Settings page must define:

- Task Tags list view
- create/edit form
- delete action
- ordering/reordering behavior or explicit sort rules
- validation for duplicate/invalid keys

### Editor behavior

Insertion UX must define:

- trigger character: `@`
- lookup by partial key/label
- keyboard selection behavior
- cursor-position insertion
- behavior when no matches exist
- behavior when the user continues typing freeform text

### Accessibility and keyboard support

The autocomplete surface must work without pointer input and must not break existing keyboard shortcuts or form navigation patterns.

## Acceptance Criteria

The feature specification is implementation-ready only when all of the following are true:

1. The spec distinguishes Task Tags from issue labels with no ambiguity.
2. The spec names the exact shared and package-local files that downstream implementation will likely touch.
3. The spec defines CRUD ownership for Task Tags management.
4. The spec defines `@` insertion semantics for task description and follow-up/prompt authoring.
5. The spec defines test expectations across type/model, API, UI behavior, and release verification.
6. The spec names existing CI/release surfaces that must continue to pass for `@a5c-ai/kanban`.
7. The spec produces implementation slices that can be opened as independent backlog issues with dependencies.

## Testing and CI/CD Contract

### Package-level checks

Changes that implement this spec must keep the existing `@a5c-ai/kanban` validation path green:

- `npm run build:kanban`
- `npm run build:cli --workspace=@a5c-ai/kanban`
- `npm run verify:release --workspace=@a5c-ai/kanban`
- `npm run test:kanban`

These are already wired in:

- [`/.github/workflows/ci.yml`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/.github/workflows/ci.yml)
- [`/.github/workflows/release.yml`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/.github/workflows/release.yml)
- [`/.github/workflows/staging-publish.yml`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/.github/workflows/staging-publish.yml)

### Publication contract

The spec is intentionally linked from [`packages/kanban/README.md`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/packages/kanban/README.md), so [`packages/kanban/package.json`](/var/tmp/vibe-kanban/worktrees/5566-full-task-tags-f/babysitter/packages/kanban/package.json) now includes `specs/` in the published file list.

Implementation work must preserve that contract unless the README link strategy changes in the same release-sensitive change.

### Required test surfaces for implementation

Implementation subtasks should cover:

- shared type/model tests in `packages/agent-mux/core/tests/kanban.test.ts`
- package service/API tests around Task Tags CRUD and validation
- React/UI tests for settings management and autocomplete insertion behavior
- release-contract verification so published `@a5c-ai/kanban` still includes the needed files and build output

### Optional but recommended extension

If authoring surfaces become Playwright-visible during implementation, extend `packages/kanban/e2e` to verify keyboard insertion of Task Tags in at least one real text-entry workflow.

## Implementation Slices

### Slice 1: Shared type and storage contract

Target:

- `packages/agent-mux/core/src/kanban.ts`
- `packages/agent-mux/core/tests/kanban.test.ts`

Goal:

- add Task Tag types and normalization rules without conflating them with labels

### Slice 2: Package-local storage and API

Target:

- `packages/kanban/src/lib/services/*`
- `packages/kanban/src/app/api/*`

Goal:

- add local CRUD/storage path for Task Tags and define migration-friendly seams

### Slice 3: Settings management UI

Target:

- `packages/kanban/src/app/settings/page.tsx`
- supporting components/hooks/tests

Goal:

- add management UI for reusable Task Tags

### Slice 4: Task authoring insertion UX

Target:

- future task creation/follow-up surfaces in `packages/kanban/src/components/**`
- shared editor/autocomplete helpers as needed

Goal:

- insert Task Tags by typing `@`, filtering, and expanding snippets into editable text

### Slice 5: E2E and release hardening

Target:

- `packages/kanban/e2e/**`
- existing package test config and release verification surfaces

Goal:

- prove the feature works in real UI flows and does not regress packaging or publication

## Slice Dependency Graph

The backlog should treat slice dependencies as normative:

1. **Slice 1 -> Slice 2**
   Shared type decisions must land before package-local CRUD/storage settles on final contracts.
2. **Slice 2 -> Slice 3**
   Settings management should consume a real local CRUD surface, not hidden mock state.
3. **Slice 2 -> Slice 4**
   `@` insertion should read from the same Task Tags source as settings CRUD.
4. **Slice 3 + Slice 4 -> Slice 5**
   E2E and release hardening only make sense after at least one management surface and one insertion surface are present.
5. **Slice 3 and Slice 4 may overlap only after Slice 2 is stable**
   UI teams can work in parallel once the CRUD/storage contract is agreed.

## Backlog Decomposition Rules

The implementation backlog must follow these rules:

- each subtask goes to **Backlog**
- each subtask references this spec and exact supporting file paths
- dependencies are explicit between slices
- descriptions instruct the implementer to use a babysitter process
- descriptions reference relevant library processes:
  - `methodologies/spec-kit-brownfield.js`
  - `methodologies/spec-driven-development.js`
  - `methodologies/planning-with-files/README.md`
  - `methodologies/kanban/kanban.js`
  - `methodologies/metaswarm/metaswarm-execution-loop.js`

## Open Decisions To Resolve During Implementation

- whether Task Tags should live entirely in `packages/kanban` first or be promoted immediately into a shared `agent-mux` storage surface
- whether prompt/follow-up authoring lands in the same milestone as settings CRUD or follows as a dependent slice
- whether the first Task Tags storage format should be seeded file-backed like current backlog data or introduced via a dedicated local store
