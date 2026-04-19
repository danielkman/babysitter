#!/bin/bash
# Unified Stop Hook - routes through hooks-proxy for all hook execution.
#
# All logic is implemented in: babysitter hook:run --hook-type stop

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PROXY_MARKER_FILE="${PLUGIN_ROOT}/.hooks-proxy-install-attempted"

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
  if command -v babysitter &>/dev/null; then
    babysitter log --type hook --label "hook:stop" --message "$msg" --source shell-hook 2>/dev/null || true
  fi
}

blog "Unified hook script invoked"
blog "PLUGIN_ROOT=$PLUGIN_ROOT"

# Get required version from versions.json (used for hooks-proxy)
SDK_VERSION=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('${PLUGIN_ROOT}/versions.json','utf8')).sdkVersion||'latest')}catch{console.log('latest')}" 2>/dev/null || echo "latest")

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
  # Re-resolve after install
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

INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/hook-input-$$.json")
cat > "$INPUT_FILE"

blog "Hook input received ($(wc -c < "$INPUT_FILE") bytes)"

STDERR_LOG="$LOG_DIR/babysitter-stop-hook-stderr.log"

blog "Using hooks-proxy: $PROXY"
RESULT=$($PROXY invoke \
  --adapter claude \
  --handler "babysitter hook:run --harness unified --hook-type stop --plugin-root $PLUGIN_ROOT --json" \
  --json \
  < "$INPUT_FILE" 2>"$STDERR_LOG")
EXIT_CODE=$?

blog "CLI exit code=$EXIT_CODE"

rm -f "$INPUT_FILE" 2>/dev/null
printf '%s\n' "$RESULT"
exit $EXIT_CODE
