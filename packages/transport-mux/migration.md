# transport-mux migration backlog

## Current status

`packages/transport-mux` owns the active transport/proxy runtime and release surface in this repo. The root CI, release, and staging workflows now validate and publish this package, and `amux launch` resolves proxy runtime behavior through `@a5c-ai/transport-mux`.

## Why this file exists

This file records the cutover state and the remaining historical references so operators can see one active owner and one archive story.

## What would need to stay stable once cutover begins

- binary name: `amux-proxy`
- env contract: `AMUX_PROXY_*`
- launcher behavior in `packages/agent-mux/cli/src/commands/launch.ts`
- open `GET /health` and `GET /v1/models`
- proxy auth on protocol routes via `x-api-key` or bearer auth

## Package verification gates

Run these commands when editing this workspace:

```bash
npm run build --workspace=@a5c-ai/transport-mux
npm run test --workspace=@a5c-ai/transport-mux
npm run scorecard:migration --workspace=@a5c-ai/transport-mux
```

Those checks now verify the active owner end to end:

- `build` and `test` validate the publishable TypeScript runtime package, including the in-process launcher runtime and executable surface.
- `scorecard:migration` ties that result back to launcher ownership, docs, CI, packaging, and archived legacy references.

Historical archive: legacy Python tests under `packages/agent-mux/amux-proxy/tests` remain for reference only.

## Migration scorecard

The active release/runtime owner is now `@a5c-ai/transport-mux`, and every row below should stay green.

| Surface | Current validation truth | Green means | Current status |
| --- | --- | --- | --- |
| Legacy Python contract truth | Historical reference tests remain under `packages/agent-mux/amux-proxy/tests/*.py`. | The legacy tree is clearly marked historical-only and no longer defines runtime or release truth. | Green: legacy Python tests are archived as reference only. |
| JS package contract truth | `npm run build`, `npm run test`, and `npm run scorecard:migration` under `@a5c-ai/transport-mux`. | The package owns both the executable runtime surface and the scorecard proving how it replaced the legacy seam. | Green: the active runtime package validates itself directly. |
| Launcher/runtime ownership | `packages/agent-mux/cli/src/commands/launch.ts`, `packages/agent-mux/core/src/provider-resolver.ts`, and `packages/agent-mux/adapters/src/translate-for-harness.ts`. | The launcher path resolves into the runtime exported from `packages/transport-mux` rather than an independent proxy path. | Green: `launch.ts` uses the exported runtime surface from `@a5c-ai/transport-mux`. |
| Docs honesty | `packages/transport-mux/README.md`, `packages/transport-mux/architecture.md`, and this file. | Operators can tell, from docs alone, that `transport-mux` is the active owner and `amux-proxy` legacy assets are archival only. | Green: docs identify one active owner and one historical archive. |
| Publish + CI ownership | Root CI/release/staging workflows plus legacy `packages/agent-mux/meta/github/workflows/*`. | CI validates `@a5c-ai/transport-mux`, release and staging publish it, and legacy `amux-proxy` publish/CI paths are archived. | Green: root workflows now validate/publish `@a5c-ai/transport-mux`, and legacy publish/CI files are historical-only. |
| Binary/container ownership | `packages/transport-mux` executable surface plus archived legacy metadata. | The `amux-proxy` binary is owned here and every legacy binary/container reference is explicitly historical only. | Green: `transport-mux` now ships the `amux-proxy` executable and legacy workflow metadata is archived. |

The scorecard exists to keep the convergence explicit: if any future change re-splits runtime, publish, or legacy archive truth, this document should go red again.

## Publication and cutover prerequisites

The cutover is complete. Keep the assertions below true.

### 1. The package exports the active runtime surface

- `packages/transport-mux/src/` exports the real server/config/runtime modules described by the tests and architecture docs.
- the package entrypoint advertises an active runtime rather than placeholder metadata.
- the `amux-proxy` executable lives here and is the active install target.

### 2. Docs describe the active owner honestly

- `packages/transport-mux/README.md` describes this workspace as the active runtime/release owner.
- `packages/transport-mux/architecture.md` remains the design reference for the runtime now owned here.
- this file records the historical archive state and the scorecard assertions that must stay true.

### 3. Launcher/runtime ownership is proven

- `packages/agent-mux/cli/src/commands/launch.ts` resolves into the runtime surface exported by this package.
- `packages/agent-mux/core/src/provider-resolver.ts` and `packages/agent-mux/adapters/src/translate-for-harness.ts` stay aligned with that runtime.
- operators no longer have to infer whether runtime truth lives in `packages/transport-mux` or elsewhere.

### 4. Publish and CI surfaces stay converged

- release workflows intentionally publish `@a5c-ai/transport-mux` from this package.
- staging workflows do the same for prerelease publication.
- CI validates this package as an active runtime package, including tests and scorecard coverage.

### 5. Legacy surfaces stay retired or clearly archived

- legacy `amux-proxy` package/container surfaces are either removed from the active operational path or explicitly marked historical.
- operators are not asked to infer whether the container, package, and launcher truth live in different places.

## Historical references that remain

- legacy Python tests remain under `packages/agent-mux/amux-proxy/tests` as historical reference material.
- archived workflow files remain under `packages/agent-mux/meta/github/workflows` so prior release history is still inspectable.
- architecture notes still describe how the old split worked so future refactors can explain the migration path.

## Done criteria

Treat this migration as complete only while the runtime surface stays here, the launcher path uses it, the scorecard stays green end to end, and legacy references remain explicitly archival.

## Main risk

The failure mode is still operational drift: package metadata, launcher docs, release surfaces, and legacy archive files silently describing different runtime truths. This document exists to keep those surfaces honest.
