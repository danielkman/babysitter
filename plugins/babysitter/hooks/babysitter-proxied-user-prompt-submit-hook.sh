#!/bin/bash
# Unified UserPromptSubmit Hook - routes through hooks-proxy for all hook execution.
#
# Applies density-filter compression to long user prompts
# Delegates to SDK CLI: babysitter hook:run --hook-type user-prompt-submit

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PROXY_MARKER_FILE="${PLUGIN_ROOT}/.hooks-proxy-install-attempted"

GLOBAL_ROOT="${BABYSITTER_GLOBAL_STATE_DIR:-$HOME/.a5c}"
LOG_DIR="${BABYSITTER_LOG_DIR:-${GLOBAL_ROOT}/logs}"
mkdir -p "$LOG_DIR" 2>/dev/null

# Get required version from versions.json (used for hooks-proxy)
SDK_VERSION=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('${PLUGIN_ROOT}/versions.json','utf8')).sdkVersion||'latest')}catch{console.log('latest')}" 2>/dev/null || echo "latest")

# ---------------------------------------------------------------------------
# Hooks-proxy install (same pattern as SDK install in session-start)
# ---------------------------------------------------------------------------

install_hooks_proxy() {
  local target_version="$1"
  if npm i -g "@a5c-ai/hooks-proxy-cli@${target_version}" --loglevel=error 2>/dev/null; then
    return 0
  else
    if npm i -g "@a5c-ai/hooks-proxy-cli@${target_version}" --prefix "$HOME/.local" --loglevel=error 2>/dev/null; then
      export PATH="$HOME/.local/bin:$PATH"
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
  PROXY="npx -y @a5c-ai/hooks-proxy-cli@${SDK_VERSION} "
fi

# ---------------------------------------------------------------------------
# Capture stdin and delegate to hooks-proxy
# ---------------------------------------------------------------------------

INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/hook-user-prompt-submit-$$.json")
cat > "$INPUT_FILE"

if command -v babysitter &>/dev/null; then
  babysitter log --type hook --label "hook:user-prompt-submit" --message "Unified hook invoked" --source shell-hook 2>/dev/null || true
fi

STDERR_LOG="$LOG_DIR/babysitter-user-prompt-submit-hook-stderr.log"

RESULT=$($PROXY invoke \
  --adapter claude \
  --handler "babysitter hook:run --harness unified --hook-type user-prompt-submit --json" \
  --json \
  < "$INPUT_FILE" 2>"$STDERR_LOG")
EXIT_CODE=$?

if command -v babysitter &>/dev/null; then
  babysitter log --type hook --label "hook:user-prompt-submit" --message "CLI exit code=$EXIT_CODE" --source shell-hook 2>/dev/null || true
fi

rm -f "$INPUT_FILE" 2>/dev/null

# Only output if non-empty — empty output means the hook failed; pass through silently
if [ -n "$RESULT" ]; then
  printf '%s\n' "$RESULT"
fi
exit $EXIT_CODE
