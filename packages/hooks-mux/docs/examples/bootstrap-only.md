# Example: Bootstrap-Only Mode

Initialize session context without running any hook logic. Useful when you need session state and env propagation set up before any real hook handlers are registered.

---

## Use Case

You want to:
- Ensure `AGENT_SESSION_ID` is available for downstream tools
- Initialize the session store for later hook invocations
- Set up baseline context without custom hook logic
- Prepare for plugins that will be added later

---

## Claude Code Setup

In `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "npx -y @a5c-ai/hooks-mux invoke --adapter claude --native-event SessionStart --bootstrap-only"
      }
    ]
  }
}
```

Or use the dedicated bootstrap command:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "npx -y @a5c-ai/hooks-mux bootstrap --adapter claude"
      }
    ]
  }
}
```

---

## Codex Setup

```bash
npx -y @a5c-ai/hooks-mux invoke --adapter codex --bootstrap-only
```

---

## What Happens

When bootstrap-only mode runs:

1. The adapter resolves the session ID from the harness-native payload
2. If no session exists, a new one is created with baseline state
3. The session is persisted to the session store
4. If the adapter supports env persistence, `AGENT_SESSION_ID` is propagated
5. A valid success result is returned to the harness
6. No user-provided handlers are executed

---

## Verifying the Bootstrap

After a bootstrap hook has run, verify with:

```bash
# Check the session was created
a5c-hooks-mux show-session --session-id "$AGENT_SESSION_ID"

# Run doctor to check session store health
a5c-hooks-mux doctor --json
```

---

## Adding Handlers Later

Once bootstrap is working, add handlers by switching to a registry:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "npx -y @a5c-ai/hooks-mux invoke --adapter claude --native-event SessionStart"
      }
    ]
  }
}
```

The registry can include handlers that depend on the session context initialized by earlier invocations.
