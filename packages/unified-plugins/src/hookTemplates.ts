// Hook script template generators

import type { TargetProfile } from './types.js';
import { slugify } from './utils.js';

function getHookTitle(canonicalHook: string): string {
  return canonicalHook
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^./, (str) => str.toUpperCase());
}

export function generateBashHookScript(
  canonicalHook: string,
  nativeHook: string,
  targetProfile: TargetProfile
): string {
  const hookType = slugify(canonicalHook);
  const hookTitle = getHookTitle(canonicalHook);
  const pluginRootEnvVar = targetProfile.pluginRootEnvVar || 'PLUGIN_ROOT';
  const adapterName = targetProfile.adapterName;
  const harnessDisplayName = targetProfile.displayName;

  return `#!/bin/bash
# Unified ${hookTitle} Hook for ${harnessDisplayName}
# Routes through hooks-proxy for all hook execution.
#
# Ensures the babysitter SDK CLI and hooks-proxy are installed (from versions.json
# sdkVersion), then delegates to the TypeScript handler via hooks-proxy.
#
# Protocol:
#   Input:  JSON via stdin (contains session_id, cwd, etc.)
#   Output: JSON via stdout ({} on success)
#   Stderr: debug/log output only
#   Exit 0: success
#   Exit 2: block (fatal error)

set -euo pipefail

PLUGIN_ROOT="\${${pluginRootEnvVar}:-$(cd "$(dirname "$0")/.." && pwd)}"
SDK_MARKER_FILE="\${PLUGIN_ROOT}/.babysitter-install-attempted"
PROXY_MARKER_FILE="\${PLUGIN_ROOT}/.hooks-proxy-install-attempted"

GLOBAL_ROOT="\${BABYSITTER_GLOBAL_STATE_DIR:-$HOME/.a5c}"
LOG_DIR="\${BABYSITTER_LOG_DIR:-\${GLOBAL_ROOT}/logs}"
LOG_FILE="$LOG_DIR/babysitter-${hookType}-hook.log"
mkdir -p "$LOG_DIR" 2>/dev/null

# Structured logging helper
blog() {
  local msg="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[INFO] $ts $msg" >> "$LOG_FILE" 2>/dev/null
  if command -v babysitter &>/dev/null; then
    babysitter log --type hook --label "hook:${hookType}" --message "$msg" --source shell-hook 2>/dev/null || true
  fi
}

blog "Unified hook script invoked"
blog "PLUGIN_ROOT=$PLUGIN_ROOT"

SDK_VERSION=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('\${PLUGIN_ROOT}/versions.json','utf8')).sdkVersion||'latest')}catch{console.log('latest')}" 2>/dev/null || echo "latest")

# --- SDK install/upgrade ---
install_sdk() {
  local target_version="$1"
  if npm i -g "@a5c-ai/babysitter-sdk@\${target_version}" --loglevel=error 2>/dev/null; then
    blog "Installed SDK globally (\${target_version})"
    return 0
  else
    if npm i -g "@a5c-ai/babysitter-sdk@\${target_version}" --prefix "$HOME/.local" --loglevel=error 2>/dev/null; then
      export PATH="$HOME/.local/bin:$PATH"
      blog "Installed SDK to user prefix (\${target_version})"
      return 0
    fi
  fi
  return 1
}

NEEDS_SDK_INSTALL=false
if command -v babysitter &>/dev/null; then
  CURRENT_VERSION=$(babysitter --version 2>/dev/null || echo "unknown")
  if [ "$CURRENT_VERSION" != "$SDK_VERSION" ]; then
    NEEDS_SDK_INSTALL=true
  fi
else
  NEEDS_SDK_INSTALL=true
fi

if [ "$NEEDS_SDK_INSTALL" = true ] && [ ! -f "$SDK_MARKER_FILE" ]; then
  install_sdk "$SDK_VERSION"
  echo "$SDK_VERSION" > "$SDK_MARKER_FILE" 2>/dev/null
fi

if ! command -v babysitter &>/dev/null; then
  babysitter() { npx -y "@a5c-ai/babysitter-sdk@\${SDK_VERSION}" "$@"; }
  export -f babysitter
fi

# --- hooks-proxy install/upgrade ---
install_hooks_proxy() {
  local target_version="$1"
  if npm i -g "@a5c-ai/hooks-proxy-cli@\${target_version}" --loglevel=error 2>/dev/null; then
    return 0
  else
    if npm i -g "@a5c-ai/hooks-proxy-cli@\${target_version}" --prefix "$HOME/.local" --loglevel=error 2>/dev/null; then
      export PATH="$HOME/.local/bin:$PATH"
      return 0
    fi
  fi
  return 1
}

NEEDS_PROXY_INSTALL=false
if command -v a5c-hooks-proxy &>/dev/null; then
  PROXY_VERSION=$(a5c-hooks-proxy --version 2>/dev/null || echo "unknown")
  if [ "$PROXY_VERSION" != "$SDK_VERSION" ]; then
    NEEDS_PROXY_INSTALL=true
  fi
elif [ -f "$HOME/.local/bin/a5c-hooks-proxy" ]; then
  export PATH="$HOME/.local/bin:$PATH"
  PROXY_VERSION=$(a5c-hooks-proxy --version 2>/dev/null || echo "unknown")
  if [ "$PROXY_VERSION" != "$SDK_VERSION" ]; then
    NEEDS_PROXY_INSTALL=true
  fi
else
  NEEDS_PROXY_INSTALL=true
fi

if [ "$NEEDS_PROXY_INSTALL" = true ] && [ ! -f "$PROXY_MARKER_FILE" ]; then
  install_hooks_proxy "$SDK_VERSION"
  echo "$SDK_VERSION" > "$PROXY_MARKER_FILE" 2>/dev/null
fi

PROXY=""
if command -v a5c-hooks-proxy &>/dev/null; then
  PROXY="a5c-hooks-proxy"
elif [ -f "$HOME/.local/bin/a5c-hooks-proxy" ]; then
  PROXY="$HOME/.local/bin/a5c-hooks-proxy"
fi

if [ -z "$PROXY" ]; then
  PROXY="npx -y @a5c-ai/hooks-proxy-cli@\${SDK_VERSION} "
fi

# --- Capture stdin and delegate ---
INPUT_FILE=$(mktemp 2>/dev/null || echo "/tmp/hook-${hookType}-$$.json")
cat > "$INPUT_FILE"

STDERR_LOG="$LOG_DIR/babysitter-${hookType}-hook-stderr.log"

RESULT=$($PROXY invoke \\
  --adapter ${adapterName} \\
  --handler "babysitter hook:run --harness unified --hook-type ${hookType} --plugin-root \${PLUGIN_ROOT} --json" \\
  --json \\
  < "$INPUT_FILE" 2>"$STDERR_LOG")
EXIT_CODE=$?

rm -f "$INPUT_FILE" 2>/dev/null
printf '%s\\n' "$RESULT"
exit $EXIT_CODE
`;
}

