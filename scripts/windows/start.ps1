[CmdletBinding()] param()
. "$PSScriptRoot\_common.ps1"
$repo = Get-RepoRoot

try {
    if (Get-Service -Name 'OpenWA-API' -ErrorAction SilentlyContinue) {
        Write-Info 'Starting OpenWA-API service...'
        Start-Service 'OpenWA-API'
        Write-Ok 'OpenWA-API started'
        if (Get-Service -Name 'OpenWA-Dashboard' -ErrorAction SilentlyContinue) {
            Start-Service 'OpenWA-Dashboard'
            Write-Ok 'OpenWA-Dashboard started'
        }
    } else {
        Write-Warn2 'Service not installed. Running foreground via `npm run start:prod`.'
        Set-Location $repo
        & npm run start:prod
    }
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
