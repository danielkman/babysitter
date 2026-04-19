#!/bin/bash
# Unified Session End Hook for GitHub Copilot CLI
# Mirrors session-end.sh but routes through hooks-proxy when available,
# falling back to direct SDK.
# NOT YET ACTIVE — parallel to existing hook scripts
#
# Cleanup and logging on session exit.
#
# NOTE: Unlike Claude Code's Stop hook, sessionEnd output is IGNORED by
# Copilot CLI. This hook cannot block session exit or drive an orchestration
# loop. It is purely for cleanup and logging.
#
# Protocol:
#   Input:  JSON via stdin (session context)
#   Output: IGNORED by Copilot CLI
#   Exit 0: success (exit code also ignored)

set -uo pipefail

PLUGIN_ROOT="${COPILOT_PLUGIN_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

if ! command -v babysitter &>/dev/null; then
  # No CLI available — exit 0 (no-op, proceed with original command)
  exit 0
fi

GLOBAL_ROOT="${BABYSITTER_GLOBAL_STATE_DIR:-$HOME/.a5c}"
LOG_DIR="${BABYSITTER_LOG_DIR:-${GLOBAL_ROOT}/logs}"
LOG_FILE="$LOG_DIR/babysitter-session-end-hook.log"

mkdir -p "$LOG_DIR" 2>/dev/null

# Structured logging helper
blog() {
  local msg="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[INFO] $ts $msg" >> "$LOG_FILE" 2>/dev/null
  babysitter log --type hook --label "hook:session-end" --message "$msg" --source shell-hook 2>/dev/null || true
}

blog "Unified hook script invoked"
blog "PLUGIN_ROOT=$PLUGIN_ROOT"

# Capture stdin so we can log size and pass to CLI
INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/hook-session-end-$$.json")
cat > "$INPUT_FILE"

blog "Hook input received ($(wc -c < "$INPUT_FILE") bytes)"

# Resolve hooks-proxy binary
PROXY=""
if command -v a5c-hooks-proxy &>/dev/null; then
  PROXY="a5c-hooks-proxy"
elif [ -f "$HOME/.local/bin/a5c-hooks-proxy" ]; then
  PROXY="$HOME/.local/bin/a5c-hooks-proxy"
fi

STDERR_LOG="$LOG_DIR/babysitter-session-end-hook-stderr.log"

# Run cleanup/logging via hooks-proxy or CLI; output is ignored by Copilot CLI
if [ -n "$PROXY" ]; then
  blog "Using hooks-proxy: $PROXY"
  $PROXY invoke \
    --adapter copilot \
    --handler "babysitter hook:run --harness unified --hook-type session-end --plugin-root ${PLUGIN_ROOT} --json" \
    --json \
    < "$INPUT_FILE" 2>"$STDERR_LOG" || {
    blog "hooks-proxy failed (exit=$?), falling back to direct SDK"
    babysitter hook:run --hook-type session-end --harness github-copilot --plugin-root "$PLUGIN_ROOT" --json < "$INPUT_FILE" 2>"$STDERR_LOG" || true
  }
else
  blog "No hooks-proxy available, using SDK directly"
  babysitter hook:run --hook-type session-end --harness github-copilot --plugin-root "$PLUGIN_ROOT" --json < "$INPUT_FILE" 2>"$STDERR_LOG" || true
fi

blog "Session end hook complete"

rm -f "$INPUT_FILE" 2>/dev/null

exit 0
