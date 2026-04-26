# @a5c-ai/agent-mux-ui

Shared client, store, hooks, protocol types, realtime session-flow projection helpers, and cross-surface UI primitives for `agent-mux`.

## Install

```bash
npm install @a5c-ai/agent-mux-ui react react-dom react-native react-native-web
```

## Usage

```ts
import {
  GatewayClient,
  GatewayProvider,
  useSession,
} from "@a5c-ai/agent-mux-ui";
```

For realtime session execution views, import the dedicated projection surface from the public `./session-flow` subpath:

```ts
import {
  buildSessionFlowModel,
  buildSessionTranscript,
  buildAgentFlowLanes,
  projectRunFlow,
} from "@a5c-ai/agent-mux-ui/session-flow";
```

The public surface currently includes:

- gateway protocol types plus `GatewayClient`
- gateway store creation and selectors
- React hooks for agents, sessions, runs, hook requests, connection state, and cost totals
- shared primitives and higher-level screens used by browser and React Native surfaces
- themed exports plus the `./gateway`, `./protocol`, and `./session-flow` subpath exports

`./session-flow` is the shared projection seam used by package-level session detail surfaces. It turns gateway run records plus live event buffers into:

- per-run flow lanes and segments
- an ordered timeline across runs
- transcript nodes reconstructed from the same event stream
- file-attention summaries showing read/write/touch activity
- aggregate session summary counts and cost totals

Intended audience and boundary:

- use `@a5c-ai/agent-mux-ui/session-flow` when a surface needs a reusable realtime execution model
- keep product-specific routing, layout, and page composition in consuming apps such as `@a5c-ai/agent-mux-webui` and `@a5c-ai/kanban`
- do not treat this package as the owner of app-specific session pages or kanban workflow policy

## Validation

```bash
npm run build --workspace=@a5c-ai/agent-mux-ui
npm run test --workspace=@a5c-ai/agent-mux-ui
npm run verify:metadata
npm pack --json --dry-run --workspace=@a5c-ai/agent-mux-ui
```

For export-surface parity, confirm that `package.json#exports` still includes `./session-flow` and that the dry-run tarball contains the built `dist/session-flow.*` artifacts.

## Release Expectations

`@a5c-ai/agent-mux-ui` is a public shared package. Keep this README aligned with the exported client/store/hooks/session-flow surface and keep `package.json#files` limited to built artifacts plus package docs.
