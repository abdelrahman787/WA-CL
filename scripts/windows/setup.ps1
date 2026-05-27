<#
.SYNOPSIS
  Master setup script for OpenWA on Windows Server with Tailscale.

.DESCRIPTION
  - Verifies Node.js 22 LTS + Git + Tailscale
  - Installs npm dependencies for backend + dashboard
  - Creates data/ logs/ media/ sessions/ directories
  - Generates a secure .env (idempotent — preserves existing keys)
  - Configures Windows Firewall rules scoped to the Tailscale adapter
  - Optionally installs the Windows service via NSSM
  - Writes tailscale-info.txt with discoverable URLs

.NOTES
  Run from an elevated PowerShell.
#>
[CmdletBinding()]
param(
    [switch]$SkipServiceInstall,
    [switch]$SkipFirewall,
    [switch]$Force
)

. "$PSScriptRoot\_common.ps1"
$repo = Get-RepoRoot
Set-Location $repo

Write-Head 'OpenWA — Windows / Tailscale setup'

# ---------------------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------------------
try {
    if (-not (Test-CommandExists 'node')) {
        Write-Err 'Node.js not found. Install Node.js 22 LTS from https://nodejs.org/'
        exit 1
    }
    $nodeVer = (& node -v).TrimStart('v')
    $major = [int]($nodeVer.Split('.')[0])
    if ($major -lt 22) {
        Write-Warn2 "Node.js v$nodeVer detected. v22 LTS is recommended."
    } else {
        Write-Ok "Node.js v$nodeVer"
    }

    if (-not (Test-CommandExists 'git')) {
        Write-Warn2 'Git not found. update.ps1 will not work without it.'
    } else {
        Write-Ok "Git $(& git --version)"
    }

    $tsIp = Get-TailscaleIP
    if (-not $tsIp) {
        Write-Warn2 'Tailscale IP could not be detected. Install Tailscale and run `tailscale up` before continuing.'
    } else {
        Write-Ok "Tailscale IP: $tsIp"
    }

    # -----------------------------------------------------------------------
    # 2. Directories
    # -----------------------------------------------------------------------
    foreach ($d in @('data', 'data\sessions', 'data\media', 'data\imports', 'logs')) {
        $p = Join-Path $repo $d
        if (-not (Test-Path $p)) {
            New-Item -ItemType Directory -Path $p -Force | Out-Null
            Write-Ok "created $d\"
        }
    }

    # -----------------------------------------------------------------------
    # 3. .env (idempotent)
    # -----------------------------------------------------------------------
    $envPath = Join-Path $repo '.env'
    $env = Read-DotEnv $envPath
    function Set-IfMissing($key, $value) {
        if (-not $env.ContainsKey($key) -or $Force) { $script:env[$key] = $value }
    }
    Set-IfMissing 'NODE_ENV'        'production'
    Set-IfMissing 'API_PORT'        '2785'
    Set-IfMissing 'DASHBOARD_PORT'  '2886'
    Set-IfMissing 'API_HOST'        '0.0.0.0'
    Set-IfMissing 'API_KEY'         (New-RandomHex 16)
    Set-IfMissing 'JWT_SECRET'      (New-RandomHex 32)
    Set-IfMissing 'WEBHOOK_SECRET'  (New-RandomHex 16)
    Set-IfMissing 'SESSION_SECRET'  (New-RandomHex 16)
    Set-IfMissing 'DATABASE_TYPE'   'sqlite'
    Set-IfMissing 'STORAGE_TYPE'    'local'
    Set-IfMissing 'STORAGE_PATH'    './data/media'
    Set-IfMissing 'SESSIONS_PATH'   './data/sessions'
    Set-IfMissing 'LOG_LEVEL'       'info'
    Set-IfMissing 'LOG_PATH'        './logs'
    if ($tsIp) {
        $env['TAILSCALE_IP'] = $tsIp
        $env['CORS_ORIGINS'] = "http://${tsIp}:2886,http://localhost:2886"
    }

    $lines = $env.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Key)=$($_.Value)" }
    Set-Content -Path $envPath -Value $lines -Encoding UTF8
    Write-Ok ".env written ($($env.Count) keys)"

    # -----------------------------------------------------------------------
    # 4. Dependencies
    # -----------------------------------------------------------------------
    Write-Info 'Installing backend dependencies (npm ci)...'
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

    Write-Info 'Installing dashboard dependencies...'
    Push-Location (Join-Path $repo 'dashboard')
    & npm ci
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'dashboard npm ci failed' }
    Pop-Location
    Write-Ok 'dependencies installed'

    # -----------------------------------------------------------------------
    # 5. Firewall
    # -----------------------------------------------------------------------
    if (-not $SkipFirewall) {
        Write-Info 'Configuring Windows Firewall rules (Tailscale-only)...'
        & "$PSScriptRoot\firewall-setup.ps1"
    }

    # -----------------------------------------------------------------------
    # 6. Tailscale info file
    # -----------------------------------------------------------------------
    & "$PSScriptRoot\tailscale-info.ps1" | Out-Null

    # -----------------------------------------------------------------------
    # 7. Service install (optional)
    # -----------------------------------------------------------------------
    if (-not $SkipServiceInstall) {
        Write-Info 'Installing Windows services via NSSM...'
        & "$PSScriptRoot\install-service.ps1"
    }

    Write-Head 'Setup complete'
    if ($tsIp) {
        Write-Host "  API:        http://${tsIp}:2785"        -ForegroundColor Green
        Write-Host "  Dashboard:  http://${tsIp}:2886"        -ForegroundColor Green
        Write-Host "  Swagger:    http://${tsIp}:2785/api/docs" -ForegroundColor Green
    }
    Write-Host "  API key:    $($env['API_KEY'])" -ForegroundColor Yellow
    Write-Host '  Next: scripts\windows\start.ps1' -ForegroundColor Cyan
}
catch {
    Write-Err $_.Exception.Message
    exit 1
}
