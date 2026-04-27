# @a5c-ai/agent-catalog

`@a5c-ai/agent-catalog` is an internal-only workspace package for the shared agent ontology, discovery catalog, packaged evidence shards, and graph-backed helper APIs used across this monorepo.

The package is versioned and packable so workspace consumers can exercise installed-package behavior in tests, but it is not part of the central `release.yml` or `staging-publish.yml` publish set and should not be treated as an externally supported npm release target.

## Lifecycle policy

- The package stays `private: true` and is validated through workspace CI, not the public npm release pipeline.
- `npm run ci:test --workspace=@a5c-ai/agent-catalog` is the release-equivalent contract for this workspace. It covers build output, graph validation, evidence freshness, package contract tests, and the internal-only lifecycle policy check.
- Any future promotion to a public release target must update package metadata, central release workflows, workspace validation docs, and catalog CI metadata in the same change.

## Downstream compatibility

- Monorepo consumers may depend on the package's documented exports and packaged graph/evidence assets.
- The compatibility contract is lockstep within this repository, not external semver support. A version bump here does not by itself promise independent release cadence or backward compatibility for third-party consumers.
- Breaking changes to exported APIs, graph documents, evidence layout, or generated discovery data must land in the same change as every downstream consumer update and must keep consumer contract tests green.

## Expected validation

Run this workspace command before landing changes that affect graph data, generated evidence, exports, or downstream consumers:

```bash
npm run ci:test --workspace=@a5c-ai/agent-catalog
```

## CI contract matrix

`npm run test:agent-catalog-contracts` is the enforced downstream compatibility matrix for `@a5c-ai/agent-catalog` in CI. It currently covers these consumer surfaces:

- Package export and packaged-asset contract: `packages/agent-catalog/src/catalog.test.ts`, `packages/agent-catalog/src/discovery.contract.test.ts`, `packages/agent-catalog/src/sdk.contract.test.ts`, `packages/agent-catalog/src/discovery.packaged.test.ts`
- Catalog API integration: `packages/catalog/src/app/api/agents/route.contract.test.ts`, `packages/catalog/src/app/api/agents/[slug]/route.contract.test.ts`, `packages/catalog/src/app/api/catalog-integration.contract.test.ts`
- SDK fallback metadata integration: `packages/sdk/src/harness/amuxFallbackMetadata.contract.test.ts`
- Hooks-mux discovery integration: `packages/hooks-mux/core/src/discovery/__tests__/detector.contract.test.ts`
- Agent-mux integration: `packages/agent-mux/core/tests/host-detection.contract.test.ts`, `packages/agent-mux/core/tests/invocation.contract.test.ts`
- Agent-plugins-mux integration: `packages/agent-plugins-mux/src/__tests__/targets.contract.test.ts`

If a new consumer family or route starts importing `@a5c-ai/agent-catalog`, update this matrix and add its contract test to `test:agent-catalog-contracts` in the same change.
