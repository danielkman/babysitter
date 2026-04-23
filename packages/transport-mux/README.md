# transport-mux

`transport-mux` is the approved JS/Node replacement direction for the current Python/LiteLLM-based `amux-proxy`. It moves the transport and provider bridge into its own top-level TypeScript workspace package while keeping the external proxy contract drop-in compatible for harnesses and launcher flows.

## Compatibility contract

The replacement is intended to keep the existing external boundary stable:

- keep the `amux-proxy` command name
- keep the `AMUX_PROXY_*` environment variables
- keep the harness-facing HTTP endpoints already used by Claude, Codex, and Gemini flows
- keep `amux launch --with-proxy-if-needed` as the control-plane entrypoint

## Runtime path

The live runtime path in this repo is:

1. `babysitter/packages/agent-mux/cli/src/commands/launch.ts` resolves the launch plan and decides whether a proxy is needed.
2. `babysitter/packages/agent-mux/core/src/provider-resolver.ts` turns CLI, profile, and env inputs into a canonical provider configuration.
3. `babysitter/packages/agent-mux/adapters/src/translate-for-harness.ts` maps the selected harness to its required wire protocol.
4. `amux-proxy` is spawned with `AMUX_PROXY_*` variables that define the exposed transport, target provider, and target model.
5. `transport-mux` owns request decoding, normalization, provider dispatch, and transport-specific response rendering behind that stable proxy contract.

## What changes internally

The implementation changes from:

- Python package under `babysitter/packages/agent-mux/amux-proxy`
- LiteLLM in the request path
- provider translation logic embedded in transport handlers

To:

- a dedicated TypeScript package at `babysitter/packages/transport-mux`
- explicit transport codecs
- a normalized request and stream model
- direct provider adapters
- shared provider and model normalization with `agent-mux` core

## Document set

- [Architecture](./architecture.md): internal module boundaries, request flow, streaming model, and integration points
- [Migration](./migration.md): staged replacement plan, parity strategy, and risk controls
