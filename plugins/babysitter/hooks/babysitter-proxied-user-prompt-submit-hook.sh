#!/bin/bash
# Unified UserPromptSubmit Hook - mirrors babysitter-user-prompt-submit-hook.sh
# but routes through hooks-proxy when available, falling back to direct SDK.
# NOT YET ACTIVE — parallel to existing hook scripts
#
# Applies density-filter compression to long user prompts
# Delegates to SDK CLI: babysitter hook:run --hook-type user-prompt-submit

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

if ! command -v babysitter &>/dev/null; then
  # No CLI available — exit 0 (no-op, proceed with original command)
  exit 0
fi

GLOBAL_ROOT="${BABYSITTER_GLOBAL_STATE_DIR:-$HOME/.a5c}"
LOG_DIR="${BABYSITTER_LOG_DIR:-${GLOBAL_ROOT}/logs}"
mkdir -p "$LOG_DIR" 2>/dev/null

INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/hook-user-prompt-submit-$$.json")
cat > "$INPUT_FILE"

babysitter log --type hook --label "hook:user-prompt-submit" --message "Unified hook invoked" --source shell-hook 2>/dev/null || true

# Resolve hooks-proxy binary
PROXY=""
if command -v a5c-hooks-proxy &>/dev/null; then
  PROXY="a5c-hooks-proxy"
elif [ -f "$HOME/.local/bin/a5c-hooks-proxy" ]; then
  PROXY="$HOME/.local/bin/a5c-hooks-proxy"
fi

STDERR_LOG="$LOG_DIR/babysitter-user-prompt-submit-hook-stderr.log"

if [ -n "$PROXY" ]; then
  babysitter log --type hook --label "hook:user-prompt-submit" --message "Using hooks-proxy: $PROXY" --source shell-hook 2>/dev/null || true
  # Route through hooks-proxy with claude adapter
  RESULT=$($PROXY invoke \
    --adapter claude \
    --handler "babysitter hook:run --harness unified --hook-type user-prompt-submit --json" \
    --json \
    < "$INPUT_FILE" 2>"$STDERR_LOG") || {
    babysitter log --type hook --label "hook:user-prompt-submit" --message "hooks-proxy failed (exit=$?), falling back to direct SDK" --source shell-hook 2>/dev/null || true
    # Fallback to direct SDK if hooks-proxy fails
    RESULT=$(babysitter hook:run --hook-type user-prompt-submit --json < "$INPUT_FILE" 2>"$STDERR_LOG")
  }
  EXIT_CODE=$?
else
  babysitter log --type hook --label "hook:user-prompt-submit" --message "No hooks-proxy, using SDK directly" --source shell-hook 2>/dev/null || true
  RESULT=$(babysitter hook:run --hook-type user-prompt-submit --json < "$INPUT_FILE" 2>"$STDERR_LOG")
  EXIT_CODE=$?
fi

babysitter log --type hook --label "hook:user-prompt-submit" --message "CLI exit code=$EXIT_CODE" --source shell-hook 2>/dev/null || true

rm -f "$INPUT_FILE" 2>/dev/null

# Only output if non-empty — empty output means the hook failed; pass through silently
if [ -n "$RESULT" ]; then
  printf '%s\n' "$RESULT"
fi
exit $EXIT_CODE
