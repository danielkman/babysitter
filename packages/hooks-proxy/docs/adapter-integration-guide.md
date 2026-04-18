# Adapter Integration Guide

Per-harness setup instructions for integrating `@a5c-ai/hooks-proxy` with each supported agent harness.

---

## Overview

The hooks-proxy system normalizes hook execution across agent harnesses. Each harness has a dedicated adapter package (`@a5c-ai/hooks-proxy-adapter-<name>`) that translates between harness-native hook contracts and the canonical event model.

To use the proxy with any harness:

1. Install the proxy CLI and the relevant adapter package
2. Register the proxy as the native hook command in the harness configuration
3. Optionally configure a handler registry for multi-plugin fan-out

---

## Claude Code

**Adapter package:** `@a5c-ai/hooks-proxy-adapter-claude`
**Family:** Shell-hook
**Session ID:** Native (`session_id` from stdin payload)
**Env persistence:** Native env file (`CLAUDE_ENV_FILE`)

### Setup

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "npx -y @a5c-ai/hooks-proxy invoke --adapter claude"
      }
    ],
    "PreToolUse": [
      {
        "type": "command",
        "command": "npx -y @a5c-ai/hooks-proxy invoke --adapter claude"
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "npx -y @a5c-ai/hooks-proxy invoke --adapter claude"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "npx -y @a5c-ai/hooks-proxy invoke --adapter claude"
      }
    ]
  }
}
```

### Bootstrap-only mode

To initialize session context without running any hook logic:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "npx -y @a5c-ai/hooks-proxy invoke --adapter claude --bootstrap-only"
      }
    ]
  }
}
```

### Capabilities

| Feature | Support |
|---------|---------|
| Session ID | Native |
| Blocking (deny/ask) | Yes |
| Additional context | Native |
| Tool interception | All tools |
| Env persistence | Native env file |
| Tool input mutation | No |
| Tool result mutation | No |

### Notes

- `CLAUDE_ENV_FILE` is only available on specific events; append semantics are required
- `turn.stop` can recurse if not guarded; the adapter checks `stop_hook_active`
- `session.start` source values: `startup`, `resume`, `clear`, `compact`

---

## Codex

**Adapter package:** `@a5c-ai/hooks-proxy-adapter-codex`
**Family:** Shell-hook
**Session ID:** Native
**Env persistence:** Runtime hook

### Setup

Configure in your Codex hooks configuration:

```bash
npx -y @a5c-ai/hooks-proxy invoke --adapter codex
```

### Capabilities

| Feature | Support |
|---------|---------|
| Session ID | Native |
| Blocking (deny/ask) | Yes |
| Additional context | No (emulated) |
| Tool interception | Shell only |
| Env persistence | Runtime hook |
| Tool input mutation | No |
| Tool result mutation | No |

---

## Gemini CLI

**Adapter package:** `@a5c-ai/hooks-proxy-adapter-gemini`
**Family:** Shell-hook
**Session ID:** Derived (from env or payload heuristics)
**Env persistence:** Wrapper only

### Setup

Configure in your Gemini CLI extension:

```json
{
  "hooks": {
    "onSessionStart": "npx -y @a5c-ai/hooks-proxy invoke --adapter gemini",
    "onToolUse": "npx -y @a5c-ai/hooks-proxy invoke --adapter gemini"
  }
}
```

### Capabilities

| Feature | Support |
|---------|---------|
| Session ID | Derived |
| Blocking (deny/ask) | Yes |
| Additional context | No (emulated) |
| Tool interception | Partial shell only |
| Env persistence | Wrapper only |
| Tool input mutation | No |
| Tool result mutation | No |

### Notes

- Session ID is derived from environment heuristics; cross-session state may be less reliable
- Use the `exec` wrapper for downstream commands that need session context

---

## GitHub Copilot

**Adapter package:** `@a5c-ai/hooks-proxy-adapter-copilot`
**Family:** Shell-hook
**Session ID:** Synthetic (no native session concept)
**Env persistence:** Wrapper only

### Setup

Configure in your Copilot agent hooks:

```bash
npx -y @a5c-ai/hooks-proxy invoke --adapter copilot
```

### Capabilities

| Feature | Support |
|---------|---------|
| Session ID | Synthetic |
| Blocking (deny/ask) | Limited |
| Additional context | No |
| Tool interception | Partial shell only |
| Env persistence | Wrapper only |
| Tool input mutation | No |
| Tool result mutation | No |

### Notes

- Synthetic session IDs mean cross-hook state is best-effort
- Blocking decisions may be downgraded to noop depending on the Copilot version
- Use `exec` wrapper for reliable context propagation

---

## Cursor

