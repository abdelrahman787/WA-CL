<#
.SYNOPSIS
  Configure Windows Firewall to expose API + Dashboard ports ONLY on the
  Tailscale virtual adapter. Public interfaces remain blocked.
#>
[CmdletBinding()] param(
    [int]$ApiPort       = 2785,
    [int]$DashboardPort = 2886,
    [string]$AdapterAlias = 'Tailscale'
)
. "$PSScriptRoot\_common.ps1"

try {
    $adapter = Get-NetAdapter -Name $AdapterAlias -ErrorAction SilentlyContinue
    if (-not $adapter) {
        Write-Warn2 "adapter '$AdapterAlias' not found. Allowing on all interfaces — review after Tailscale is installed."
        $AdapterAlias = $null
    }

    $rules = @(
        @{ Name = 'OpenWA API (Tailscale)';       Port = $ApiPort;       Action = 'Allow' },
        @{ Name = 'OpenWA Dashboard (Tailscale)'; Port = $DashboardPort; Action = 'Allow' }
    )
    foreach ($r in $rules) {
        $existing = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
        if ($existing) { Remove-NetFirewallRule -DisplayName $r.Name }
        $params = @{
            DisplayName = $r.Name
            Direction   = 'Inbound'
            Protocol    = 'TCP'
            LocalPort   = $r.Port
            Action      = $r.Action
        }
        if ($AdapterAlias) { $params.InterfaceAlias = $AdapterAlias }
        New-NetFirewallRule @params | Out-Null
        Write-Ok "rule '$($r.Name)' on port $($r.Port)"
    }
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
