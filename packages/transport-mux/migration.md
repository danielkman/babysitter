# transport-mux migration

## Goal

Replace the current Python `amux-proxy` implementation with a JS package implementation without changing how `amux launch` or the harnesses consume the proxy.

## Compatibility target

The migration should preserve:

- binary name: `amux-proxy`
- env contract: `AMUX_PROXY_*`
- launcher integration in `babysitter/packages/agent-mux/cli/src/commands/launch.ts`
- existing transport endpoint shapes

The migration should change:

- implementation package location to `babysitter/packages/transport-mux`
- runtime from Python to Node.js
- request path from LiteLLM to direct provider adapters
- packaging assumptions from PyPI to workspace-native TypeScript packaging

## Staged order

### Stage 1: contract capture

- port the existing Python transport tests into TypeScript characterization tests
- freeze request and response fixtures for the current endpoints
- document provider aliases and model id translation rules currently implied by docs and launch code

### Stage 2: JS skeleton

- create `transport-mux` as a normal Node workspace package
- add config, auth, error, and health handling
- stand up the server with unchanged endpoints and empty or mocked transport handlers

### Stage 3: transport parity

- implement transport codecs one by one
- start with `anthropic`, `openai-responses`, `openai-chat`, and `google`
- then add `passthrough`, `bedrock-converse`, `vertex-native`, and `azure-foundry`

### Stage 4: provider parity

- implement direct provider adapters behind the normalized request model
- reuse `provider-resolver.ts` outputs and canonical provider ids
- replace LiteLLM model listing and token counting with explicit adapter logic

### Stage 5: launcher and packaging cutover

- keep `launch.ts` behavior stable while pointing it at the JS binary
- replace Python CI, release, and packaging paths with TypeScript equivalents
- update README, docs, and publish workflows to describe the new runtime truth

## Parity strategy

The migration should be considered safe only if the JS package can satisfy the same contract tests the Python package did.

The practical verification stack is:

- transport characterization tests
- adapter unit tests
- launcher integration tests
- end-to-end harness smoke tests
- Docker boot and `/health` verification

## Repo fallout to update

The following areas will need follow-up edits during implementation:

- `babysitter/packages/agent-mux/amux-proxy/README.md`
- `babysitter/packages/agent-mux/README.md`
- `babysitter/packages/agent-mux/cli/src/commands/help.ts`
- `babysitter/packages/agent-mux/scripts/bump-version.sh`
- `babysitter/packages/agent-mux/meta/github/workflows/amux-proxy-ci.yml`
- `babysitter/packages/agent-mux/meta/github/workflows/publish.yml`
- container assets that currently assume a Python image or Python entrypoint

## Main risks

### Transport drift

Risk: the JS implementation matches the intent of the current proxy but not its actual harness-facing wire format.

Mitigation: treat the current transport behavior as a characterization target and lock it down with fixtures before swapping implementations.

### Provider alias mismatch

Risk: docs and launch code currently reference names such as `vertex_ai` and provider-specific model ids that do not line up cleanly with canonical core ids.

Mitigation: centralize alias normalization and test both canonical and legacy names.

### Streaming regressions

Risk: the proxy appears correct for non-streaming calls but breaks harness incremental output, tool events, or completion framing.

Mitigation: add stream transcript tests per transport and verify them against existing harness expectations.

### Packaging half-cutover

Risk: the code migrates but CI, release, and install messaging still assume Python and PyPI.

Mitigation: finish the implementation only when packaging and docs are updated together.
