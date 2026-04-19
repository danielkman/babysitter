#!/usr/bin/env bash
# Unified Session Start Hook - mirrors session-start.sh
# but routes through hooks-proxy when available, falling back to direct SDK.
# NOT YET ACTIVE — parallel to existing hook scripts
#
# Ensures the babysitter SDK CLI is installed (from versions.json sdkVersion),
# then delegates to the SDK hook handler.
#
# Protocol:
#   Input:  JSON via stdin (contains session_id, cwd, etc.)
#   Output: JSON via stdout ({} on success)
#   Stderr: debug/log output only
#   Exit 0: success
#   Exit 2: block (fatal error)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
GLOBAL_ROOT="${BABYSITTER_GLOBAL_STATE_DIR:-$HOME/.a5c}"
STATE_DIR="${BABYSITTER_STATE_DIR:-${GLOBAL_ROOT}/state}"
LOG_DIR="${BABYSITTER_LOG_DIR:-${GLOBAL_ROOT}/logs}"
LOG_FILE="$LOG_DIR/babysitter-session-start-hook.log"

export CURSOR_PLUGIN_ROOT="${CURSOR_PLUGIN_ROOT:-${PLUGIN_ROOT}}"
export BABYSITTER_STATE_DIR="${STATE_DIR}"

mkdir -p "$LOG_DIR" 2>/dev/null

blog() {
  local msg="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[INFO] $ts $msg" >> "$LOG_FILE" 2>/dev/null
  babysitter log --type hook --label "hook:session-start" --message "$msg" --source shell-hook 2>/dev/null || true
}

blog "Unified hook script invoked"
blog "PLUGIN_ROOT=$PLUGIN_ROOT"
blog "STATE_DIR=$STATE_DIR"

# Get required SDK version from versions.json
SDK_VERSION=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('${PLUGIN_ROOT}/versions.json','utf8')).sdkVersion||'latest')}catch{console.log('latest')}" 2>/dev/null || echo "latest")

# Function to install/upgrade SDK
install_sdk() {
  local target_version="$1"
  if npm i -g "@a5c-ai/babysitter-sdk@${target_version}" --loglevel=error 2>/dev/null; then
    blog "Installed SDK globally (${target_version})"
    return 0
  else
    if npm i -g "@a5c-ai/babysitter-sdk@${target_version}" --prefix "$HOME/.local" --loglevel=error 2>/dev/null; then
      export PATH="$HOME/.local/bin:$PATH"
      blog "Installed SDK to user prefix (${target_version})"
      return 0
    fi
  fi
  return 1
}

# Check if babysitter CLI exists and if version matches
NEEDS_INSTALL=false
if command -v babysitter &>/dev/null; then
  CURRENT_VERSION=$(babysitter --version 2>/dev/null || echo "unknown")
  if [ "$CURRENT_VERSION" != "$SDK_VERSION" ]; then
    blog "SDK version mismatch: installed=${CURRENT_VERSION}, required=${SDK_VERSION}"
    NEEDS_INSTALL=true
  else
    blog "SDK version OK: ${CURRENT_VERSION}"
  fi
else
  blog "SDK CLI not found, will install"
  NEEDS_INSTALL=true
fi

MARKER_FILE="${PLUGIN_ROOT}/.babysitter-install-attempted"

# Install/upgrade if needed (only attempt once per plugin version)
if [ "$NEEDS_INSTALL" = true ] && [ ! -f "$MARKER_FILE" ]; then
  install_sdk "$SDK_VERSION"
  echo "$SDK_VERSION" > "$MARKER_FILE" 2>/dev/null
fi

# If still not available after install attempt, try npx as last resort
if ! command -v babysitter &>/dev/null; then
  blog "CLI not found after install, using npx fallback"
  babysitter() { npx -y "@a5c-ai/babysitter-sdk@${SDK_VERSION}" "$@"; }
  export -f babysitter
fi

# Capture stdin to a temp file so the CLI receives a clean EOF
INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/cursor-session-start-hook-$$.json")
cat > "$INPUT_FILE"

blog "Hook input received ($(wc -c < "$INPUT_FILE") bytes)"

# Resolve hooks-proxy binary
PROXY=""
if command -v a5c-hooks-proxy &>/dev/null; then
  PROXY="a5c-hooks-proxy"
elif [ -f "$HOME/.local/bin/a5c-hooks-proxy" ]; then
  PROXY="$HOME/.local/bin/a5c-hooks-proxy"
fi

STDERR_LOG="$LOG_DIR/babysitter-session-start-hook-stderr.log"

if [ -n "$PROXY" ]; then
  blog "Using hooks-proxy: $PROXY"
  # Route through hooks-proxy with cursor adapter
  RESULT=$($PROXY invoke \
    --adapter cursor \
    --handler "babysitter hook:run --harness unified --hook-type session-start --plugin-root ${CURSOR_PLUGIN_ROOT} --state-dir ${BABYSITTER_STATE_DIR} --json" \
    --json \
    < "$INPUT_FILE" 2>"$STDERR_LOG") || {
    blog "hooks-proxy failed (exit=$?), falling back to direct SDK"
    # Fallback to direct SDK if hooks-proxy fails
    RESULT=$(babysitter hook:run \
      --hook-type session-start \
      --harness cursor \
      --plugin-root "$PLUGIN_ROOT" \
      --state-dir "${BABYSITTER_STATE_DIR}" \
      --json < "$INPUT_FILE" 2>"$STDERR_LOG")
  }
  EXIT_CODE=$?
else
  blog "No hooks-proxy available, using SDK directly"
  RESULT=$(babysitter hook:run \
    --hook-type session-start \
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
