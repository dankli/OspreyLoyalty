<#
.SYNOPSIS
  Build and run the whole Osprey Loyalty stack, then print the useful URLs.

.DESCRIPTION
  Wraps `docker compose -f infra/docker-compose.yml up`, waits until the gateway and
  the three frontend hosts answer, then prints clickable URLs.

  Stop the stack with:  ./stop-docker-compose.ps1  (or: docker compose -f infra/docker-compose.yml down)
  Refuses to start while the local Kubernetes stack exists; tear that down with ./run-local-k8s.ps1 -Delete first.

.PARAMETER NoBuild
  Start without rebuilding images.

.PARAMETER Open
  Open the shell in a browser after printing URLs.

.PARAMETER NoOpen
  Deprecated no-op retained for compatibility. Browsers are not opened by default.

.EXAMPLE
  ./run-docker-compose.ps1
.EXAMPLE
  ./run-docker-compose.ps1 -NoBuild
#>
[CmdletBinding()]
param(
    [switch]$NoBuild,
    [switch]$Open,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

# Run from the repo root regardless of where the script is invoked from.
Set-Location -Path $PSScriptRoot

$composeFile = 'infra/docker-compose.yml'
$k8sContext = 'docker-desktop'
$k8sNamespace = 'osprey'

# Open the shell only — it hosts both portals via module federation, so one tab
# covers member + admin. (5173/5174 still run in compose as the shell's remotes.)
$frontends = [ordered]@{
    'Shell (hosts both portals)' = 'http://localhost:5170'
}

# Wait-For <name> <url> — poll until the URL answers, max 90 x 2s (3 min).
function Wait-For {
    param([string]$Name, [string]$Url)
    for ($attempt = 1; $attempt -le 90; $attempt++) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
            Write-Host "  OK  $Name ready ($Url)" -ForegroundColor Green
            return
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    throw "$Name did not become ready at $Url"
}

function Write-Link {
    param([string]$Name, [string]$Url)
    Write-Host ("  {0,-18} " -f $Name) -NoNewline -ForegroundColor DarkCyan
    Write-Host $Url -ForegroundColor Cyan
}

function Show-AccessLinks {
    Write-Host "=== Access URLs ===" -ForegroundColor Cyan
    Write-Link 'Shell' 'http://localhost:5170'
    Write-Link 'Member portal' 'http://localhost:5173'
    Write-Link 'Admin portal' 'http://localhost:5174'
    Write-Link 'Gateway GraphQL' 'http://localhost:4000/graphql'
    Write-Link 'Members API' 'http://localhost:5080'
    Write-Link 'Partners API' 'http://localhost:8081'
    Write-Link 'Points engine' 'http://localhost:8082'
    Write-Link 'Grafana' 'http://localhost:3000  (admin/admin)'
    Write-Link 'Prometheus' 'http://localhost:9090'
    Write-Link 'Jaeger' 'http://localhost:16686'
}

function Test-KubernetesStackPresent {
    if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) { return $false }
    kubectl --context $k8sContext --request-timeout=3s get namespace $k8sNamespace *> $null
    return $LASTEXITCODE -eq 0
}

Write-Host "=== Conflict check ===" -ForegroundColor Cyan
if (Test-KubernetesStackPresent) {
    throw "Kubernetes stack '$k8sNamespace' exists on context '$k8sContext'. Run ./run-local-k8s.ps1 -Delete before starting Docker Compose."
}
Write-Host "  OK  No Kubernetes stack found" -ForegroundColor Green
Write-Host ""

if ($NoBuild) {
    Write-Host "=== Starting the stack (docker compose up -d) ===" -ForegroundColor Cyan
    docker compose -f $composeFile up -d
} else {
    Write-Host "=== Building and starting the stack (docker compose up --build -d) ===" -ForegroundColor Cyan
    docker compose -f $composeFile up --build -d
}
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "=== Waiting for services to come up ===" -ForegroundColor Cyan
# Gateway backs the portals; wait for it plus each static frontend host.
Wait-For 'gateway'       'http://localhost:4000/health'
Wait-For 'shell'         'http://localhost:5170'
Wait-For 'member portal' 'http://localhost:5173'
Wait-For 'admin portal'  'http://localhost:5174'

Write-Host ""
Show-AccessLinks

Write-Host ""
if ($Open -and -not $NoOpen) {
    Write-Host "=== Opening browser (-Open) ===" -ForegroundColor Cyan
    foreach ($name in $frontends.Keys) {
        $url = $frontends[$name]
        Write-Host "  -> ${name}: $url"
        Start-Process $url
    }
} else {
    Write-Host "Browser not opened by default. Use -Open to launch the shell automatically." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Logs : docker compose -f infra/docker-compose.yml logs -f"
Write-Host "Stop : docker compose -f infra/docker-compose.yml down"
