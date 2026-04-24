# Dispatch Context Labels Backlog Decomposition

## Status Target

All subtasks derived from this document should be opened under `ACA-253` in the backlog-style `Debt` column.

## Required Process References

Implementation subtasks should instruct the implementer to build and use a Babysitter process and reference these process-library assets where relevant:

- `/home/a5cdev/.a5c/process-library/babysitter-repo/library/methodologies/spec-kit/spec-kit-specification.js`
- `/home/a5cdev/.a5c/process-library/babysitter-repo/library/methodologies/metaswarm/metaswarm-orchestrator.js`
- `/home/a5cdev/.a5c/process-library/babysitter-repo/library/methodologies/spec-kit/skills/specification-writing/README.md`
- `/home/a5cdev/.a5c/process-library/babysitter-repo/library/methodologies/metaswarm/skills/adversarial-review/README.md`
- `/home/a5cdev/.a5c/process-library/babysitter-repo/library/methodologies/metaswarm/skills/work-unit-decomposition/README.md`
- `/home/a5cdev/.a5c/process-library/babysitter-repo/library/specializations/devops-sre-platform/skills/cicd-pipelines/README.md`
- `/home/a5cdev/.a5c/process-library/babysitter-repo/library/methodologies/automaker/skills/kanban-management/README.md`

## Subtasks

### DCL-1

Title:

- `[DCL-1] Add shared dispatch-context label types and normalization seams`

Dependencies:

- none

References:

- `packages/agent-mux/core/src/kanban.ts`
- `packages/agent-mux/core/tests/kanban.test.ts`
- `packages/agent-mux/core/README.md`
- `packages/kanban/specs/dispatch-context-labels-spec.md`

Description:

- Define shared types for reusable dispatch-context label definitions, issue/task attachment refs, and any normalization/render helpers needed by downstream kanban and execution surfaces.
- Keep `KanbanLabel` responsible for board categorization and do not let the new types absorb Task Tag semantics.
- The implementation process should start from the spec, use Babysitter process composition, and include an adversarial review focused on feature-family separation and future migration safety.

### DCL-2

Title:

- `[DCL-2] Extend kanban storage and backlog APIs for label definitions and issue attachments`

Dependencies:

- `DCL-1`

References:

- `packages/kanban/src/lib/services/kanban-storage.ts`
- `packages/kanban/src/lib/services/backlog-query-service.ts`
- `packages/kanban/src/app/api/backlog/route.ts`
- `packages/kanban/src/hooks/use-backlog.ts`
- `packages/kanban/src/lib/services/__tests__/backlog-query-service.test.ts`
- `packages/kanban/specs/dispatch-context-labels-spec.md`

Description:

- Add first-phase package-local persistence and mutation support for reusable definitions plus issue/task attachments.
- Clarify validation, migration seams, route/action shape, and file-backed storage behavior.
- The implementation process should explicitly cite the shared type contract from `DCL-1`, use Babysitter work-unit decomposition, and finish with an adversarial review plus deterministic test coverage.

### DCL-3

Title:

- `[DCL-3] Add reusable label management and issue attachment UX in kanban surfaces`

Dependencies:

- `DCL-2`

References:

- `packages/kanban/src/app/settings/page.tsx`
- `packages/kanban/src/components/**`
- `packages/kanban/src/app/settings/__tests__/page.test.tsx`
- `packages/kanban/specs/dispatch-context-labels-spec.md`

Description:

- Expose UX for managing reusable definitions and attaching/removing dispatch-context labels from the relevant issue/task surface.
- The UX must stay visibly distinct from Task Tags, issue labels, and default agent settings in both naming and interaction.
- The implementation process should use a Babysitter run grounded in the spec files and include an adversarial review aimed at catching concept conflation and missing keyboard/accessibility behavior.

### DCL-4

Title:

- `[DCL-4] Project dispatch-context labels into dispatch flows and execution audit surfaces`

Dependencies:

- `DCL-1`
- `DCL-2`

References:

- `packages/kanban/src/app/sessions/[sessionId]/page.tsx`
- `packages/kanban/src/components/workspaces/workspace-runtime-panel.tsx`
- `packages/kanban/src/components/details/agent-panel.tsx`
- `packages/kanban/src/lib/services/backlog-query-service.ts`
- `packages/agent-mux/core/src/kanban.ts`
- `packages/kanban/specs/dispatch-context-labels-spec.md`

Description:

- Implement the deterministic projection seam from attached labels into dispatch/attempt/workspace/session context.
- Preserve inspectability so reviewers can answer which labels were applied and what they rendered into.
- The implementation process should use a Babysitter process with specification-writing plus adversarial review, and it should explicitly close the loop on auditability rather than stopping at data persistence.

### DCL-5

Title:

- `[DCL-5] Add verification, packaging, and CI/release hardening for dispatch-context labels`

Dependencies:

- `DCL-2`
- `DCL-3`
- `DCL-4`

References:

- `packages/kanban/package.json`
- `packages/kanban/scripts/verify-release.mjs`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.github/workflows/staging-publish.yml`
- `packages/kanban/README.md`
- `packages/kanban/gaps-and-debt.md`
- `packages/kanban/specs/dispatch-context-labels-spec.md`

Description:

- Add the tests and release-surface checks needed to keep Dispatch Context Labels compatible with the published `@a5c-ai/kanban` package contract and shared repo CI/release pipelines.
- Confirm that `specs/` remains part of the published package surface, `verify:release` stays green, and package-level tests cover storage, UI, and projection semantics.
- The implementation process should explicitly reference the `cicd-pipelines` skill guidance and close with an adversarial review against the final artifact set.

## Dependency Graph

Normative dependency order:

1. `DCL-1 -> DCL-2`
2. `DCL-2 -> DCL-3`
3. `DCL-1 -> DCL-4`
4. `DCL-2 -> DCL-4`
5. `DCL-2 -> DCL-5`
6. `DCL-3 -> DCL-5`
7. `DCL-4 -> DCL-5`

## Decomposition Rules

Every opened issue should:

- use `Debt` as the initial status
- link back to `ACA-253`
- cite `packages/kanban/specs/dispatch-context-labels-spec.md`
- cite this file for dependency/order guidance
- instruct the implementer to build and use a Babysitter process to execute the work
