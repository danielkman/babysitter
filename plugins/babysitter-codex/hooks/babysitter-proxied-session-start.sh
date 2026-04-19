#!/usr/bin/env bash
# Unified Session Start Hook - routes through hooks-proxy for all hook execution.
#
# Ensures the babysitter CLI and hooks-proxy are installed (from versions.json
# sdkVersion), then delegates to the TypeScript handler via hooks-proxy.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
GLOBAL_ROOT="${BABYSITTER_GLOBAL_STATE_DIR:-$HOME/.a5c}"
STATE_DIR="${BABYSITTER_STATE_DIR:-${GLOBAL_ROOT}/state}"
LOG_DIR="${BABYSITTER_LOG_DIR:-${GLOBAL_ROOT}/logs}"
LOG_FILE="$LOG_DIR/babysitter-session-start-hook.log"
SDK_MARKER_FILE="${PLUGIN_ROOT}/.babysitter-install-attempted"
PROXY_MARKER_FILE="${PLUGIN_ROOT}/.hooks-proxy-install-attempted"

export CODEX_PLUGIN_ROOT="${CODEX_PLUGIN_ROOT:-${PLUGIN_ROOT}}"
export BABYSITTER_STATE_DIR="${STATE_DIR}"

mkdir -p "$LOG_DIR" 2>/dev/null

blog() {
  local msg="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[INFO] $ts $msg" >> "$LOG_FILE" 2>/dev/null
  if command -v babysitter &>/dev/null; then
    babysitter log --type hook --label "hook:session-start" --message "$msg" --source shell-hook 2>/dev/null || true
  fi
}

blog "Unified hook script invoked"
blog "PLUGIN_ROOT=$PLUGIN_ROOT"
blog "STATE_DIR=$STATE_DIR"

# Get required SDK version from versions.json (used for both SDK and hooks-proxy)
SDK_VERSION=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('${PLUGIN_ROOT}/versions.json','utf8')).sdkVersion||'latest')}catch{console.log('latest')}" 2>/dev/null || echo "latest")

# ---------------------------------------------------------------------------
# SDK install/upgrade
# ---------------------------------------------------------------------------

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

NEEDS_SDK_INSTALL=false
if command -v babysitter &>/dev/null; then
  CURRENT_VERSION=$(babysitter --version 2>/dev/null || echo "unknown")
  if [ "$CURRENT_VERSION" != "$SDK_VERSION" ]; then
    blog "SDK version mismatch: installed=${CURRENT_VERSION}, required=${SDK_VERSION}"
    NEEDS_SDK_INSTALL=true
  else
    blog "SDK version OK: ${CURRENT_VERSION}"
  fi
else
  blog "SDK CLI not found, will install"
  NEEDS_SDK_INSTALL=true
fi

if [ "$NEEDS_SDK_INSTALL" = true ] && [ ! -f "$SDK_MARKER_FILE" ]; then
  install_sdk "$SDK_VERSION"
  echo "$SDK_VERSION" > "$SDK_MARKER_FILE" 2>/dev/null
fi

if ! command -v babysitter &>/dev/null; then
  blog "CLI not found after install, using npx fallback"
  babysitter() { npx -y "@a5c-ai/babysitter-sdk@${SDK_VERSION}" "$@"; }
  export -f babysitter
fi

# ---------------------------------------------------------------------------
# Hooks-proxy install/upgrade (same pattern as SDK)
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

NEEDS_PROXY_INSTALL=false
if command -v a5c-hooks-proxy &>/dev/null; then
  PROXY_VERSION=$(a5c-hooks-proxy --version 2>/dev/null || echo "unknown")
  if [ "$PROXY_VERSION" != "$SDK_VERSION" ]; then
    blog "hooks-proxy version mismatch: installed=${PROXY_VERSION}, required=${SDK_VERSION}"
    NEEDS_PROXY_INSTALL=true
  else
    blog "hooks-proxy version OK: ${PROXY_VERSION}"
  fi
elif [ -f "$HOME/.local/bin/a5c-hooks-proxy" ]; then
  export PATH="$HOME/.local/bin:$PATH"
  PROXY_VERSION=$(a5c-hooks-proxy --version 2>/dev/null || echo "unknown")
  if [ "$PROXY_VERSION" != "$SDK_VERSION" ]; then
    blog "hooks-proxy version mismatch: installed=${PROXY_VERSION}, required=${SDK_VERSION}"
    NEEDS_PROXY_INSTALL=true
  else
    blog "hooks-proxy version OK: ${PROXY_VERSION}"
  fi
else
  blog "hooks-proxy not found, will install"
  NEEDS_PROXY_INSTALL=true
fi

if [ "$NEEDS_PROXY_INSTALL" = true ] && [ ! -f "$PROXY_MARKER_FILE" ]; then
  install_hooks_proxy "$SDK_VERSION"
  echo "$SDK_VERSION" > "$PROXY_MARKER_FILE" 2>/dev/null
fi

# Resolve hooks-proxy binary (npx fallback if still not found)
PROXY=""
if command -v a5c-hooks-proxy &>/dev/null; then
  PROXY="a5c-hooks-proxy"
elif [ -f "$HOME/.local/bin/a5c-hooks-proxy" ]; then
  PROXY="$HOME/.local/bin/a5c-hooks-proxy"
fi

if [ -z "$PROXY" ]; then
  blog "hooks-proxy not found after install, using npx fallback"
  PROXY="npx -y @a5c-ai/hooks-proxy-cli@${SDK_VERSION} "
fi

# ---------------------------------------------------------------------------
# Capture stdin and delegate to hooks-proxy
# ---------------------------------------------------------------------------

INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/codex-session-start-hook-$$.json")
cat > "$INPUT_FILE"

blog "Hook input received ($(wc -c < "$INPUT_FILE") bytes)"

STDERR_LOG="$LOG_DIR/babysitter-session-start-hook-stderr.log"

blog "Using hooks-proxy: $PROXY"
RESULT=$($PROXY invoke \
  --adapter codex \
  --handler "babysitter hook:run --harness unified --hook-type session-start --plugin-root ${CODEX_PLUGIN_ROOT} --state-dir ${BABYSITTER_STATE_DIR}" \
  --json \
  < "$INPUT_FILE" 2>"$STDERR_LOG")
EXIT_CODE=$?

blog "CLI exit code=$EXIT_CODE"

rm -f "$INPUT_FILE" 2>/dev/null
printf '%s\n' "$RESULT"
exit $EXIT_CODE
