# Unified Stop Hook for Cursor IDE/CLI (PowerShell)
# Routes through hooks-proxy for all hook execution.
#
# Drives the orchestration loop by checking run state on session stop.
#
# Protocol:
#   Input:  JSON via stdin (session context)
#   Output: JSON via stdout (with optional continue/stop signal)
#   Stderr: debug/log output only
#   Exit 0: success

$ErrorActionPreference = "Stop"

$PluginRoot = if ($env:CURSOR_PLUGIN_ROOT) { $env:CURSOR_PLUGIN_ROOT } else { Split-Path -Parent $PSScriptRoot }
$GlobalRoot = if ($env:BABYSITTER_GLOBAL_STATE_DIR) { $env:BABYSITTER_GLOBAL_STATE_DIR } else { Join-Path $HOME ".a5c" }
$StateDir = if ($env:BABYSITTER_STATE_DIR) { $env:BABYSITTER_STATE_DIR } else { Join-Path $GlobalRoot "state" }
$ProxyMarkerFile = Join-Path $PluginRoot ".hooks-proxy-install-attempted"

$env:CURSOR_PLUGIN_ROOT = $PluginRoot
$env:BABYSITTER_STATE_DIR = $StateDir

$LogDir = if ($env:BABYSITTER_LOG_DIR) { $env:BABYSITTER_LOG_DIR } else { Join-Path $GlobalRoot "logs" }
$LogFile = Join-Path $LogDir "babysitter-stop-hook.log"
New-Item -ItemType Directory -Path $LogDir -Force -ErrorAction SilentlyContinue | Out-Null

function Write-Blog {
    param([string]$Message)
    $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    Add-Content -Path $LogFile -Value "[INFO] $ts $Message" -ErrorAction SilentlyContinue
    if (Get-Command babysitter -ErrorAction SilentlyContinue) {
        & babysitter log --type hook --label "hook:stop" --message $Message --source shell-hook 2>$null
    }
}

Write-Blog "Unified hook script invoked"
Write-Blog "PLUGIN_ROOT=$PluginRoot"
Write-Blog "STATE_DIR=$StateDir"

# Get required version from versions.json (used for hooks-proxy)
$versionsFile = Join-Path $PluginRoot "versions.json"
try {
    $SdkVersion = (Get-Content $versionsFile -Raw | ConvertFrom-Json).sdkVersion
    if (-not $SdkVersion) { $SdkVersion = "latest" }
} catch {
    $SdkVersion = "latest"
}

# ---------------------------------------------------------------------------
# Hooks-proxy install (same pattern as SDK install in session-start)
# ---------------------------------------------------------------------------

function Install-HooksProxy {
    param([string]$TargetVersion)
    try {
        & npm i -g "@a5c-ai/hooks-proxy-cli@$TargetVersion" --loglevel=error 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Blog "Installed hooks-proxy globally ($TargetVersion)"
            return $true
        }
    } catch {}
    try {
        $prefix = Join-Path $env:USERPROFILE ".local"
        & npm i -g "@a5c-ai/hooks-proxy-cli@$TargetVersion" --prefix $prefix --loglevel=error 2>$null
        if ($LASTEXITCODE -eq 0) {
            $env:PATH = "$prefix\bin;$env:PATH"
            Write-Blog "Installed hooks-proxy to user prefix ($TargetVersion)"
            return $true
        }
    } catch {}
    return $false
}

# Resolve hooks-proxy binary
$Proxy = $null
if (Get-Command a5c-hooks-proxy -ErrorAction SilentlyContinue) {
    $Proxy = "a5c-hooks-proxy"
} else {
    $localProxy = Join-Path $env:USERPROFILE ".local\bin\a5c-hooks-proxy.exe"
    if (Test-Path $localProxy) {
        $Proxy = $localProxy
    }
}

# Install if not found (only attempt once per plugin version)
if (-not $Proxy -and -not (Test-Path $ProxyMarkerFile)) {
    Write-Blog "hooks-proxy not found, attempting install"
    Install-HooksProxy $SdkVersion | Out-Null
    Set-Content -Path $ProxyMarkerFile -Value $SdkVersion -ErrorAction SilentlyContinue
    # Re-resolve after install
    if (Get-Command a5c-hooks-proxy -ErrorAction SilentlyContinue) {
        $Proxy = "a5c-hooks-proxy"
    } else {
        $localProxy = Join-Path $env:USERPROFILE ".local\bin\a5c-hooks-proxy.exe"
        if (Test-Path $localProxy) {
            $Proxy = $localProxy
        }
    }
}

# ---------------------------------------------------------------------------
# Capture stdin and delegate to hooks-proxy
# ---------------------------------------------------------------------------

$InputFile = [System.IO.Path]::GetTempFileName()
$input | Out-File -FilePath $InputFile -Encoding utf8

Write-Blog "Hook input received"

$stderrLog = Join-Path $LogDir "babysitter-stop-hook-stderr.log"

if ($Proxy) {
    Write-Blog "Using hooks-proxy: $Proxy"
    $Result = Get-Content $InputFile | & $Proxy invoke --adapter cursor --handler "babysitter hook:run --harness unified --hook-type stop --plugin-root $PluginRoot --state-dir $StateDir --json" --json 2>$stderrLog
    $ExitCode = $LASTEXITCODE
} else {
    Write-Blog "hooks-proxy not found after install, using npx fallback"
    $Result = Get-Content $InputFile | & npx -y "@a5c-ai/hooks-proxy-cli@$SdkVersion" invoke --adapter cursor --handler "babysitter hook:run --harness unified --hook-type stop --plugin-root $PluginRoot --state-dir $StateDir --json" --json 2>$stderrLog
    $ExitCode = $LASTEXITCODE
}

Write-Blog "CLI exit code=$ExitCode"

Remove-Item $InputFile -Force -ErrorAction SilentlyContinue
Write-Output $Result
exit $ExitCode
