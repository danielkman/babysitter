# Package Renames

42 mux-related packages need naming alignment to `@a5c-ai/adapters-{feature}`.

## Top-Level Packages → Move Under agent-mux/

These currently live at `packages/{name}` and need to move to `packages/adapters/{name}/`.

| Current Package | Current Dir | Target Package | Target Dir |
|----------------|------------|---------------|-----------|
| `@a5c-ai/transport-mux` | `packages/transport-mux/` | `@a5c-ai/adapters-transport` | `packages/adapters/transport/` |
| `@a5c-ai/extension-mux` | `packages/extension-mux/` | `@a5c-ai/adapters-extensions` | `packages/adapters/extensions/` |
| `@a5c-ai/triggers-mux` | `packages/triggers-mux/` | `@a5c-ai/adapters-triggers` | `packages/adapters/triggers/` |
| `@a5c-ai/tasks-mux` | `packages/tasks-mux/` | `@a5c-ai/adapters-tasks` | `packages/adapters/tasks/` |
| `@a5c-ai/tool-mux` | `packages/tool-mux/` | `@a5c-ai/adapters-tools` | `packages/adapters/tools/` |

## Hooks-Mux → Move Under agent-mux/

| Current Package | Current Dir | Target Package | Target Dir |
|----------------|------------|---------------|-----------|
| `@a5c-ai/hooks-mux-core` | `packages/hooks-mux/core/` | `@a5c-ai/adapters-hooks-core` | `packages/adapters/hooks/core/` |
| `@a5c-ai/hooks-mux-cli` | `packages/hooks-mux/cli/` | `@a5c-ai/adapters-hooks-cli` | `packages/adapters/hooks/cli/` |
| `@a5c-ai/hooks-mux-adapter-claude` | `packages/hooks-mux/adapter-claude/` | `@a5c-ai/adapters-hooks-claude` | `packages/adapters/hooks/adapter-claude/` |
| `@a5c-ai/hooks-mux-adapter-codex` | `packages/hooks-mux/adapter-codex/` | `@a5c-ai/adapters-hooks-codex` | `packages/adapters/hooks/adapter-codex/` |
| `@a5c-ai/hooks-mux-adapter-copilot` | `packages/hooks-mux/adapter-copilot/` | `@a5c-ai/adapters-hooks-copilot` | `packages/adapters/hooks/adapter-copilot/` |
| `@a5c-ai/hooks-mux-adapter-cursor` | `packages/hooks-mux/adapter-cursor/` | `@a5c-ai/adapters-hooks-cursor` | `packages/adapters/hooks/adapter-cursor/` |
| `@a5c-ai/hooks-mux-adapter-gemini` | `packages/hooks-mux/adapter-gemini/` | `@a5c-ai/adapters-hooks-gemini` | `packages/adapters/hooks/adapter-gemini/` |
| `@a5c-ai/hooks-mux-adapter-hermes` | `packages/hooks-mux/adapter-hermes/` | `@a5c-ai/adapters-hooks-hermes` | `packages/adapters/hooks/adapter-hermes/` |
| `@a5c-ai/hooks-mux-adapter-oh-my-pi` | `packages/hooks-mux/adapter-oh-my-pi/` | `@a5c-ai/adapters-hooks-oh-my-pi` | `packages/adapters/hooks/adapter-oh-my-pi/` |
| `@a5c-ai/hooks-mux-adapter-openclaw` | `packages/hooks-mux/adapter-openclaw/` | `@a5c-ai/adapters-hooks-openclaw` | `packages/adapters/hooks/adapter-openclaw/` |
| `@a5c-ai/hooks-mux-adapter-opencode` | `packages/hooks-mux/adapter-opencode/` | `@a5c-ai/adapters-hooks-opencode` | `packages/adapters/hooks/adapter-opencode/` |
| `@a5c-ai/hooks-mux-adapter-pi` | `packages/hooks-mux/adapter-pi/` | `@a5c-ai/adapters-hooks-pi` | `packages/adapters/hooks/adapter-pi/` |

## Existing Agent-Mux Subpackages → Rename Only

These are already under `packages/adapters/` but have inconsistent package names.

| Current Package | Target Package | Dir (unchanged) |
|----------------|---------------|----------------|
| `@a5c-ai/agent-comm-mux` | `@a5c-ai/adapters-comm` | `packages/adapters/core/` |
| `@a5c-ai/agent-config-mux` | `@a5c-ai/adapters-config` | `packages/adapters/config/` |
| `@a5c-ai/agent-launch-mux` | `@a5c-ai/adapters-launch` | `packages/adapters/launch/` |
| `@a5c-ai/adapters` (sdk) | `@a5c-ai/adapters` (keep) | `packages/adapters/sdk/` |
| `@a5c-ai/adapters-cli` | `@a5c-ai/adapters-cli` (keep) | `packages/adapters/cli/` |
| `@a5c-ai/adapters-codecs` | `@a5c-ai/adapters-codecs` (keep) | `packages/adapters/adapters/` |
| `@a5c-ai/adapters-gateway` | `@a5c-ai/adapters-gateway` (keep) | `packages/adapters/gateway/` |
| `@a5c-ai/adapters-harness-mock` | `@a5c-ai/adapters-harness-mock` (keep) | `packages/adapters/harness-mock/` |
| `@a5c-ai/adapters-observability` | `@a5c-ai/adapters-observability` (keep) | `packages/adapters/observability/` |
| `@a5c-ai/tula-tui` | `@a5c-ai/tula-tui` (keep) | `packages/adapters/tui/` |
| `@a5c-ai/tula-ui` | `@a5c-ai/tula-ui` (keep) | `packages/adapters/ui/` |
| `@a5c-ai/tula-webui` | `@a5c-ai/tula-webui` (keep) | `packages/adapters/webui/` |

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Move to agent-mux/ | 5 | git mv + package rename |
| Move hooks-mux/ to agent-mux/hooks/ | 12 | git mv + package rename |
| Rename package only (already in agent-mux/) | 3 | package.json name change |
| Already correct | 22 | No change |
| **Total** | **42** | |
