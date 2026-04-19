# Unified Stop Hook for Cursor IDE/CLI (PowerShell)
# Mirrors stop-hook.ps1 but routes through hooks-proxy when available,
# falling back to direct SDK.
# NOT YET ACTIVE — parallel to existing hook scripts
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

# Resolve babysitter CLI
$useFallback = $false
if (-not (Get-Command babysitter -ErrorAction SilentlyContinue)) {
    $localBin = Join-Path $env:USERPROFILE ".local\bin\babysitter.cmd"
    if (Test-Path $localBin) {
        $env:PATH = "$(Split-Path $localBin);$env:PATH"
    } else {
        $versionsFile = Join-Path $PluginRoot "versions.json"
        try {
            $script:SdkVersion = (Get-Content $versionsFile -Raw | ConvertFrom-Json).sdkVersion
            if (-not $script:SdkVersion) { $script:SdkVersion = "latest" }
        } catch {
            $script:SdkVersion = "latest"
        }
        $useFallback = $true
    }
}

# Capture stdin
$InputFile = [System.IO.Path]::GetTempFileName()
$input | Out-File -FilePath $InputFile -Encoding utf8

Write-Blog "Hook input received"

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

$stderrLog = Join-Path $LogDir "babysitter-stop-hook-stderr.log"

if ($Proxy) {
    Write-Blog "Using hooks-proxy: $Proxy"
    try {
        # Route through hooks-proxy with cursor adapter
        $Result = Get-Content $InputFile | & $Proxy invoke --adapter cursor --handler "babysitter hook:run --harness unified --hook-type stop --plugin-root $PluginRoot --state-dir $StateDir --json" --json 2>$stderrLog
        $ExitCode = $LASTEXITCODE
    } catch {
        Write-Blog "hooks-proxy failed, falling back to direct SDK"
        if ($useFallback) {
            $Result = Get-Content $InputFile | & npx -y "@a5c-ai/babysitter-sdk@$script:SdkVersion" hook:run --hook-type stop --harness cursor --plugin-root $PluginRoot --state-dir $StateDir --json 2>$stderrLog
        } else {
            $Result = Get-Content $InputFile | & babysitter hook:run --hook-type stop --harness cursor --plugin-root $PluginRoot --state-dir $StateDir --json 2>$stderrLog
        }
        $ExitCode = $LASTEXITCODE
    }
} else {
    Write-Blog "No hooks-proxy available, using SDK directly"
    if ($useFallback) {
        $Result = Get-Content $InputFile | & npx -y "@a5c-ai/babysitter-sdk@$script:SdkVersion" hook:run --hook-type stop --harness cursor --plugin-root $PluginRoot --state-dir $StateDir --json 2>$stderrLog
    } else {
        $Result = Get-Content $InputFile | & babysitter hook:run --hook-type stop --harness cursor --plugin-root $PluginRoot --state-dir $StateDir --json 2>$stderrLog
    }
    $ExitCode = $LASTEXITCODE
}

Write-Blog "CLI exit code=$ExitCode"

Remove-Item $InputFile -Force -ErrorAction SilentlyContinue
Write-Output $Result
exit $ExitCode
