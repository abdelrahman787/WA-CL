<#
.SYNOPSIS
  Install OpenWA-API as a Windows service using NSSM.

.DESCRIPTION
  NSSM is auto-downloaded from https://nssm.cc/release/nssm-2.24.zip
  into tools/nssm/ on first run, so no manual install required.
#>
[CmdletBinding()] param(
    [string]$ServiceName = 'OpenWA-API',
    [string]$NodePath    = $(if ($n = Get-Command node -ErrorAction SilentlyContinue) { $n.Source })
)
. "$PSScriptRoot\_common.ps1"
$repo = Get-RepoRoot

function Get-NssmPath {
    # Priority: PATH > bundled tools/nssm > nothing.
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $bundled = Join-Path $repo 'tools\nssm\nssm.exe'
    if (Test-Path $bundled) { return $bundled }
    return $null
}

function Install-Nssm {
    $bundled = Join-Path $repo 'tools\nssm\nssm.exe'
    if (Test-Path $bundled) { return $bundled }

    Write-Info 'Downloading NSSM 2.24 ...'
    $toolsDir = Join-Path $repo 'tools\nssm'
    $stage    = Join-Path $env:TEMP "nssm-$([guid]::NewGuid())"
    $zip      = Join-Path $stage 'nssm.zip'
    New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
    New-Item -ItemType Directory -Path $stage    -Force | Out-Null

    try {
        Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $stage -Force

        # The zip layout is nssm-2.24\win64\nssm.exe (and a win32 variant).
        $arch = if ([Environment]::Is64BitOperatingSystem) { 'win64' } else { 'win32' }
        $candidate = Get-ChildItem -Path $stage -Recurse -Filter 'nssm.exe' |
            Where-Object { $_.FullName -match "\\$arch\\" } |
            Select-Object -First 1
        if (-not $candidate) {
            $candidate = Get-ChildItem -Path $stage -Recurse -Filter 'nssm.exe' | Select-Object -First 1
        }
        if (-not $candidate) { throw 'nssm.exe not found inside downloaded archive' }
        Copy-Item -Path $candidate.FullName -Destination $bundled -Force
        Write-Ok "NSSM installed at $bundled"
        return $bundled
    } finally {
        Remove-Item -Path $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
}

try {
    $nssm = Get-NssmPath
    if (-not $nssm) { $nssm = Install-Nssm }
    if (-not $nssm) {
        Write-Warn2 'NSSM unavailable. Skipping service install — use start.ps1 for foreground mode.'
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
        & $nssm stop   $ServiceName | Out-Null
        & $nssm remove $ServiceName confirm | Out-Null
    }

    & $nssm install $ServiceName $NodePath $entry
    & $nssm set $ServiceName AppDirectory          $repo
    & $nssm set $ServiceName AppStdout             (Join-Path $repo 'logs\service-api.log')
    & $nssm set $ServiceName AppStderr             (Join-Path $repo 'logs\service-api.err.log')
    & $nssm set $ServiceName AppRotateFiles        1
    & $nssm set $ServiceName AppRotateOnline       1
    & $nssm set $ServiceName AppRotateBytes        10485760
    & $nssm set $ServiceName Start                 SERVICE_AUTO_START
    & $nssm set $ServiceName AppExit Default       Restart
    & $nssm set $ServiceName AppRestartDelay       3000
    & $nssm set $ServiceName AppThrottle           5000
    & $nssm set $ServiceName AppEnvironmentExtra   "NODE_ENV=production"

    Start-Service $ServiceName
    Write-Ok "service '$ServiceName' installed and started"
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
