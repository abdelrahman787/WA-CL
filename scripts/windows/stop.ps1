[CmdletBinding()] param()
. "$PSScriptRoot\_common.ps1"

try {
    foreach ($svc in @('OpenWA-Dashboard', 'OpenWA-API')) {
        $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
        if ($s) {
            if ($s.Status -ne 'Stopped') {
                Write-Info "Stopping $svc..."
                Stop-Service $svc -Force
            }
            Write-Ok "$svc stopped"
        }
    }
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
