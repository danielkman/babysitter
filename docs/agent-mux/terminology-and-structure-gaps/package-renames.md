# Package Renames

42 mux-related packages need naming alignment to `@a5c-ai/agent-mux-{feature}`.

## Top-Level Packages → Move Under agent-mux/

These currently live at `packages/{name}` and need to move to `packages/agent-mux/{name}/`.

| Current Package | Current Dir | Target Package | Target Dir |
|----------------|------------|---------------|-----------|
| `@a5c-ai/transport-mux` | `packages/transport-mux/` | `@a5c-ai/agent-mux-transport` | `packages/agent-mux/transport/` |
| `@a5c-ai/extension-mux` | `packages/extension-mux/` | `@a5c-ai/agent-mux-extensions` | `packages/agent-mux/extensions/` |
| `@a5c-ai/triggers-mux` | `packages/triggers-mux/` | `@a5c-ai/agent-mux-triggers` | `packages/agent-mux/triggers/` |
| `@a5c-ai/tasks-mux` | `packages/tasks-mux/` | `@a5c-ai/agent-mux-tasks` | `packages/agent-mux/tasks/` |
| `@a5c-ai/tool-mux` | `packages/tool-mux/` | `@a5c-ai/agent-mux-tools` | `packages/agent-mux/tools/` |

## Hooks-Mux → Move Under agent-mux/

| Current Package | Current Dir | Target Package | Target Dir |
|----------------|------------|---------------|-----------|
| `@a5c-ai/hooks-mux-core` | `packages/hooks-mux/core/` | `@a5c-ai/agent-mux-hooks-core` | `packages/agent-mux/hooks/core/` |
| `@a5c-ai/hooks-mux-cli` | `packages/hooks-mux/cli/` | `@a5c-ai/agent-mux-hooks-cli` | `packages/agent-mux/hooks/cli/` |
| `@a5c-ai/hooks-mux-adapter-claude` | `packages/hooks-mux/adapter-claude/` | `@a5c-ai/agent-mux-hooks-adapter-claude` | `packages/agent-mux/hooks/adapter-claude/` |
| `@a5c-ai/hooks-mux-adapter-codex` | `packages/hooks-mux/adapter-codex/` | `@a5c-ai/agent-mux-hooks-adapter-codex` | `packages/agent-mux/hooks/adapter-codex/` |
| `@a5c-ai/hooks-mux-adapter-copilot` | `packages/hooks-mux/adapter-copilot/` | `@a5c-ai/agent-mux-hooks-adapter-copilot` | `packages/agent-mux/hooks/adapter-copilot/` |
| `@a5c-ai/hooks-mux-adapter-cursor` | `packages/hooks-mux/adapter-cursor/` | `@a5c-ai/agent-mux-hooks-adapter-cursor` | `packages/agent-mux/hooks/adapter-cursor/` |
| `@a5c-ai/hooks-mux-adapter-gemini` | `packages/hooks-mux/adapter-gemini/` | `@a5c-ai/agent-mux-hooks-adapter-gemini` | `packages/agent-mux/hooks/adapter-gemini/` |
| `@a5c-ai/hooks-mux-adapter-hermes` | `packages/hooks-mux/adapter-hermes/` | `@a5c-ai/agent-mux-hooks-adapter-hermes` | `packages/agent-mux/hooks/adapter-hermes/` |
| `@a5c-ai/hooks-mux-adapter-oh-my-pi` | `packages/hooks-mux/adapter-oh-my-pi/` | `@a5c-ai/agent-mux-hooks-adapter-oh-my-pi` | `packages/agent-mux/hooks/adapter-oh-my-pi/` |
| `@a5c-ai/hooks-mux-adapter-openclaw` | `packages/hooks-mux/adapter-openclaw/` | `@a5c-ai/agent-mux-hooks-adapter-openclaw` | `packages/agent-mux/hooks/adapter-openclaw/` |
| `@a5c-ai/hooks-mux-adapter-opencode` | `packages/hooks-mux/adapter-opencode/` | `@a5c-ai/agent-mux-hooks-adapter-opencode` | `packages/agent-mux/hooks/adapter-opencode/` |
| `@a5c-ai/hooks-mux-adapter-pi` | `packages/hooks-mux/adapter-pi/` | `@a5c-ai/agent-mux-hooks-adapter-pi` | `packages/agent-mux/hooks/adapter-pi/` |

## Existing Agent-Mux Subpackages → Rename Only

These are already under `packages/agent-mux/` but have inconsistent package names.

| Current Package | Target Package | Dir (unchanged) |
|----------------|---------------|----------------|
| `@a5c-ai/agent-comm-mux` | `@a5c-ai/agent-mux-comm` | `packages/agent-mux/core/` |
| `@a5c-ai/agent-config-mux` | `@a5c-ai/agent-mux-config` | `packages/agent-mux/config/` |
| `@a5c-ai/agent-launch-mux` | `@a5c-ai/agent-mux-launch` | `packages/agent-mux/launch/` |
| `@a5c-ai/agent-mux` (sdk) | `@a5c-ai/agent-mux` (keep) | `packages/agent-mux/sdk/` |
| `@a5c-ai/agent-mux-cli` | `@a5c-ai/agent-mux-cli` (keep) | `packages/agent-mux/cli/` |
| `@a5c-ai/agent-mux-adapters` | `@a5c-ai/agent-mux-adapters` (keep) | `packages/agent-mux/adapters/` |
| `@a5c-ai/agent-mux-gateway` | `@a5c-ai/agent-mux-gateway` (keep) | `packages/agent-mux/gateway/` |
| `@a5c-ai/agent-mux-harness-mock` | `@a5c-ai/agent-mux-harness-mock` (keep) | `packages/agent-mux/harness-mock/` |
| `@a5c-ai/agent-mux-observability` | `@a5c-ai/agent-mux-observability` (keep) | `packages/agent-mux/observability/` |
| `@a5c-ai/agent-mux-tui` | `@a5c-ai/agent-mux-tui` (keep) | `packages/agent-mux/tui/` |
| `@a5c-ai/agent-mux-ui` | `@a5c-ai/agent-mux-ui` (keep) | `packages/agent-mux/ui/` |
| `@a5c-ai/agent-mux-webui` | `@a5c-ai/agent-mux-webui` (keep) | `packages/agent-mux/webui/` |
| `@a5c-ai/agent-mux-mobile-*` | keep | `packages/agent-mux/mobile-*/` |
| `@a5c-ai/agent-mux-tv-*` | keep | `packages/agent-mux/tv-*/` |
| `@a5c-ai/agent-mux-watch-*` | keep | `packages/agent-mux/watch-*/` |

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Move to agent-mux/ | 5 | git mv + package rename |
| Move hooks-mux/ to agent-mux/hooks/ | 12 | git mv + package rename |
| Rename package only (already in agent-mux/) | 3 | package.json name change |
| Already correct | 22 | No change |
| **Total** | **42** | |
