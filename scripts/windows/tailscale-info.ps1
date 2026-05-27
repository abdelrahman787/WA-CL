[CmdletBinding()] param()
. "$PSScriptRoot\_common.ps1"
$repo = Get-RepoRoot

$ip = Get-TailscaleIP
$env = Read-DotEnv (Join-Path $repo '.env')
$apiPort       = $env['API_PORT']       ; if (-not $apiPort)       { $apiPort = '2785' }
$dashboardPort = $env['DASHBOARD_PORT'] ; if (-not $dashboardPort) { $dashboardPort = '2886' }

$out = Join-Path $repo 'tailscale-info.txt'
$content = @"
OpenWA — Tailscale access
=========================
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

Tailscale IP:   $(if ($ip) { $ip } else { '<not detected — run `tailscale up`>' })
API port:       $apiPort
Dashboard port: $dashboardPort

URLs (open from any device on your tailnet):
  Dashboard:  http://$ip`:$dashboardPort
  API:        http://$ip`:$apiPort
  Swagger:    http://$ip`:$apiPort/api/docs
  Health:     http://$ip`:$apiPort/api/health
"@
Set-Content -Path $out -Value $content -Encoding UTF8
Write-Ok "wrote $out"
