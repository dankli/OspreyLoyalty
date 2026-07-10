<#
.SYNOPSIS
  Run every repository unit/component test suite.

.DESCRIPTION
  Runs unit/component test commands without starting Docker Compose, Kubernetes, or the e2e smoke test.
  Members and routes integration tests (Testcontainers) run by default when Docker is available; use
  -SkipIntegration to force unit-only. They are auto-skipped with a warning when Docker is not running.
  Node dependencies are installed with npm ci only when node_modules is missing, or always with -Install.

.PARAMETER Install
  Force npm ci before every Node/Vite test suite.

.PARAMETER SkipIntegration
  Force unit-only, skipping the Testcontainers integration suites even when Docker is available.

.EXAMPLE
  ./run-unit-tests.ps1
.EXAMPLE
  ./run-unit-tests.ps1 -Install
#>
[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$SkipIntegration
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Require-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "'$name' is not on PATH."
    }
}

function Invoke-Step {
    param(
        [string]$Name,
        [string]$Path,
        [scriptblock]$Command
    )

    Write-Host ''
    Write-Host "━━ $Name ━━" -ForegroundColor Cyan
    Push-Location $Path
    try {
        $global:LASTEXITCODE = 0
        & $Command
        if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit $LASTEXITCODE)." }
    }
    finally {
        Pop-Location
    }
}

function Invoke-NpmTests {
    param(
        [string]$Name,
        [string]$Path
    )

    Invoke-Step "$Name dependencies" $Path {
        if ($Install -or -not (Test-Path 'node_modules')) {
            npm ci
        }
        else {
            Write-Host 'node_modules present; skipping npm ci (use -Install to force).' -ForegroundColor DarkGray
        }
    }
    Invoke-Step "$Name tests" $Path { npm test }
}

Require-Command dotnet
Require-Command npm
Require-Command java
Require-Command cargo

Write-Host 'Osprey Loyalty unit/component test suites' -ForegroundColor Green

# The members Testcontainers suites hold the showcase distributed-correctness invariants
# (idempotency/duplicate-delivery, redemption concurrency, expiry sweep, HTTP API, queue, auth).
# They run BY DEFAULT when Docker is available so the headline command actually exercises them;
# skipped (with a visible warning) only when Docker is down or -SkipIntegration is passed.
$membersUnitFilter = 'FullyQualifiedName!~ApplyEarnIdempotencyTests&FullyQualifiedName!~AuthTests&FullyQualifiedName!~EarnEventsAuthQueueTests&FullyQualifiedName!~EarnEventsQueueTests&FullyQualifiedName!~ExpirySweepTests&FullyQualifiedName!~MembersApiTests&FullyQualifiedName!~RedeemConcurrencyTests'
$dockerAvailable = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker info *>$null 2>&1
    if ($LASTEXITCODE -eq 0) { $dockerAvailable = $true }
}
if ($SkipIntegration) {
    Write-Host 'Skipping members integration tests (-SkipIntegration).' -ForegroundColor Yellow
    Invoke-Step 'members (.NET unit only)' '.' { dotnet test services\members --nologo --filter $membersUnitFilter }
}
elseif (-not $dockerAvailable) {
    Write-Host 'Docker not available — SKIPPING members integration tests (idempotency, redemption concurrency, expiry sweep, API, queue, auth). Start Docker to run them.' -ForegroundColor Yellow
    Invoke-Step 'members (.NET unit only)' '.' { dotnet test services\members --nologo --filter $membersUnitFilter }
}
else {
    Invoke-Step 'members (.NET, incl. integration)' '.' { dotnet test services\members --nologo }
}
Invoke-NpmTests 'gateway (Node/TypeScript)' 'services\gateway'
Invoke-NpmTests 'routes (Node/TypeScript)' 'services\routes'
# The routes Testcontainers suites (Neo4j) follow the same Docker gate as members above.
if ($SkipIntegration) {
    Write-Host 'Skipping routes integration tests (-SkipIntegration).' -ForegroundColor Yellow
}
elseif (-not $dockerAvailable) {
    Write-Host 'Docker not available — SKIPPING routes integration tests (Testcontainers Neo4j). Start Docker to run them.' -ForegroundColor Yellow
}
else {
    Invoke-Step 'routes integration (Testcontainers Neo4j)' 'services\routes' { npm run test:integration }
}
Invoke-Step 'partners (Spring Boot)' 'services\partners' { .\mvnw.cmd -q test }
Invoke-Step 'security (Spring Boot)' 'services\security' { .\mvnw.cmd -q test }
Invoke-Step 'points-engine (Rust)' 'services\points-engine' { cargo test }
Invoke-Step 'route-explorer wasm-map (Rust)' 'frontends\route-explorer\wasm-map' { cargo test }
Invoke-NpmTests 'member-portal (React/Vite)' 'frontends\member-portal'
Invoke-NpmTests 'admin-portal (Vue/Vite)' 'frontends\admin-portal'
Invoke-NpmTests 'shell (Vite)' 'frontends\shell'
Invoke-NpmTests 'route-explorer (Svelte/Vite)' 'frontends\route-explorer'

Write-Host ''
Write-Host 'All unit/component test suites passed.' -ForegroundColor Green
