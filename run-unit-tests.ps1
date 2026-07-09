<#
.SYNOPSIS
  Run every repository unit/component test suite.

.DESCRIPTION
  Runs unit/component test commands without starting Docker Compose, Kubernetes, or the e2e smoke test.
  Members tests that require Testcontainers are skipped by default; use -IncludeIntegration to include them.
  Node dependencies are installed with npm ci only when node_modules is missing, or always with -Install.

.PARAMETER Install
  Force npm ci before every Node/Vite test suite.

.PARAMETER IncludeIntegration
  Include members Testcontainers integration tests.

.EXAMPLE
  ./run-unit-tests.ps1
.EXAMPLE
  ./run-unit-tests.ps1 -Install
#>
[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$IncludeIntegration
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

$membersIntegrationFilter = 'FullyQualifiedName!~ApplyEarnIdempotencyTests&FullyQualifiedName!~AuthTests&FullyQualifiedName!~EarnEventsAuthQueueTests&FullyQualifiedName!~EarnEventsQueueTests&FullyQualifiedName!~ExpirySweepTests&FullyQualifiedName!~MembersApiTests&FullyQualifiedName!~RedeemConcurrencyTests'
if ($IncludeIntegration) {
    Invoke-Step 'members (.NET)' '.' { dotnet test services\members --nologo }
}
else {
    Invoke-Step 'members (.NET unit)' '.' { dotnet test services\members --nologo --filter $membersIntegrationFilter }
}
Invoke-NpmTests 'gateway (Node/TypeScript)' 'services\gateway'
Invoke-Step 'partners (Spring Boot)' 'services\partners' { .\mvnw.cmd -q test }
Invoke-Step 'security (Spring Boot)' 'services\security' { .\mvnw.cmd -q test }
Invoke-Step 'points-engine (Rust)' 'services\points-engine' { cargo test }
Invoke-NpmTests 'member-portal (React/Vite)' 'frontends\member-portal'
Invoke-NpmTests 'admin-portal (Vue/Vite)' 'frontends\admin-portal'
Invoke-NpmTests 'shell (Vite)' 'frontends\shell'

Write-Host ''
Write-Host 'All unit/component test suites passed.' -ForegroundColor Green
