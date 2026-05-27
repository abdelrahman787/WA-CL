# Common helpers sourced by other scripts in this folder.
# Dot-source from siblings:  . "$PSScriptRoot\_common.ps1"

$ErrorActionPreference = 'Stop'

function Write-Info  ($msg) { Write-Host "[i] $msg" -ForegroundColor Cyan }
function Write-Ok    ($msg) { Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn2 ($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err   ($msg) { Write-Host "[x] $msg" -ForegroundColor Red }
function Write-Head  ($msg) {
    Write-Host ''
    Write-Host ('=' * 64) -ForegroundColor DarkCyan
    Write-Host " $msg" -ForegroundColor White
    Write-Host ('=' * 64) -ForegroundColor DarkCyan
}

function Get-RepoRoot {
    # scripts/windows/_common.ps1  ->  repo root is two levels up
    return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Test-CommandExists ($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-TailscaleIP {
    if (-not (Test-CommandExists 'tailscale')) { return $null }
    try {
        $ip = (& tailscale ip -4 2>$null | Select-Object -First 1).Trim()
        if ($ip -match '^\d+\.\d+\.\d+\.\d+$') { return $ip }
    } catch { }
    return $null
}

function New-RandomHex ([int]$bytes = 16) {
    $b = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}

function Read-DotEnv ([string]$path) {
    $map = @{}
    if (-not (Test-Path $path)) { return $map }
    Get-Content $path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { return }
        $k = $line.Substring(0, $idx).Trim()
        $v = $line.Substring($idx + 1).Trim()
        $map[$k] = $v
    }
    return $map
}
