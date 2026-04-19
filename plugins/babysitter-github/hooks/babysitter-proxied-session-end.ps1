# Unified Session End Hook for GitHub Copilot CLI (PowerShell)
# Routes through hooks-proxy for all hook execution.
#
# Cleanup and logging on session exit.
#
# NOTE: Unlike Claude Code's Stop hook, sessionEnd output is IGNORED by
# Copilot CLI. This hook cannot block session exit or drive an orchestration
# loop. It is purely for cleanup and logging.

$ErrorActionPreference = "Continue"

$PluginRoot = if ($env:COPILOT_PLUGIN_DIR) { $env:COPILOT_PLUGIN_DIR } else { Split-Path -Parent $PSScriptRoot }
$ProxyMarkerFile = Join-Path $PluginRoot ".hooks-proxy-install-attempted"

$GlobalRoot = if ($env:BABYSITTER_GLOBAL_STATE_DIR) { $env:BABYSITTER_GLOBAL_STATE_DIR } else { Join-Path $HOME ".a5c" }
$LogDir = if ($env:BABYSITTER_LOG_DIR) { $env:BABYSITTER_LOG_DIR } else { Join-Path $GlobalRoot "logs" }
$LogFile = Join-Path $LogDir "babysitter-session-end-hook.log"
New-Item -ItemType Directory -Path $LogDir -Force -ErrorAction SilentlyContinue | Out-Null

function Write-Blog {
    param([string]$Message)
    $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    Add-Content -Path $LogFile -Value "[INFO] $ts $Message" -ErrorAction SilentlyContinue
}

Write-Blog "Unified hook script invoked"
Write-Blog "PLUGIN_ROOT=$PluginRoot"

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

$stderrLog = Join-Path $LogDir "babysitter-session-end-hook-stderr.log"

try {
    if ($Proxy) {
        Write-Blog "Using hooks-proxy: $Proxy"
        Get-Content $InputFile | & $Proxy invoke --adapter copilot --handler "babysitter hook:run --harness unified --hook-type session-end --json" --json 2>$stderrLog | Out-Null
    } else {
        Write-Blog "hooks-proxy not found after install, using npx fallback"
        Get-Content $InputFile | & npx -y "@a5c-ai/hooks-proxy-cli@$SdkVersion" invoke --adapter copilot --handler "babysitter hook:run --harness unified --hook-type session-end --json" --json 2>$stderrLog | Out-Null
    }
} catch {
    Write-Blog "Hook error: $_"
}

Write-Blog "Session end hook complete"

Remove-Item $InputFile -Force -ErrorAction SilentlyContinue

exit 0
