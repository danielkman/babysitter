# process-library-catalog

`process-library-catalog` is the internal-only Next.js application under `packages/catalog`. It renders the Babysitter catalog UI and the catalog-facing API routes that exercise graph-backed discovery data inside this monorepo.

This workspace is active and supported for monorepo development, but it is **not** a public npm package and it is **not** owned by the central `release.yml` or `staging-publish.yml` publish workflows. Its lifecycle contract is enforced through workspace CI instead.

<!-- docs-status:start -->
> Status: Internal-only workspace application.
> Canonical docs home: [Package and Plugin Docs Map](../../docs/package-and-plugin-map.md).
> This README is the canonical internal contract for the monorepo catalog UI/API surface.
<!-- docs-status:end -->

## Ownership policy

- The package stays `private: true` and should be treated as an internal operator/developer surface.
- Central release and staging workflows intentionally exclude this workspace from publish automation.
- If the package is ever promoted into a public deploy or release target, update the package metadata, workflow ownership, and release documentation in the same change.

## CI contract

The release-equivalent quality gate for this workspace is:

```bash
npm run ci:test --workspace=process-library-catalog
```

That contract runs the package-local build, test, lint, and type-check surfaces that define support for `packages/catalog`.
It also rebuilds the internal `@a5c-ai/agent-catalog` dependency first so the catalog app is validated against the same graph-backed data contract it consumes in production monorepo development.

`npm run format:check --workspace=process-library-catalog` remains available as a package-local hygiene command, but it is not yet part of the central CI contract because the workspace still carries broad pre-existing formatting debt outside the scope of this ownership change.

## Development

Run the app locally from the monorepo root:

```bash
npm run dev --workspace=process-library-catalog
```

The package uses the root Vitest config for its API contract tests and relies on workspace-local dependencies supplied by the monorepo install.

## Scope

- Next.js app routes under `src/app`
- Catalog API handlers and contract tests under `src/app/api`
- Shared UI components, markdown rendering, and dashboard components under `src/components`
- SQLite-backed indexing/parsing helpers under `src/lib`

Changes that affect the catalog UI, its API contracts, or its indexing layer should keep the CI contract above green.
