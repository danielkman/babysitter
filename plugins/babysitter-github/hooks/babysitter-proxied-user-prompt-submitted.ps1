# Unified userPromptSubmitted Hook for GitHub Copilot CLI (PowerShell)
# Routes through hooks-proxy for all hook execution.
#
# Applies density-filter compression to long user prompts.
#
# NOTE: Output from this hook is IGNORED by Copilot CLI.
# This hook is for logging and side-effects only.

$ErrorActionPreference = "Continue"

$PluginRoot = if ($env:COPILOT_PLUGIN_DIR) { $env:COPILOT_PLUGIN_DIR } else { Split-Path -Parent $PSScriptRoot }
$ProxyMarkerFile = Join-Path $PluginRoot ".hooks-proxy-install-attempted"

$GlobalRoot = if ($env:BABYSITTER_GLOBAL_STATE_DIR) { $env:BABYSITTER_GLOBAL_STATE_DIR } else { Join-Path $HOME ".a5c" }
$LogDir = if ($env:BABYSITTER_LOG_DIR) { $env:BABYSITTER_LOG_DIR } else { Join-Path $GlobalRoot "logs" }
New-Item -ItemType Directory -Path $LogDir -Force -ErrorAction SilentlyContinue | Out-Null

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
        if ($LASTEXITCODE -eq 0) { return $true }
    } catch {}
    try {
        $prefix = Join-Path $env:USERPROFILE ".local"
        & npm i -g "@a5c-ai/hooks-proxy-cli@$TargetVersion" --prefix $prefix --loglevel=error 2>$null
        if ($LASTEXITCODE -eq 0) {
            $env:PATH = "$prefix\bin;$env:PATH"
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

$stderrLog = Join-Path $LogDir "babysitter-user-prompt-submitted-hook-stderr.log"

try {
    if ($Proxy) {
        Get-Content $InputFile | & $Proxy invoke --adapter copilot --handler "babysitter hook:run --harness unified --hook-type user-prompt-submitted --json" --json 2>$stderrLog | Out-Null
    } else {
        Get-Content $InputFile | & npx -y "@a5c-ai/hooks-proxy-cli@$SdkVersion" invoke --adapter copilot --handler "babysitter hook:run --harness unified --hook-type user-prompt-submitted --json" --json 2>$stderrLog | Out-Null
    }
} catch {}

Remove-Item $InputFile -Force -ErrorAction SilentlyContinue

exit 0
