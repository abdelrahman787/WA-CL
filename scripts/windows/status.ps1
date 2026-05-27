[CmdletBinding()] param()
. "$PSScriptRoot\_common.ps1"
$repo = Get-RepoRoot
Write-Head 'OpenWA status'

$tsIp = Get-TailscaleIP
if ($tsIp) { Write-Ok "Tailscale IP: $tsIp" } else { Write-Warn2 'Tailscale not detected' }

foreach ($svc in @('OpenWA-API', 'OpenWA-Dashboard')) {
    $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
    if ($s) {
        $color = if ($s.Status -eq 'Running') { 'Green' } else { 'Yellow' }
        Write-Host ("  {0,-22} {1}" -f $svc, $s.Status) -ForegroundColor $color
    } else {
        Write-Host ("  {0,-22} not installed" -f $svc) -ForegroundColor DarkGray
    }
}

$env = Read-DotEnv (Join-Path $repo '.env')
$apiPort       = $env['API_PORT']       ; if (-not $apiPort)       { $apiPort = '2785' }
$dashboardPort = $env['DASHBOARD_PORT'] ; if (-not $dashboardPort) { $dashboardPort = '2886' }

foreach ($port in @($apiPort, $dashboardPort)) {
    $listening = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($listening) {
        Write-Ok  "port $port listening"
    } else {
        Write-Warn2 "port $port not listening"
    }
}

if ($tsIp) {
    Write-Host ''
    Write-Host "  Dashboard: http://${tsIp}:$dashboardPort" -ForegroundColor Cyan
    Write-Host "  API:       http://${tsIp}:$apiPort"       -ForegroundColor Cyan
}
