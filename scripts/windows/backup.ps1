[CmdletBinding()] param(
    [string]$Destination = (Join-Path (Get-Location) 'backups')
)
. "$PSScriptRoot\_common.ps1"
$repo = Get-RepoRoot

try {
    if (-not (Test-Path $Destination)) { New-Item -ItemType Directory -Path $Destination -Force | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $zip = Join-Path $Destination "openwa-backup-$stamp.zip"

    Write-Info "Backing up to $zip"
    $items = @()
    foreach ($d in @('data', 'logs', '.env', '.env.generated')) {
        $p = Join-Path $repo $d
        if (Test-Path $p) { $items += $p }
    }
    if ($items.Count -eq 0) { Write-Warn2 'nothing to back up'; return }
    Compress-Archive -Path $items -DestinationPath $zip -Force
    Write-Ok "backup created: $zip ($([Math]::Round((Get-Item $zip).Length / 1MB, 1)) MB)"
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
