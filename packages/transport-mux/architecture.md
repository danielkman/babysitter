# transport-mux architecture

## Objective

Build a JS transport and provider mux that preserves the current `amux-proxy` surface while replacing the Python/LiteLLM internals with repo-native TypeScript modules.

## Top-level shape

The implementation should split into four layers.

### 1. HTTP server and routing

- start from a small Node HTTP surface, preferably aligned with the existing `agent-mux` gateway conventions
- mount the current transport endpoints unchanged
- expose `GET /health`, `GET /v1/models`, and `POST /v1/count_tokens`
- apply auth, timeout, and logging consistently before provider execution

### 2. Transport codecs

Each exposed transport should live in its own codec module:

- `anthropic`
- `openai-chat`
- `openai-responses`
- `google`
- `passthrough`
- `bedrock-converse`
- `vertex-native`
- `azure-foundry`

Each codec is responsible for:

- decoding the harness request body and headers
- mapping them into a normalized request model
- handling streaming frame conversion
- mapping provider errors back into the transport-specific error shape

## Normalized request model

The transport layer should hand provider adapters a transport-neutral object rather than provider-specific payloads. The useful minimum is:

- request metadata
- model id
- messages and content parts
- tool definitions
- tool choice mode
- generation controls
- stream mode
- auth and context overrides

The normalized response side should also be explicit:

- assistant output chunks
- tool call events
- final usage data
- finish reason
- structured provider errors

That keeps transport codecs and provider adapters independently testable.

## Provider adapters

Provider adapters should be keyed by the canonical provider ids already used by `agent-mux` core. They should reuse the config resolved by `babysitter/packages/agent-mux/core/src/provider-resolver.ts` instead of inventing a second provider model.

The adapter families are:

- OpenAI-compatible HTTP providers
- native Anthropic
- native Google
- native Bedrock
- native Vertex
- native Azure and Foundry
- passthrough and custom base URL forwarding

Adapters own:

- auth injection
- provider request body mapping
- provider-native stream parsing
- model listing
- token counting or deterministic fallback
- provider alias normalization such as `vertex_ai` to `vertex`

## Streaming model

Streaming should be represented internally as normalized events, then rendered outward by each transport codec. That avoids repeating the same chunk assembly logic in every endpoint.

The internal event model should cover:

- text delta
- reasoning or metadata delta when present
- tool call start, delta, and complete
- usage snapshot
- terminal completion
- terminal error

## Integration points already live in repo

The `transport-mux` implementation has to fit the existing launcher path, not replace it.

- `babysitter/packages/agent-mux/cli/src/commands/launch.ts`
  - decides whether proxying is required
  - spawns `amux-proxy`
  - injects `AMUX_PROXY_TARGET_PROVIDER`, `AMUX_PROXY_TARGET_MODEL`, `AMUX_PROXY_EXPOSED_TRANSPORT`, `AMUX_PROXY_PORT`, and `AMUX_PROXY_LOG_LEVEL`
- `babysitter/packages/agent-mux/core/src/provider-resolver.ts`
  - resolves canonical provider ids
  - translates default models
  - merges env, profile, and CLI settings
- `babysitter/packages/agent-mux/adapters/src/translate-for-harness.ts`
  - determines the harness-facing transport contract
  - tells the launcher whether proxying is required

## Verification expectations

Deterministic checks should be first-class:

- characterization tests for current transport behavior
- per-transport request and response fixture tests
- provider adapter tests with mocked upstreams
- launcher integration tests for env injection and binary discovery
- end-to-end tests that prove the same harness-facing contract still works after the JS migration

The architecture is only acceptable if those tests can validate the implementation without depending on LiteLLM behavior as hidden glue.
