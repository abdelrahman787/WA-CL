[CmdletBinding()] param()
. "$PSScriptRoot\_common.ps1"
$repo = Get-RepoRoot
Set-Location $repo

try {
    Write-Head 'Building OpenWA (backend + dashboard)'

    Write-Info 'Backend: npm run build'
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'backend build failed' }
    Write-Ok 'backend → dist/'

    Write-Info 'Dashboard: npm run build'
    Push-Location (Join-Path $repo 'dashboard')
    & npm run build
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'dashboard build failed' }
    Pop-Location
    Write-Ok 'dashboard → dashboard/dist/'

    Write-Head 'Build complete'
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
