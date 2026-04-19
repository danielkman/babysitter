#!/bin/bash
# Unified Stop Hook - mirrors babysitter-stop-hook.sh
# but routes through hooks-proxy when available, falling back to direct SDK.
# NOT YET ACTIVE — parallel to existing hook scripts
#
# All logic is implemented in: babysitter hook:run --hook-type stop

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

if ! command -v babysitter &>/dev/null; then
  # No CLI available — exit 0 (no-op, proceed with original command)
  exit 0
fi
GLOBAL_ROOT="${BABYSITTER_GLOBAL_STATE_DIR:-$HOME/.a5c}"
LOG_DIR="${BABYSITTER_LOG_DIR:-${GLOBAL_ROOT}/logs}"
LOG_FILE="$LOG_DIR/babysitter-stop-hook.log"

mkdir -p "$LOG_DIR" 2>/dev/null

# Structured logging helper — writes to both local log and via CLI
blog() {
  local msg="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[INFO] $ts $msg" >> "$LOG_FILE" 2>/dev/null
  babysitter log --type hook --label "hook:stop" --message "$msg" --source shell-hook 2>/dev/null || true
}

blog "Unified hook script invoked"
blog "PLUGIN_ROOT=$PLUGIN_ROOT"

# Capture stdin so we can log size and pass to CLI
INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/hook-input-$$.json")
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
  # Route through hooks-proxy with claude adapter
  RESULT=$($PROXY invoke \
    --adapter claude \
    --handler "babysitter hook:run --harness unified --hook-type stop --plugin-root $PLUGIN_ROOT --json" \
    --json \
    < "$INPUT_FILE" 2>"$STDERR_LOG") || {
    blog "hooks-proxy failed (exit=$?), falling back to direct SDK"
    # Fallback to direct SDK if hooks-proxy fails
    RESULT=$(babysitter hook:run --hook-type stop --harness claude-code --plugin-root "$PLUGIN_ROOT" --json < "$INPUT_FILE" 2>"$STDERR_LOG")
  }
  EXIT_CODE=$?
else
  blog "No hooks-proxy available, using SDK directly"
  # Run the CLI, capturing stdout; redirect stderr to log
  RESULT=$(babysitter hook:run --hook-type stop --harness claude-code --plugin-root "$PLUGIN_ROOT" --json < "$INPUT_FILE" 2>"$STDERR_LOG")
  EXIT_CODE=$?
fi

blog "CLI exit code=$EXIT_CODE"

rm -f "$INPUT_FILE" 2>/dev/null
printf '%s\n' "$RESULT"
exit $EXIT_CODE
