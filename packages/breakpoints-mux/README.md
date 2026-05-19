# @a5c-ai/breakpoints-mux

Breakpoint routing library, MCP server, and CLI for responder-driven review flows.

## Install

Use the published npm package in consumers. Install it locally in a project or run it directly with `npx`.

```bash
npm install --save-dev @a5c-ai/breakpoints-mux
npx --yes @a5c-ai/breakpoints-mux --help
```

## CLI

The published executable is `breakpoints-mux`. The supported consumer workflow is either:

- run the published package with `npx --yes @a5c-ai/breakpoints-mux ...`
- install `@a5c-ai/breakpoints-mux` and invoke `breakpoints-mux ...`

```bash
npx --yes @a5c-ai/breakpoints-mux --help
npx --yes @a5c-ai/breakpoints-mux responders list
npx --yes @a5c-ai/breakpoints-mux auth login
npx --yes @a5c-ai/breakpoints-mux server start
```

If the published package is already installed locally or globally, use the bin directly:

```bash
breakpoints-mux --help
breakpoints-mux auth server set https://breakpoints-mux.a5c.ai
breakpoints-mux auth login
```

Current CLI commands:

- `breakpoints-mux ask`
- `breakpoints-mux responders list`
- `breakpoints-mux responders show <responderId>`
- `breakpoints-mux breakpoints pending --responder <responderId>`
- `breakpoints-mux breakpoints answer <breakpointId> --answer <text> --responder <responderId> [--confidence <0-100>]`
- `breakpoints-mux breakpoints status <breakpointId>`
- `breakpoints-mux breakpoints poll <breakpointId> [--timeout <seconds>] [--interval <seconds>]`
- `breakpoints-mux responder-loop --responder <responderId> [--interval <seconds>] [--once]`
- `breakpoints-mux server start`
- `breakpoints-mux auth login|logout|status|server set|server clear|token set|token clear|keygen|key-push|keys`

## MCP Tools

The MCP server currently registers these tools:

- `ask_breakpoint`
- `check_breakpoint_status`
- `list_breakpoints`
- `answer_breakpoint`
- `verify_breakpoint_answer`
- `list_responders`
- `claim_breakpoint`
- `poll_breakpoints`

## Package Exports

Published subpath exports:

- `.`
- `./backends`
- `./proven`
- `./mcp`
- `./harness`
- `./auth`
- `./config`

Example:

```ts
import {
  createBackend,
  createBreakpointMcpServer,
  BreakpointMuxInteractionProvider,
} from "@a5c-ai/breakpoints-mux";
```

## Published Package Contents

The npm tarball is intentionally limited to:

- `dist/`
- `responder/`
- `README.md`

`docs/`, `skills/`, and `specs/` are repository source docs and are not published files.

## Validation

```bash
npm run build --workspace=@a5c-ai/breakpoints-mux
npm run typecheck --workspace=@a5c-ai/breakpoints-mux
npm run test:packaged-surface-parity --workspace=@a5c-ai/breakpoints-mux
npm pack --json --dry-run --workspace=@a5c-ai/breakpoints-mux
```

Keep this README aligned with the exported CLI, MCP, and package topology surfaced by `packages/breakpoints-mux/`.