**Adapter package:** `@a5c-ai/hooks-proxy-adapter-cursor`
**Family:** Shell-hook
**Session ID:** Synthetic (no stable session identifier)
**Env persistence:** None

### Setup

Configure in `.cursor/hooks.json`:

```json
{
  "hooks": {
    "onFileChange": "npx -y @a5c-ai/hooks-proxy invoke --adapter cursor --bootstrap-only"
  }
}
```

### Capabilities

| Feature | Support |
|---------|---------|
| Session ID | Synthetic |
| Blocking (deny/ask) | No |
| Additional context | No |
| Tool interception | None |
| Env persistence | None |
| Tool input mutation | No |
| Tool result mutation | No |

### Notes

- Cursor support is experimental
- No native env persistence means session context is only available through explicit `exec` wrapping
- No tool interception means `tool.before`/`tool.after` phases are unsupported
- Best used for session bootstrap and observer-mode hooks only

---

## Pi

**Adapter package:** `@a5c-ai/hooks-proxy-adapter-pi`
**Family:** In-process
**Session ID:** Native
**Env persistence:** Runtime hook

### Setup

Pi uses a programmatic adapter rather than CLI shell hooks:

```typescript
import { createAdapter, registerHandler, runNormalized } from '@a5c-ai/hooks-proxy-core';
import { createPiAdapter } from '@a5c-ai/hooks-proxy-adapter-pi';

const adapter = createPiAdapter();
// Register handlers programmatically
registerHandler({
  id: 'my-handler',
  pluginId: 'my-plugin',
  phase: 'session.start',
  priority: 100,
  handler: { source: './my-handler', handler: 'onSessionStart' },
});
```

### Capabilities

| Feature | Support |
|---------|---------|
| Session ID | Native |
| Blocking (deny/ask) | Yes |
| Additional context | Native |
| Tool interception | All tools |
| Env persistence | Runtime hook |
| Tool input mutation | Yes |
| Tool result mutation | Yes |

---

## Oh-My-Pi

**Adapter package:** `@a5c-ai/hooks-proxy-adapter-oh-my-pi`
**Family:** In-process
**Session ID:** Native
**Env persistence:** Runtime hook

### Setup

Similar to Pi, Oh-My-Pi uses the programmatic adapter:

```typescript
import { createOhMyPiAdapter } from '@a5c-ai/hooks-proxy-adapter-oh-my-pi';

const adapter = createOhMyPiAdapter();
```

### Capabilities

| Feature | Support |
|---------|---------|
| Session ID | Native |
| Blocking (deny/ask) | Yes |
| Additional context | Native |
| Tool interception | All tools |
| Env persistence | Runtime hook |
| Tool input mutation | Yes |
| Tool result mutation | Yes |

---

## OpenCode

**Adapter package:** `@a5c-ai/hooks-proxy-adapter-opencode`
**Family:** In-process
**Session ID:** Derived
**Env persistence:** Wrapper only

### Setup

```typescript
import { createOpenCodeAdapter } from '@a5c-ai/hooks-proxy-adapter-opencode';

const adapter = createOpenCodeAdapter();
```

### Capabilities

| Feature | Support |
|---------|---------|
| Session ID | Derived |
| Blocking (deny/ask) | Yes |
| Additional context | No (emulated) |
| Tool interception | Shell only |
| Env persistence | Wrapper only |
| Tool input mutation | No |
| Tool result mutation | No |

---

## OpenClaw

**Adapter package:** `@a5c-ai/hooks-proxy-adapter-openclaw`
**Family:** In-process
**Session ID:** Derived
**Env persistence:** Wrapper only

### Setup

```typescript
import { createOpenClawAdapter } from '@a5c-ai/hooks-proxy-adapter-openclaw';

const adapter = createOpenClawAdapter();
```

### Capabilities

| Feature | Support |
|---------|---------|
| Session ID | Derived |
| Blocking (deny/ask) | Yes |
| Additional context | No (emulated) |
| Tool interception | Shell only |
| Env persistence | Wrapper only |
| Tool input mutation | No |
| Tool result mutation | No |

---

## Running the Doctor

To verify your adapter setup and check for integration issues:

```bash
# Check all adapters
npx -y @a5c-ai/hooks-proxy doctor

# Check a specific adapter
npx -y @a5c-ai/hooks-proxy doctor --adapter claude

# JSON output for scripting
npx -y @a5c-ai/hooks-proxy doctor --json

# Include session health with custom stale threshold
npx -y @a5c-ai/hooks-proxy doctor --stale-threshold 48
```

The doctor command probes each adapter package, reports capability profiles, generates integration warnings for capability gaps, and checks session store health including stale session detection.
