# Hook Event Coverage Matrix

30 Claude Code hook events vs. implementation status across the agent stack.

## Legend
- **atlas**: Event defined in atlas graph schema
- **hooks-mux**: Canonical phase exists in hooks-mux core
- **adapters runtime**: Native runtime hook registration/dispatch exists
- **SDK**: SDK-emitted harness hook exists where SDK owns the source
- **agent-core**: Session event type exists

## Full Matrix

| # | Event | Canonical Phase | atlas | hooks-mux | adapters runtime | SDK | Status |
|---|-------|----------------|-------|-----------|---------------|-----|--------|
| 1 | SessionStart | session.start | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 2 | Setup | session.setup | ✅ | ✅ | ✅ | ❌ | **PARTIAL** |
| 3 | SessionEnd | session.end | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 4 | UserPromptSubmit | turn.user_prompt_submitted | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 5 | UserPromptExpansion | turn.prompt_expansion | ✅ | ✅ | ✅ | ❌ | **PARTIAL** |
| 6 | Stop | turn.stop | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 7 | StopFailure | turn.stop_failure | ✅ | ✅ | ✅ | ❌ | **PARTIAL** |
| 8 | PreToolUse | tool.before | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 9 | PermissionRequest | tool.permission_request | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 10 | PermissionDenied | tool.permission_denied | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 11 | PostToolUse | tool.after | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 12 | PostToolUseFailure | tool.after_failure | ✅ | ✅ | ✅ | ❌ | **PARTIAL** |
| 13 | PostToolBatch | tool.after_batch | ✅ | ✅ | ✅ | ❌ | **PARTIAL** |
| 14 | SubagentStart | subagent.start | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 15 | SubagentStop | subagent.end | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 16 | TaskCreated | task.created | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 17 | TaskCompleted | task.completed | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 18 | TeammateIdle | team.idle | ✅ | ✅ | ❌ | ❌ | **BLOCKED** |
| 19 | FileChanged | session.file_changed | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 20 | CwdChanged | session.cwd_changed | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 21 | ConfigChange | session.config_changed | ✅ | ✅ | ✅ | ❌ | **PARTIAL** |
| 22 | InstructionsLoaded | session.instructions_loaded | ✅ | ✅ | ✅ | ❌ | **PARTIAL** |
| 23 | PreCompact | session.compact.before | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 24 | PostCompact | session.compact.after | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 25 | Elicitation | mcp.elicitation | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 26 | ElicitationResult | mcp.elicitation_result | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 27 | WorktreeCreate | session.worktree_create | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 28 | WorktreeRemove | session.worktree_remove | ✅ | ✅ | ✅ | ✅ | **DONE** |
| 29 | MessageDisplay | message.received | ✅ | ✅ | ✅ | ❌ | **PARTIAL** |
| 30 | Notification | notification | ✅ | ✅ | ✅ | ✅ | **DONE** |

## Summary

| Status | Count | Percentage |
|--------|-------|-----------|
| DONE | 21 | 70% |
| PARTIAL | 8 | 27% |
| BLOCKED | 1 | 3% |
| atlas covered | 30 | 100% |

`PARTIAL` means hooks-mux and the native adapters runtime bridge can represent/dispatch the event, but a separate SDK-owned emission point is still absent or only applies where a concrete runtime source exists. `BLOCKED` means the canonical contract exists, but the stack does not yet have a real lifecycle boundary to emit the event.
