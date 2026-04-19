#!/usr/bin/env bash
# Unified UserPromptSubmit Hook - mirrors user-prompt-submit.sh
# but routes through hooks-proxy when available, falling back to direct SDK.
# NOT YET ACTIVE — parallel to existing hook scripts
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
GLOBAL_ROOT="${BABYSITTER_GLOBAL_STATE_DIR:-$HOME/.a5c}"
STATE_DIR="${BABYSITTER_STATE_DIR:-${GLOBAL_ROOT}/state}"
LOG_DIR="${BABYSITTER_LOG_DIR:-${GLOBAL_ROOT}/logs}"

export CODEX_PLUGIN_ROOT="${CODEX_PLUGIN_ROOT:-${PLUGIN_ROOT}}"
export BABYSITTER_STATE_DIR="${STATE_DIR}"

mkdir -p "$LOG_DIR" 2>/dev/null

INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/codex-user-prompt-submit-hook-$$.json")
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
  # Route through hooks-proxy with codex adapter
  RESULT=$($PROXY invoke \
    --adapter codex \
    --handler "babysitter hook:run --harness unified --hook-type user-prompt-submit --plugin-root ${CODEX_PLUGIN_ROOT} --state-dir ${BABYSITTER_STATE_DIR}" \
    --json \
    < "$INPUT_FILE" 2>"$STDERR_LOG") || {
    babysitter log --type hook --label "hook:user-prompt-submit" --message "hooks-proxy failed (exit=$?), falling back to direct SDK" --source shell-hook 2>/dev/null || true
    # Fallback to direct SDK if hooks-proxy fails
    RESULT=$(babysitter hook:run \
      --hook-type user-prompt-submit \
      --harness codex \
      --plugin-root "${CODEX_PLUGIN_ROOT}" \
      --state-dir "${BABYSITTER_STATE_DIR}" \
      < "$INPUT_FILE" 2>"$STDERR_LOG")
  }
  EXIT_CODE=$?
else
  babysitter log --type hook --label "hook:user-prompt-submit" --message "No hooks-proxy, using SDK directly" --source shell-hook 2>/dev/null || true
  RESULT=$(babysitter hook:run \
    --hook-type user-prompt-submit \
    --harness codex \
    --plugin-root "${CODEX_PLUGIN_ROOT}" \
    --state-dir "${BABYSITTER_STATE_DIR}" \
    < "$INPUT_FILE" 2>"$STDERR_LOG")
  EXIT_CODE=$?
fi

babysitter log --type hook --label "hook:user-prompt-submit" --message "CLI exit code=$EXIT_CODE" --source shell-hook 2>/dev/null || true

rm -f "$INPUT_FILE" 2>/dev/null
if [ -n "$RESULT" ]; then
  printf '%s\n' "$RESULT"
fi
exit $EXIT_CODE
