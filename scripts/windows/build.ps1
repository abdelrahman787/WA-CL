[CmdletBinding()] param()
. "$PSScriptRoot\_common.ps1"
$repo = Get-RepoRoot
Set-Location $repo

try {
    Write-Head 'Building OpenWA (backend + dashboard)'

    Write-Info 'Backend: npm run build'
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'backend build failed' }
    Write-Ok 'backend -> dist/'

    Write-Info 'Dashboard: clean previous build'
    $dashDist = Join-Path $repo 'dashboard\dist'
    if (Test-Path $dashDist) { Remove-Item -Recurse -Force $dashDist }

    Write-Info 'Dashboard: npm run build'
    Push-Location (Join-Path $repo 'dashboard')
    & npm run build
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'dashboard build failed' }
    Pop-Location
    Write-Ok 'dashboard -> dashboard/dist/'

    # Copy the dashboard build into dist/public so the API process serves
    # the UI on the same port (no second server / proxy / CORS needed).
    Write-Info 'Publishing dashboard into dist/public'
    $publicDir = Join-Path $repo 'dist\public'
    if (Test-Path $publicDir) { Remove-Item -Recurse -Force $publicDir }
    New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
    Copy-Item -Path (Join-Path $dashDist '*') -Destination $publicDir -Recurse -Force
    Write-Ok 'dashboard -> dist/public/'

    Write-Head 'Build complete'
    Write-Host '  Run start.ps1 - the API serves the dashboard on API_PORT.' -ForegroundColor Cyan
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
