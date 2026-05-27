[CmdletBinding()] param()
. "$PSScriptRoot\_common.ps1"
& "$PSScriptRoot\stop.ps1"
Start-Sleep -Seconds 1
& "$PSScriptRoot\start.ps1"