export function generatePowerShellHookScript(
  canonicalHook: string,
  nativeHook: string,
  targetProfile: TargetProfile
): string {
  const hookType = slugify(canonicalHook);
  const hookTitle = getHookTitle(canonicalHook);
  const pluginRootEnvVar = targetProfile.pluginRootEnvVar || 'PLUGIN_ROOT';
  const adapterName = targetProfile.adapterName;
  const harnessDisplayName = targetProfile.displayName;

  return `# Unified ${hookTitle} Hook for ${harnessDisplayName} (PowerShell)
# Routes through hooks-proxy for all hook execution.

$ErrorActionPreference = "Stop"

$PLUGIN_ROOT = if ($env:${pluginRootEnvVar}) { $env:${pluginRootEnvVar} } else { Split-Path -Parent $PSScriptRoot }
$SDK_MARKER_FILE = Join-Path $PLUGIN_ROOT ".babysitter-install-attempted"
$PROXY_MARKER_FILE = Join-Path $PLUGIN_ROOT ".hooks-proxy-install-attempted"

$GLOBAL_ROOT = if ($env:BABYSITTER_GLOBAL_STATE_DIR) { $env:BABYSITTER_GLOBAL_STATE_DIR } else { "$HOME/.a5c" }
$LOG_DIR = if ($env:BABYSITTER_LOG_DIR) { $env:BABYSITTER_LOG_DIR } else { "$GLOBAL_ROOT/logs" }
$LOG_FILE = "$LOG_DIR/babysitter-${hookType}-hook.log"

New-Item -ItemType Directory -Force -Path $LOG_DIR | Out-Null

function Write-Log {
  param([string]$Message)
  $Timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
  Add-Content -Path $LOG_FILE -Value "[INFO] $Timestamp $Message" -ErrorAction SilentlyContinue
}

Write-Log "Unified hook script invoked"
Write-Log "PLUGIN_ROOT=$PLUGIN_ROOT"

$VERSIONS_PATH = Join-Path $PLUGIN_ROOT "versions.json"
$SDK_VERSION = "latest"
if (Test-Path $VERSIONS_PATH) {
  try {
    $VersionsJson = Get-Content $VERSIONS_PATH | ConvertFrom-Json
    $SDK_VERSION = $VersionsJson.sdkVersion
  } catch {
    $SDK_VERSION = "latest"
  }
}

# --- SDK install/upgrade ---
function Install-Sdk {
  param([string]$Version)
  try {
    npm i -g "@a5c-ai/babysitter-sdk@$Version" --loglevel=error 2>$null
    Write-Log "Installed SDK globally ($Version)"
    return $true
  } catch {
    try {
      npm i -g "@a5c-ai/babysitter-sdk@$Version" --prefix "$HOME/.local" --loglevel=error 2>$null
      $env:PATH = "$HOME/.local/bin;$env:PATH"
      Write-Log "Installed SDK to user prefix ($Version)"
      return $true
    } catch {
      return $false
    }
  }
}

$NEEDS_SDK_INSTALL = $false
if (Get-Command babysitter -ErrorAction SilentlyContinue) {
  $CURRENT_VERSION = & babysitter --version 2>$null
  if ($CURRENT_VERSION -ne $SDK_VERSION) {
    $NEEDS_SDK_INSTALL = $true
  }
} else {
  $NEEDS_SDK_INSTALL = $true
}

if ($NEEDS_SDK_INSTALL -and !(Test-Path $SDK_MARKER_FILE)) {
  Install-Sdk $SDK_VERSION
  Set-Content -Path $SDK_MARKER_FILE -Value $SDK_VERSION
}

# --- hooks-proxy install/upgrade ---
function Install-HooksProxy {
  param([string]$Version)
  try {
    npm i -g "@a5c-ai/hooks-proxy-cli@$Version" --loglevel=error 2>$null
    return $true
  } catch {
    try {
      npm i -g "@a5c-ai/hooks-proxy-cli@$Version" --prefix "$HOME/.local" --loglevel=error 2>$null
      $env:PATH = "$HOME/.local/bin;$env:PATH"
      return $true
    } catch {
      return $false
    }
  }
}

$NEEDS_PROXY_INSTALL = $false
if (Get-Command a5c-hooks-proxy -ErrorAction SilentlyContinue) {
  $PROXY_VERSION = & a5c-hooks-proxy --version 2>$null
  if ($PROXY_VERSION -ne $SDK_VERSION) {
    $NEEDS_PROXY_INSTALL = $true
  }
} else {
  $NEEDS_PROXY_INSTALL = $true
}

if ($NEEDS_PROXY_INSTALL -and !(Test-Path $PROXY_MARKER_FILE)) {
  Install-HooksProxy $SDK_VERSION
  Set-Content -Path $PROXY_MARKER_FILE -Value $SDK_VERSION
}

$PROXY = ""
if (Get-Command a5c-hooks-proxy -ErrorAction SilentlyContinue) {
  $PROXY = "a5c-hooks-proxy"
} elseif (Test-Path "$HOME/.local/bin/a5c-hooks-proxy") {
  $PROXY = "$HOME/.local/bin/a5c-hooks-proxy"
  $env:PATH = "$HOME/.local/bin;$env:PATH"
} else {
  $PROXY = "npx -y @a5c-ai/hooks-proxy-cli@$SDK_VERSION"
}

# --- Capture stdin and delegate ---
$INPUT_FILE = [System.IO.Path]::GetTempFileName()
$Input | Set-Content -Path $INPUT_FILE

$STDERR_LOG = "$LOG_DIR/babysitter-${hookType}-hook-stderr.log"

$RESULT = & $PROXY invoke \`
  --adapter ${adapterName} \`
  --handler "babysitter hook:run --harness unified --hook-type ${hookType} --plugin-root $PLUGIN_ROOT --json" \`
  --json < $INPUT_FILE 2>$STDERR_LOG

$EXIT_CODE = $LASTEXITCODE
Remove-Item $INPUT_FILE -ErrorAction SilentlyContinue
Write-Output $RESULT
exit $EXIT_CODE
`;
}

