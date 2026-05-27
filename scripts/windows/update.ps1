[CmdletBinding()] param([string]$Branch = 'main')
. "$PSScriptRoot\_common.ps1"
$repo = Get-RepoRoot
Set-Location $repo

try {
    Write-Head "Updating OpenWA (branch: $Branch)"
    & "$PSScriptRoot\stop.ps1"

    & git fetch --all --prune
    if ($LASTEXITCODE -ne 0) { throw 'git fetch failed' }
    & git checkout $Branch
    & git pull --ff-only origin $Branch
    if ($LASTEXITCODE -ne 0) { throw 'git pull failed' }

    & npm ci
    Push-Location (Join-Path $repo 'dashboard'); & npm ci; Pop-Location

    & "$PSScriptRoot\build.ps1"
    & "$PSScriptRoot\start.ps1"

    Write-Head 'Update complete'
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
