<#
.SYNOPSIS
  Install OpenWA-API as a Windows service using NSSM.

.NOTES
  NSSM must be available on PATH. Download from https://nssm.cc/ and
  extract nssm.exe somewhere on PATH (e.g. C:\Windows\System32).
#>
[CmdletBinding()] param(
    [string]$ServiceName = 'OpenWA-API',
    [string]$NodePath    = $(if ($n = Get-Command node -ErrorAction SilentlyContinue) { $n.Source })
)
. "$PSScriptRoot\_common.ps1"
$repo = Get-RepoRoot

try {
    if (-not (Test-CommandExists 'nssm')) {
        Write-Warn2 'nssm not found on PATH. Download from https://nssm.cc/ and place nssm.exe on PATH.'
        Write-Warn2 'Skipping service install — run start.ps1 to launch in foreground for now.'
        return
    }
    if (-not $NodePath) { throw 'node executable not found' }

    $entry = Join-Path $repo 'dist\main.js'
    if (-not (Test-Path $entry)) {
        Write-Info 'dist/main.js missing — running build first.'
        & "$PSScriptRoot\build.ps1"
    }

    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Info "service '$ServiceName' exists; removing for clean reinstall..."
        & nssm stop   $ServiceName | Out-Null
        & nssm remove $ServiceName confirm | Out-Null
    }

    & nssm install $ServiceName $NodePath $entry
    & nssm set $ServiceName AppDirectory          $repo
    & nssm set $ServiceName AppStdout             (Join-Path $repo 'logs\service-api.log')
    & nssm set $ServiceName AppStderr             (Join-Path $repo 'logs\service-api.err.log')
    & nssm set $ServiceName AppRotateFiles        1
    & nssm set $ServiceName AppRotateOnline       1
    & nssm set $ServiceName AppRotateBytes        10485760
    & nssm set $ServiceName Start                 SERVICE_AUTO_START
    & nssm set $ServiceName AppExit Default       Restart
    & nssm set $ServiceName AppRestartDelay       3000
    & nssm set $ServiceName AppThrottle           5000
    & nssm set $ServiceName AppEnvironmentExtra   "NODE_ENV=production"

    Start-Service $ServiceName
    Write-Ok "service '$ServiceName' installed and started"
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