export function generateJavaScriptHookScript(
  canonicalHook: string,
  nativeHook: string,
  targetProfile: TargetProfile
): string {
  const hookType = slugify(canonicalHook);
  const hookTitle = getHookTitle(canonicalHook);
  const adapterName = targetProfile.adapterName;
  const harnessDisplayName = targetProfile.displayName;

  return `#!/usr/bin/env node
// Unified ${hookTitle} Hook for ${harnessDisplayName}
// Routes through hooks-proxy for all hook execution.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PLUGIN_ROOT = process.env.OPENCODE_PLUGIN_ROOT || path.resolve(__dirname, "..");
const SDK_MARKER_FILE = path.join(PLUGIN_ROOT, ".babysitter-install-attempted");
const PROXY_MARKER_FILE = path.join(PLUGIN_ROOT, ".hooks-proxy-install-attempted");

const GLOBAL_ROOT = process.env.BABYSITTER_GLOBAL_STATE_DIR || path.join(os.homedir(), ".a5c");
const LOG_DIR = process.env.BABYSITTER_LOG_DIR || path.join(GLOBAL_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "babysitter-${hookType}-hook.log");

fs.mkdirSync(LOG_DIR, { recursive: true });

function blog(msg) {
  const ts = new Date().toISOString();
  try {
    fs.appendFileSync(LOG_FILE, \`[INFO] \${ts} \${msg}\\n\`);
  } catch {}
}

blog("Unified hook script invoked");
blog(\`PLUGIN_ROOT=\${PLUGIN_ROOT}\`);

let SDK_VERSION = "latest";
try {
  const versionsPath = path.join(PLUGIN_ROOT, "versions.json");
  const versionsContent = fs.readFileSync(versionsPath, "utf8");
  const versions = JSON.parse(versionsContent);
  SDK_VERSION = versions.sdkVersion || "latest";
} catch {}

// --- SDK install/upgrade ---
function installSdk(version) {
  try {
    execSync(\`npm i -g "@a5c-ai/babysitter-sdk@\${version}" --loglevel=error\`, {
      stdio: "ignore",
    });
    blog(\`Installed SDK globally (\${version})\`);
    return true;
  } catch {
    try {
      execSync(\`npm i -g "@a5c-ai/babysitter-sdk@\${version}" --prefix "\${os.homedir()}/.local" --loglevel=error\`, {
        stdio: "ignore",
      });
      process.env.PATH = \`\${os.homedir()}/.local/bin:\${process.env.PATH}\`;
      blog(\`Installed SDK to user prefix (\${version})\`);
      return true;
    } catch {
      return false;
    }
  }
}

let NEEDS_SDK_INSTALL = false;
try {
  const currentVersion = execSync("babysitter --version", { encoding: "utf8" }).trim();
  if (currentVersion !== SDK_VERSION) {
    NEEDS_SDK_INSTALL = true;
  }
} catch {
  NEEDS_SDK_INSTALL = true;
}

if (NEEDS_SDK_INSTALL && !fs.existsSync(SDK_MARKER_FILE)) {
  installSdk(SDK_VERSION);
  fs.writeFileSync(SDK_MARKER_FILE, SDK_VERSION);
}

// --- hooks-proxy install/upgrade ---
function installHooksProxy(version) {
  try {
    execSync(\`npm i -g "@a5c-ai/hooks-proxy-cli@\${version}" --loglevel=error\`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    try {
      execSync(\`npm i -g "@a5c-ai/hooks-proxy-cli@\${version}" --prefix "\${os.homedir()}/.local" --loglevel=error\`, {
        stdio: "ignore",
      });
      process.env.PATH = \`\${os.homedir()}/.local/bin:\${process.env.PATH}\`;
      return true;
    } catch {
      return false;
    }
  }
}

let NEEDS_PROXY_INSTALL = false;
try {
  const proxyVersion = execSync("a5c-hooks-proxy --version", { encoding: "utf8" }).trim();
  if (proxyVersion !== SDK_VERSION) {
    NEEDS_PROXY_INSTALL = true;
  }
} catch {
  NEEDS_PROXY_INSTALL = true;
}

if (NEEDS_PROXY_INSTALL && !fs.existsSync(PROXY_MARKER_FILE)) {
  installHooksProxy(SDK_VERSION);
  fs.writeFileSync(PROXY_MARKER_FILE, SDK_VERSION);
}

let PROXY = "";
try {
  execSync("command -v a5c-hooks-proxy", { stdio: "ignore" });
  PROXY = "a5c-hooks-proxy";
} catch {
  const localProxyPath = path.join(os.homedir(), ".local/bin/a5c-hooks-proxy");
  if (fs.existsSync(localProxyPath)) {
    PROXY = localProxyPath;
  } else {
    PROXY = \`npx -y @a5c-ai/hooks-proxy-cli@\${SDK_VERSION}\`;
  }
}

// --- Capture stdin and delegate ---
let stdinData = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinData += chunk;
});

process.stdin.on("end", () => {
  const inputFile = path.join(os.tmpdir(), \`hook-${hookType}-\${process.pid}.json\`);
  fs.writeFileSync(inputFile, stdinData);

  try {
    const result = execSync(
      \`\${PROXY} invoke --adapter ${adapterName} --handler "babysitter hook:run --harness unified --hook-type ${hookType} --plugin-root \${PLUGIN_ROOT} --json" --json < "\${inputFile}"\`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    );
    console.log(result);
    fs.unlinkSync(inputFile);
    process.exit(0);
  } catch (error) {
    fs.unlinkSync(inputFile);
    process.exit(error.status || 2);
  }
});
`;
}

export function generateTypeScriptHookStub(
  canonicalHook: string,
  nativeHook: string
): string {
  const hookTitle = getHookTitle(canonicalHook);

  return `// ${hookTitle} Hook for OpenClaw
// This is a TypeScript stub that should be implemented with actual hook logic.

export async function ${nativeHook.replace(/-/g, '_')}(context: unknown): Promise<void> {
  // TODO: Implement ${hookTitle} hook logic
  console.log('${hookTitle} hook triggered');
}
`;
}
