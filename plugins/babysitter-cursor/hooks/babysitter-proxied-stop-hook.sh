#!/usr/bin/env bash
# Unified Stop Hook - mirrors stop-hook.sh
# but routes through hooks-proxy when available, falling back to direct SDK.
# NOT YET ACTIVE — parallel to existing hook scripts
#
# Drives the orchestration loop by checking run state on session stop.
#
# Protocol:
#   Input:  JSON via stdin (session context)
#   Output: JSON via stdout (with optional continue/stop signal)
#   Stderr: debug/log output only
#   Exit 0: success

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
GLOBAL_ROOT="${BABYSITTER_GLOBAL_STATE_DIR:-$HOME/.a5c}"
STATE_DIR="${BABYSITTER_STATE_DIR:-${GLOBAL_ROOT}/state}"
LOG_DIR="${BABYSITTER_LOG_DIR:-${GLOBAL_ROOT}/logs}"
LOG_FILE="$LOG_DIR/babysitter-stop-hook.log"

export CURSOR_PLUGIN_ROOT="${CURSOR_PLUGIN_ROOT:-${PLUGIN_ROOT}}"
export BABYSITTER_STATE_DIR="${STATE_DIR}"

if ! command -v babysitter &>/dev/null; then
  # No CLI available — exit 0 (no-op, proceed with original command)
  exit 0
fi

mkdir -p "$LOG_DIR" 2>/dev/null

blog() {
  local msg="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[INFO] $ts $msg" >> "$LOG_FILE" 2>/dev/null
  babysitter log --type hook --label "hook:stop" --message "$msg" --source shell-hook 2>/dev/null || true
}

blog "Unified hook script invoked"
blog "PLUGIN_ROOT=$PLUGIN_ROOT"
blog "STATE_DIR=$STATE_DIR"



INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/cursor-stop-hook-$$.json")
cat > "$INPUT_FILE"

blog "Hook input received ($(wc -c < "$INPUT_FILE") bytes)"

# Resolve hooks-proxy binary
PROXY=""
if command -v a5c-hooks-proxy &>/dev/null; then
  PROXY="a5c-hooks-proxy"
elif [ -f "$HOME/.local/bin/a5c-hooks-proxy" ]; then
  PROXY="$HOME/.local/bin/a5c-hooks-proxy"
fi

STDERR_LOG="$LOG_DIR/babysitter-stop-hook-stderr.log"

if [ -n "$PROXY" ]; then
  blog "Using hooks-proxy: $PROXY"
  # Route through hooks-proxy with cursor adapter
  RESULT=$($PROXY invoke \
    --adapter cursor \
    --handler "babysitter hook:run --harness unified --hook-type stop --plugin-root ${CURSOR_PLUGIN_ROOT} --state-dir ${BABYSITTER_STATE_DIR} --json" \
    --json \
    < "$INPUT_FILE" 2>"$STDERR_LOG") || {
    blog "hooks-proxy failed (exit=$?), falling back to direct SDK"
    # Fallback to direct SDK if hooks-proxy fails
    RESULT=$(babysitter hook:run \
      --hook-type stop \
      --harness cursor \
      --plugin-root "$PLUGIN_ROOT" \
      --state-dir "${BABYSITTER_STATE_DIR}" \
      --json < "$INPUT_FILE" 2>"$STDERR_LOG")
  }
  EXIT_CODE=$?
else
  blog "No hooks-proxy available, using SDK directly"
  RESULT=$(babysitter hook:run \
    --hook-type stop \
    --harness cursor \
    --plugin-root "$PLUGIN_ROOT" \
    --state-dir "${BABYSITTER_STATE_DIR}" \
    --json < "$INPUT_FILE" 2>"$STDERR_LOG")
  EXIT_CODE=$?
fi

blog "CLI exit code=$EXIT_CODE"

rm -f "$INPUT_FILE" 2>/dev/null
printf '%s\n' "$RESULT"
exit $EXIT_CODE
