<#
.SYNOPSIS
  Stop the Osprey Loyalty stack.

.DESCRIPTION
  Wraps `docker compose -f infra/docker-compose.yml down`.

.PARAMETER Volumes
  Also remove named volumes (wipes seeded Mongo data).

.EXAMPLE
  ./stop-docker-compose.ps1
.EXAMPLE
  ./stop-docker-compose.ps1 -Volumes
#>
[CmdletBinding()]
param(
    [switch]$Volumes
)

$ErrorActionPreference = 'Stop'

# Run from the repo root regardless of where the script is invoked from.
Set-Location -Path $PSScriptRoot

$composeFile = 'infra/docker-compose.yml'

if ($Volumes) {
    Write-Host "=== Stopping the stack (docker compose down --volumes) ===" -ForegroundColor Cyan
    docker compose -f $composeFile down --volumes
} else {
    Write-Host "=== Stopping the stack (docker compose down) ===" -ForegroundColor Cyan
    docker compose -f $composeFile down
}
if ($LASTEXITCODE -ne 0) { throw "docker compose down failed (exit $LASTEXITCODE)" }
Write-Host "Stopped."
