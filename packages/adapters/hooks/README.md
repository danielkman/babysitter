# @a5c-ai/adapters-hooks-cli

A universal hooks proxy system that normalizes lifecycle hooks across multiple AI coding harnesses (Claude Code, Codex, Gemini CLI, Cursor, GitHub Copilot, Pi, oh-my-pi, OpenCode, OpenClaw) into a single canonical event model.

<!-- docs-status:start -->
> Status: Public package family.
> Canonical docs home: [Package and Plugin Docs Map](../../docs/package-and-plugin-map.md).
> Use this README as the canonical family entrypoint for hooks-mux packages and adapters.
<!-- docs-status:end -->

## Packages

| Package | Description |
|---------|-------------|
| `@a5c-ai/adapters-hooks-core` | Canonical schemas, types, session store, and merge engine |
| `@a5c-ai/adapters-hooks-cli` | CLI entrypoint (`a5c-hooks-mux`) |
| `@a5c-ai/adapters-hooks-claude` | Claude Code harness adapter |
| `@a5c-ai/adapters-hooks-codex` | Codex harness adapter |
| `@a5c-ai/adapters-hooks-gemini` | Gemini CLI harness adapter |
| `@a5c-ai/adapters-hooks-copilot` | GitHub Copilot harness adapter |
| `@a5c-ai/adapters-hooks-cursor` | Cursor harness adapter |
| `@a5c-ai/adapters-hooks-pi` | Pi harness adapter |
| `@a5c-ai/adapters-hooks-oh-my-pi` | oh-my-pi harness adapter |
| `@a5c-ai/adapters-hooks-opencode` | OpenCode harness adapter |
| `@a5c-ai/adapters-hooks-openclaw` | OpenClaw harness adapter |

## Quick Start

```bash
# Install the CLI
npm install -g @a5c-ai/adapters-hooks-cli

# Run diagnostics
a5c-hooks-mux doctor

# Proxy a hook event through the canonical pipeline
a5c-hooks-mux proxy --adapter claude --hook-type stop
```

## Documentation

See [docs/](./docs/) for architecture, adapter authoring guides, and the canonical event schema reference.
