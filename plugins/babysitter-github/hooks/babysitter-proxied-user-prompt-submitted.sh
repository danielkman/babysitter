#!/bin/bash
# Unified userPromptSubmitted Hook for GitHub Copilot CLI
# Mirrors user-prompt-submitted.sh but routes through hooks-proxy when available,
# falling back to direct SDK.
# NOT YET ACTIVE — parallel to existing hook scripts
#
# Applies density-filter compression to long user prompts.
# Delegates to SDK CLI: babysitter hook:run --hook-type user-prompt-submitted
#
# NOTE: Output from this hook is IGNORED by Copilot CLI.
# This hook is for logging and side-effects only.

PLUGIN_ROOT="${COPILOT_PLUGIN_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

if ! command -v babysitter &>/dev/null; then
  # No CLI available — exit 0 (no-op, proceed with original command)
  exit 0
fi

GLOBAL_ROOT="${BABYSITTER_GLOBAL_STATE_DIR:-$HOME/.a5c}"
LOG_DIR="${BABYSITTER_LOG_DIR:-${GLOBAL_ROOT}/logs}"
mkdir -p "$LOG_DIR" 2>/dev/null

INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/hook-user-prompt-submitted-$$.json")
cat > "$INPUT_FILE"

babysitter log --type hook --label "hook:user-prompt-submitted" --message "Unified hook invoked" --source shell-hook 2>/dev/null || true

# Resolve hooks-proxy binary
PROXY=""
if command -v a5c-hooks-proxy &>/dev/null; then
  PROXY="a5c-hooks-proxy"
elif [ -f "$HOME/.local/bin/a5c-hooks-proxy" ]; then
  PROXY="$HOME/.local/bin/a5c-hooks-proxy"
fi

STDERR_LOG="$LOG_DIR/babysitter-user-prompt-submitted-hook-stderr.log"

if [ -n "$PROXY" ]; then
  babysitter log --type hook --label "hook:user-prompt-submitted" --message "Using hooks-proxy: $PROXY" --source shell-hook 2>/dev/null || true
  # Route through hooks-proxy with copilot adapter
  $PROXY invoke \
    --adapter copilot \
    --handler "babysitter hook:run --harness unified --hook-type user-prompt-submitted --json" \
    --json \
    < "$INPUT_FILE" 2>"$STDERR_LOG" || {
    babysitter log --type hook --label "hook:user-prompt-submitted" --message "hooks-proxy failed (exit=$?), falling back to direct SDK" --source shell-hook 2>/dev/null || true
    # Fallback to direct SDK if hooks-proxy fails
    babysitter hook:run --hook-type user-prompt-submitted --harness github-copilot --json < "$INPUT_FILE" 2>"$STDERR_LOG" || true
  }
else
  babysitter log --type hook --label "hook:user-prompt-submitted" --message "No hooks-proxy, using SDK directly" --source shell-hook 2>/dev/null || true
  babysitter hook:run --hook-type user-prompt-submitted --harness github-copilot --json < "$INPUT_FILE" 2>"$STDERR_LOG" || true
fi

babysitter log --type hook --label "hook:user-prompt-submitted" --message "Hook complete" --source shell-hook 2>/dev/null || true

rm -f "$INPUT_FILE" 2>/dev/null

exit 0
