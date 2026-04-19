# Unified Session Start Hook for Cursor IDE/CLI (PowerShell)
# Routes through hooks-proxy for all hook execution.
#
# Ensures the babysitter SDK CLI and hooks-proxy are installed (from versions.json
# sdkVersion), then delegates to the SDK hook handler via hooks-proxy.
#
# Protocol:
#   Input:  JSON via stdin (contains session_id, cwd, etc.)
#   Output: JSON via stdout ({} on success)
#   Stderr: debug/log output only
#   Exit 0: success
#   Exit 2: block (fatal error)

$ErrorActionPreference = "Stop"

$PluginRoot = if ($env:CURSOR_PLUGIN_ROOT) { $env:CURSOR_PLUGIN_ROOT } else { Split-Path -Parent $PSScriptRoot }
$GlobalRoot = if ($env:BABYSITTER_GLOBAL_STATE_DIR) { $env:BABYSITTER_GLOBAL_STATE_DIR } else { Join-Path $HOME ".a5c" }
$StateDir = if ($env:BABYSITTER_STATE_DIR) { $env:BABYSITTER_STATE_DIR } else { Join-Path $GlobalRoot "state" }
$SdkMarkerFile = Join-Path $PluginRoot ".babysitter-install-attempted"
$ProxyMarkerFile = Join-Path $PluginRoot ".hooks-proxy-install-attempted"

$env:CURSOR_PLUGIN_ROOT = $PluginRoot
$env:BABYSITTER_STATE_DIR = $StateDir

$LogDir = if ($env:BABYSITTER_LOG_DIR) { $env:BABYSITTER_LOG_DIR } else { Join-Path $GlobalRoot "logs" }
$LogFile = Join-Path $LogDir "babysitter-session-start-hook.log"
New-Item -ItemType Directory -Path $LogDir -Force -ErrorAction SilentlyContinue | Out-Null

function Write-Blog {
    param([string]$Message)
    $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    Add-Content -Path $LogFile -Value "[INFO] $ts $Message" -ErrorAction SilentlyContinue
    if (Get-Command babysitter -ErrorAction SilentlyContinue) {
        & babysitter log --type hook --label "hook:session-start" --message $Message --source shell-hook 2>$null
    }
}

Write-Blog "Unified hook script invoked"
Write-Blog "PLUGIN_ROOT=$PluginRoot"
Write-Blog "STATE_DIR=$StateDir"

# Get required SDK version from versions.json (used for both SDK and hooks-proxy)
$versionsFile = Join-Path $PluginRoot "versions.json"
try {
    $SdkVersion = (Get-Content $versionsFile -Raw | ConvertFrom-Json).sdkVersion
    if (-not $SdkVersion) { $SdkVersion = "latest" }
} catch {
    $SdkVersion = "latest"
}

# ---------------------------------------------------------------------------
# SDK install/upgrade
# ---------------------------------------------------------------------------

function Install-Sdk {
    param([string]$TargetVersion)
    try {
        & npm i -g "@a5c-ai/babysitter-sdk@$TargetVersion" --loglevel=error 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Blog "Installed SDK globally ($TargetVersion)"
            return $true
        }
    } catch {}
    try {
        $prefix = Join-Path $env:USERPROFILE ".local"
        & npm i -g "@a5c-ai/babysitter-sdk@$TargetVersion" --prefix $prefix --loglevel=error 2>$null
        if ($LASTEXITCODE -eq 0) {
            $env:PATH = "$prefix\bin;$env:PATH"
            Write-Blog "Installed SDK to user prefix ($TargetVersion)"
            return $true
        }
    } catch {}
    return $false
}

$NeedsSdkInstall = $false
if (Get-Command babysitter -ErrorAction SilentlyContinue) {
    $CurrentVersion = & babysitter --version 2>$null
    if ($CurrentVersion -ne $SdkVersion) {
        Write-Blog "SDK version mismatch: installed=$CurrentVersion, required=$SdkVersion"
        $NeedsSdkInstall = $true
    } else {
        Write-Blog "SDK version OK: $CurrentVersion"
    }
} else {
    Write-Blog "SDK CLI not found, will install"
    $NeedsSdkInstall = $true
}

if ($NeedsSdkInstall -and -not (Test-Path $SdkMarkerFile)) {
    Install-Sdk $SdkVersion | Out-Null
    Set-Content -Path $SdkMarkerFile -Value $SdkVersion -ErrorAction SilentlyContinue
}

$useSdkFallback = $false
if (-not (Get-Command babysitter -ErrorAction SilentlyContinue)) {
    Write-Blog "CLI not found after install, using npx fallback"
    $useSdkFallback = $true
}

# ---------------------------------------------------------------------------
# Hooks-proxy install/upgrade (same pattern as SDK)
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

$NeedsProxyInstall = $false
$Proxy = $null
if (Get-Command a5c-hooks-proxy -ErrorAction SilentlyContinue) {
    $ProxyVersion = & a5c-hooks-proxy --version 2>$null
    if ($ProxyVersion -ne $SdkVersion) {
        Write-Blog "hooks-proxy version mismatch: installed=$ProxyVersion, required=$SdkVersion"
        $NeedsProxyInstall = $true
    } else {
        Write-Blog "hooks-proxy version OK: $ProxyVersion"
        $Proxy = "a5c-hooks-proxy"
    }
} else {
    $localProxy = Join-Path $env:USERPROFILE ".local\bin\a5c-hooks-proxy.exe"
    if (Test-Path $localProxy) {
        $ProxyVersion = & $localProxy --version 2>$null
        if ($ProxyVersion -ne $SdkVersion) {
            Write-Blog "hooks-proxy version mismatch: installed=$ProxyVersion, required=$SdkVersion"
            $NeedsProxyInstall = $true
        } else {
            Write-Blog "hooks-proxy version OK: $ProxyVersion"
            $Proxy = $localProxy
        }
    } else {
        Write-Blog "hooks-proxy not found, will install"
        $NeedsProxyInstall = $true
    }
}

if ($NeedsProxyInstall -and -not (Test-Path $ProxyMarkerFile)) {
    Install-HooksProxy $SdkVersion | Out-Null
    Set-Content -Path $ProxyMarkerFile -Value $SdkVersion -ErrorAction SilentlyContinue
}

# Re-resolve after potential install
if (-not $Proxy) {
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

$stderrLog = Join-Path $LogDir "babysitter-session-start-hook-stderr.log"

if ($Proxy) {
    Write-Blog "Using hooks-proxy: $Proxy"
    $Result = Get-Content $InputFile | & $Proxy invoke --adapter cursor --handler "babysitter hook:run --harness unified --hook-type session-start --plugin-root $PluginRoot --state-dir $StateDir --json" --json 2>$stderrLog
    $ExitCode = $LASTEXITCODE
} else {
    Write-Blog "hooks-proxy not found after install, using npx fallback"
    $Result = Get-Content $InputFile | & npx -y "@a5c-ai/hooks-proxy-cli@$SdkVersion" invoke --adapter cursor --handler "babysitter hook:run --harness unified --hook-type session-start --plugin-root $PluginRoot --state-dir $StateDir --json" --json 2>$stderrLog
    $ExitCode = $LASTEXITCODE
}

Write-Blog "CLI exit code=$ExitCode"

Remove-Item $InputFile -Force -ErrorAction SilentlyContinue
Write-Output $Result
exit $ExitCode
