#!/bin/bash
# Unified AfterAgent Hook for Gemini CLI
# Routes through hooks-proxy for all hook execution.
#
# This is the CORE orchestration loop driver for Gemini CLI.
# Fires after every agent turn. Checks if a babysitter run is bound to this
# session; if so, blocks the session exit to continue iterating until the run
# completes or the completion proof is detected.
#
# Protocol:
#   Input:  JSON via stdin (contains session_id, prompt_response, etc.)
#   Output: JSON via stdout
#     - {} or {"decision":"allow"} -> allow session to exit normally
#     - {"decision":"block","reason":"...","systemMessage":"..."} -> continue loop
#   Stderr: debug/log output only
#   Exit 0: success (stdout parsed as JSON)
#   Exit 2: block immediately (stderr used as rejection reason)
#
# Completion detection:
#   The agent must output <promise>COMPLETION_PROOF</promise> in its response.
#   The SDK verifies the proof matches the run's completionProof field.

set -uo pipefail

EXTENSION_PATH="${GEMINI_EXTENSION_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
PROXY_MARKER_FILE="${EXTENSION_PATH}/.hooks-proxy-install-attempted"
GLOBAL_ROOT="${BABYSITTER_GLOBAL_STATE_DIR:-$HOME/.a5c}"
STATE_DIR="${BABYSITTER_STATE_DIR:-${GLOBAL_ROOT}/state}"

# Get required version from versions.json (used for hooks-proxy)
SDK_VERSION=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('${EXTENSION_PATH}/versions.json','utf8')).sdkVersion||'latest')}catch{console.log('latest')}" 2>/dev/null || echo "latest")

LOG_DIR="${BABYSITTER_LOG_DIR:-${GLOBAL_ROOT}/logs}"
LOG_FILE="$LOG_DIR/babysitter-after-agent-hook.log"
mkdir -p "$LOG_DIR" 2>/dev/null

# Structured logging helper — writes to both local log and via CLI
blog() {
  local msg="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[INFO] $ts $msg" >> "$LOG_FILE" 2>/dev/null
  if command -v babysitter &>/dev/null; then
    babysitter log --type hook --label "hook:after-agent" --message "$msg" --source shell-hook 2>/dev/null || true
  fi
}

blog "Unified AfterAgent hook invoked"

# ---------------------------------------------------------------------------
# Hooks-proxy install (same pattern as SDK install in session-start)
# ---------------------------------------------------------------------------

install_hooks_proxy() {
  local target_version="$1"
  if npm i -g "@a5c-ai/hooks-proxy-cli@${target_version}" --loglevel=error 2>/dev/null; then
    blog "Installed hooks-proxy globally (${target_version})"
    return 0
  else
    if npm i -g "@a5c-ai/hooks-proxy-cli@${target_version}" --prefix "$HOME/.local" --loglevel=error 2>/dev/null; then
      export PATH="$HOME/.local/bin:$PATH"
      blog "Installed hooks-proxy to user prefix (${target_version})"
      return 0
    fi
  fi
  return 1
}

# Resolve hooks-proxy binary
PROXY=""
if command -v a5c-hooks-proxy &>/dev/null; then
  PROXY="a5c-hooks-proxy"
elif [ -f "$HOME/.local/bin/a5c-hooks-proxy" ]; then
  PROXY="$HOME/.local/bin/a5c-hooks-proxy"
fi

# Install if not found (only attempt once per plugin version)
if [ -z "$PROXY" ] && [ ! -f "$PROXY_MARKER_FILE" ]; then
  blog "hooks-proxy not found, attempting install"
  install_hooks_proxy "$SDK_VERSION"
  echo "$SDK_VERSION" > "$PROXY_MARKER_FILE" 2>/dev/null
  if command -v a5c-hooks-proxy &>/dev/null; then
    PROXY="a5c-hooks-proxy"
  elif [ -f "$HOME/.local/bin/a5c-hooks-proxy" ]; then
    PROXY="$HOME/.local/bin/a5c-hooks-proxy"
  fi
fi

# npx fallback if still not found
if [ -z "$PROXY" ]; then
  blog "hooks-proxy not found after install, using npx fallback"
  PROXY="npx -y @a5c-ai/hooks-proxy-cli@${SDK_VERSION} "
fi

# ---------------------------------------------------------------------------
# Capture stdin and delegate to hooks-proxy
# ---------------------------------------------------------------------------

INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/bsitter-after-agent-$$.json")
cat > "$INPUT_FILE"

INPUT_SIZE=$(wc -c < "$INPUT_FILE" 2>/dev/null || echo "?")
blog "Hook input received ($INPUT_SIZE bytes)"

STDERR_LOG="$LOG_DIR/babysitter-after-agent-hook-stderr.log"

blog "Using hooks-proxy: $PROXY"
RESULT=$($PROXY invoke \
  --adapter gemini \
  --handler "babysitter hook:run --harness unified --hook-type stop --state-dir ${STATE_DIR} --json" \
  --json \
  < "$INPUT_FILE" 2>>"$STDERR_LOG")
EXIT_CODE=$?

blog "CLI exit code=$EXIT_CODE result_len=$(echo -n "$RESULT" | wc -c)"

rm -f "$INPUT_FILE" 2>/dev/null

# Output result (must be valid JSON on stdout only)
if [ -n "$RESULT" ]; then
  printf '%s\n' "$RESULT"
else
  printf '{}\n'
fi

exit $EXIT_CODE
