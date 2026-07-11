<#
.SYNOPSIS
  Build the Osprey Loyalty images and deploy the stack to Docker Desktop's built-in Kubernetes,
  with real browser zero-trust (RS256/OIDC) ON by default.

.DESCRIPTION
  Docker Desktop's Kubernetes is kind-based (its own containerd), so locally-built images are not
  visible to the cluster automatically — this script loads them into the node after building (the
  `kind load` equivalent). The manifests set imagePullPolicy: Never, so once loaded there's no pull.

  ACCESS MODES:
    * Ingress (default): a Traefik ingress controller fronts everything on http://localhost:80 and
      routes by Host header. Entry point http://app.osprey.localtest.me (localtest.me resolves to
      127.0.0.1, so no hosts-file editing). Tokens are issued with issuer http://id.osprey.localtest.me
      and the frontends are built to match.
    * Port-forward (-PortForward): the older localhost:<port> setup with kubectl port-forwards and
      issuer http://localhost:9000. No ingress controller involved.

  Enable Kubernetes first: Docker Desktop -> Settings -> Kubernetes -> "Enable Kubernetes".
  Refuses to start while Docker Compose is running; stop it with ./stop-docker-compose.ps1 first.
  In ingress mode, mkcert is checked before any build/apply work starts.

.PARAMETER PortForward
  Use localhost:<port> kubectl port-forwards instead of the Traefik ingress.

.PARAMETER NoAuth
  Deploy the plain, unauthenticated stack (frontends built auth-off; no RS256 env on the backends).

.PARAMETER NoBuild
  Skip the image build and just (re)apply the manifests.

.PARAMETER Delete
  Tear the stack down (delete the osprey namespace) and exit.

.EXAMPLE
  ./run-local-k8s.ps1                 # authenticated stack behind Traefik ingress (default)
.EXAMPLE
  ./run-local-k8s.ps1 -PortForward    # authenticated stack via localhost port-forwards instead
.EXAMPLE
  ./run-local-k8s.ps1 -NoAuth
.EXAMPLE
  ./run-local-k8s.ps1 -Delete
#>
[CmdletBinding()]
param(
    [switch]$PortForward,
    [switch]$NoAuth,
    [switch]$NoBuild,
    [switch]$Delete
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$context = 'docker-desktop'
$namespace = 'osprey'
$composeFile = 'infra/docker-compose.yml'
$manifests = 'infra/k8s'
$domain = 'osprey.localtest.me'
$auth = -not $NoAuth
$ingress = -not $PortForward

$backends = @('members', 'gateway', 'partners', 'security', 'points-engine', 'routes', 'notifications')
$apps = $backends + @('member-portal', 'admin-portal', 'route-explorer', 'shell')

# URLs the frontends are baked with and the identity service issues for. Ingress mode uses the
# *.osprey.localtest.me hosts (Traefik); port-forward mode uses localhost:<port>.
if ($ingress) {
    # HTTPS: *.localtest.me is not localhost, so http would be an insecure context and WebCrypto/PKCE
    # (oidc-client-ts) would fail. Traefik terminates TLS with a mkcert-issued wildcard cert.
    $issuer = "https://id.$domain"
    $memberRedirect = "https://member.$domain/callback"; $adminRedirect = "https://admin.$domain/callback"; $shellRedirect = "https://app.$domain/callback"
    $gatewayUrl = "https://api.$domain/graphql"; $membersUrl = "https://members.$domain"; $partnersUrl = "https://partners.$domain"
    $pointsUrl = "https://points-engine.$domain"; $routesUrl = "https://routes.$domain"
    $memberRemote = "https://member.$domain/assets/remoteEntry.js"; $adminRemote = "https://admin.$domain/assets/remoteEntry.js"
    $explorerRemote = "https://explorer.$domain/assets/remoteEntry.js"
    $entry = "https://app.$domain"
}
else {
    $issuer = 'http://localhost:9000'
    $memberRedirect = 'http://localhost:5173/callback'; $adminRedirect = 'http://localhost:5174/callback'; $shellRedirect = 'http://localhost:5170/callback'
    $gatewayUrl = 'http://localhost:4000/graphql'; $membersUrl = 'http://localhost:5080'; $partnersUrl = 'http://localhost:8081'
    $pointsUrl = 'http://localhost:8082'; $routesUrl = 'http://localhost:8083'
    $memberRemote = 'http://localhost:5173/assets/remoteEntry.js'; $adminRemote = 'http://localhost:5174/assets/remoteEntry.js'
    $explorerRemote = 'http://localhost:5175/assets/remoteEntry.js'
    $entry = 'http://localhost:5170'
}

function Require-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "'$name' is not on PATH. Install it (kubectl ships with Docker Desktop) and retry."
    }
}

function Test-ComposeStackRunning {
    $running = @(docker compose -f $composeFile ps --status running --quiet 2>$null)
    return $LASTEXITCODE -eq 0 -and $running.Count -gt 0
}

function Confirm-ContinueWithoutMkcert {
    Write-Host '  ! mkcert not found. In ingress mode Traefik falls back to a self-signed cert:' -ForegroundColor Yellow
    Write-Host '    browsers will warn, and auth-related cross-origin calls can fail.' -ForegroundColor Yellow
    Write-Host '    Install mkcert, then re-run:'
    Write-Host '      choco install mkcert   (or: scoop install mkcert)'
    Write-Host '    Or use ./run-local-k8s.ps1 -PortForward (localhost is already a secure context).'
    $answer = Read-Host 'Continue without mkcert? [y/N]'
    if ($answer -notmatch '(?i)^(y|yes|j|ja)$') {
        throw 'Aborted. Install mkcert or run with -PortForward.'
    }
    Write-Host '  ! Continuing without mkcert at your request.' -ForegroundColor Yellow
}

function Write-Link {
    param([string]$Name, [string]$Url)
    Write-Host ("  {0,-18} " -f $Name) -NoNewline -ForegroundColor DarkCyan
    Write-Host $Url -ForegroundColor Cyan
}

function Show-IngressAccess {
    Write-Host '=== Access URLs ===' -ForegroundColor Cyan
    Write-Host 'Traefik terminates HTTPS on localhost:443; *.localtest.me resolves to 127.0.0.1.'
    Write-Link 'Shell' $entry
    Write-Link 'Member portal' "https://member.$domain"
    Write-Link 'Admin portal' "https://admin.$domain"
    Write-Link 'Route explorer' "https://explorer.$domain"
    Write-Link 'Identity' "https://id.$domain"
    Write-Link 'Gateway GraphQL' $gatewayUrl
    Write-Link 'Members API' $membersUrl
    Write-Link 'Partners API' $partnersUrl
    Write-Link 'Routes API' $routesUrl
    Write-Link 'Points engine' $pointsUrl
    Write-Link 'Grafana' "https://grafana.$domain"
    Write-Link 'Jaeger' "https://jaeger.$domain"
    Write-Link 'Traefik' "https://traefik.$domain"
}

function Show-PortForwardAccess {
    Write-Host '=== Access URLs ===' -ForegroundColor Cyan
    Write-Link 'Shell' $entry
    Write-Link 'Member portal' 'http://localhost:5173'
    Write-Link 'Admin portal' 'http://localhost:5174'
    Write-Link 'Route explorer' 'http://localhost:5175'
    if ($auth) { Write-Link 'Identity' 'http://localhost:9000' }
    Write-Link 'Gateway GraphQL' $gatewayUrl
    Write-Link 'Members API' $membersUrl
    Write-Link 'Partners API' $partnersUrl
    Write-Link 'Routes API' $routesUrl
    Write-Link 'Points engine' $pointsUrl
    Write-Link 'Grafana' 'http://localhost:3000'
}

Write-Host '=== Preconditions ===' -ForegroundColor Cyan
Require-Command docker
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker is not running. Start Docker Desktop and retry.' }
if (-not $Delete -and (Test-ComposeStackRunning)) {
    throw 'Docker Compose stack is already running. Stop it first with ./stop-docker-compose.ps1 (or: docker compose -f infra/docker-compose.yml down).'
}
Require-Command kubectl
$null = kubectl config get-contexts $context *> $null
if ($LASTEXITCODE -ne 0) {
    throw "kubectl has no '$context' context. Enable it in Docker Desktop -> Settings -> Kubernetes -> Enable Kubernetes, then wait for it to turn green."
}
kubectl config use-context $context | Out-Null
kubectl get nodes *> $null
if ($LASTEXITCODE -ne 0) {
    throw "The '$context' cluster is not reachable. Is Kubernetes enabled and running (green) in Docker Desktop?"
}
Write-Host "✓ Docker running, kubectl on context '$context', cluster reachable" -ForegroundColor Green

if ($Delete) {
    Write-Host "=== Deleting namespace '$namespace' ===" -ForegroundColor Cyan
    kubectl delete namespace $namespace --ignore-not-found
    kubectl delete clusterrole promtail traefik-ingress prometheus kube-state-metrics --ignore-not-found | Out-Null
    kubectl delete clusterrolebinding promtail traefik-ingress prometheus kube-state-metrics --ignore-not-found | Out-Null
    kubectl delete ingressclass traefik --ignore-not-found | Out-Null
    Write-Host '✓ Torn down.' -ForegroundColor Green
    return
}

$mkcertAvailable = [bool](Get-Command mkcert -ErrorAction SilentlyContinue)
if ($ingress -and -not $mkcertAvailable) {
    Confirm-ContinueWithoutMkcert
}

if (-not $NoBuild) {
    Write-Host '=== Building backend images ===' -ForegroundColor Cyan
    docker compose -f $composeFile build @backends
    if ($LASTEXITCODE -ne 0) { throw 'Backend image build failed.' }

    Write-Host "=== Building frontend images (auth=$auth, ingress=$ingress) ===" -ForegroundColor Cyan
    if ($auth) {
        # OIDC + remote URLs are baked into the bundle at build time (Vite/module federation) and must
        # match the URLs the browser will use — the ingress hosts or the forwarded localhost ports.
        docker build `
            --build-arg VITE_AUTH_ENABLED=true --build-arg VITE_OIDC_ISSUER=$issuer `
            --build-arg VITE_OIDC_CLIENT_ID=member-portal `
            --build-arg VITE_OIDC_REDIRECT_URI=$memberRedirect `
            --build-arg VITE_GATEWAY_URL=$gatewayUrl `
            -t osprey-loyalty-member-portal:latest ./frontends/member-portal
        if ($LASTEXITCODE -ne 0) { throw 'member-portal build failed.' }
        docker build `
            --build-arg VITE_AUTH_ENABLED=true --build-arg VITE_OIDC_ISSUER=$issuer `
            --build-arg VITE_OIDC_CLIENT_ID=admin-portal `
            --build-arg VITE_OIDC_REDIRECT_URI=$adminRedirect `
            --build-arg VITE_MEMBERS_URL=$membersUrl `
            --build-arg VITE_PARTNERS_URL=$partnersUrl `
            -t osprey-loyalty-admin-portal:latest ./frontends/admin-portal
        if ($LASTEXITCODE -ne 0) { throw 'admin-portal build failed.' }
        docker build `
            --build-arg VITE_GATEWAY_URL=$gatewayUrl `
            -t osprey-loyalty-route-explorer:latest ./frontends/route-explorer
        if ($LASTEXITCODE -ne 0) { throw 'route-explorer build failed.' }
        docker build `
            --build-arg VITE_AUTH_ENABLED=true --build-arg VITE_OIDC_ISSUER=$issuer `
            --build-arg VITE_OIDC_CLIENT_ID=admin-portal `
            --build-arg VITE_OIDC_REDIRECT_URI=$shellRedirect `
            --build-arg MEMBER_PORTAL_URL=$memberRemote `
            --build-arg ADMIN_PORTAL_URL=$adminRemote `
            --build-arg ROUTE_EXPLORER_URL=$explorerRemote `
            -t osprey-loyalty-shell:latest ./frontends/shell
        if ($LASTEXITCODE -ne 0) { throw 'shell build failed.' }
    }
    else {
        docker compose -f $composeFile build member-portal admin-portal route-explorer shell
        if ($LASTEXITCODE -ne 0) { throw 'Frontend image build failed.' }
    }
    Write-Host '✓ Images built' -ForegroundColor Green

    # Docker Desktop's Kubernetes (kind-based) runs its own containerd, so it does NOT see images
    # in the Docker daemon — they must be loaded into the node (the `kind load` equivalent). We shell
    # out to cmd for the save|import pipe because PowerShell's own pipe would corrupt the binary tar.
    Write-Host '=== Loading images into the cluster node ===' -ForegroundColor Cyan
    $node = kubectl --context $context get nodes -o jsonpath='{.items[0].metadata.name}'
    foreach ($svc in $apps) {
        cmd /c "docker save osprey-loyalty-${svc}:latest | docker exec -i $node ctr -n k8s.io images import -" *> $null
        if ($LASTEXITCODE -ne 0) { Write-Host "  ! could not load osprey-loyalty-$svc" -ForegroundColor Yellow }
    }
    Write-Host "✓ Images loaded into node '$node'" -ForegroundColor Green
}

Write-Host '=== Applying manifests ===' -ForegroundColor Cyan
kubectl apply -f (Join-Path $manifests 'namespace.yaml')
kubectl apply -f $manifests
if ($LASTEXITCODE -ne 0) { throw 'kubectl apply failed.' }
if ($ingress) {
    Write-Host "=== TLS certificate for *.$domain ===" -ForegroundColor Cyan
    if ($mkcertAvailable) {
        $certDir = Join-Path ([System.IO.Path]::GetTempPath()) ("osprey-tls-" + [System.Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $certDir | Out-Null
        mkcert -install *> $null                       # trust the local CA (idempotent)
        $crt = Join-Path $certDir 'tls.crt'; $key = Join-Path $certDir 'tls.key'
        mkcert -cert-file $crt -key-file $key "*.$domain" "$domain" *> $null
        kubectl -n $namespace create secret tls osprey-tls --cert=$crt --key=$key --dry-run=client -o yaml | kubectl apply -f - | Out-Null
        Remove-Item -Recurse -Force $certDir
        Write-Host '✓ osprey-tls secret from a mkcert-issued cert (locally trusted — no browser warnings)' -ForegroundColor Green
    }
    else {
        Write-Host '  ! Continuing without mkcert; Traefik will use its self-signed fallback cert.' -ForegroundColor Yellow
    }
    Write-Host "=== Applying Traefik ingress ($domain) ===" -ForegroundColor Cyan
    kubectl apply -f (Join-Path $manifests 'ingress')
    if ($LASTEXITCODE -ne 0) { throw 'ingress apply failed.' }
}

if ($auth) {
    Write-Host "=== Turning on RS256 zero-trust (issuer $issuer) ===" -ForegroundColor Cyan
    # members validates via JWKS (no shared secret); partners fetches a real client-credentials token.
    # The issuer must match how the browser reaches the identity service (ingress host vs localhost).
    kubectl -n $namespace set env deploy/members Auth__Enabled=true Auth__Issuer=$issuer | Out-Null
    kubectl -n $namespace set env deploy/partners `
        AUTH_ENABLED=true `
        AUTH_TOKEN_ENDPOINT=http://security:8080/oauth2/token `
        AUTH_CLIENT_SECRET=partners-secret | Out-Null
}
else {
    # Reset any auth env from a prior run so -NoAuth is predictable.
    kubectl -n $namespace set env deploy/members Auth__Enabled- Auth__Issuer- 2>$null | Out-Null
    kubectl -n $namespace set env deploy/partners AUTH_ENABLED- AUTH_TOKEN_ENDPOINT- AUTH_CLIENT_SECRET- 2>$null | Out-Null
}

# Point the identity service's issuer, redirect/post-logout URIs and CORS at the active mode's URLs.
# Ingress mode sets the hostnames; port-forward mode clears them so the localhost defaults apply.
if ($ingress) {
    kubectl -n $namespace set env deploy/security `
        OIDC_ISSUER=$issuer `
        MEMBER_PORTAL_REDIRECT=$memberRedirect ADMIN_PORTAL_REDIRECT=$adminRedirect SHELL_REDIRECT=$shellRedirect `
        OSPREY_OIDC_MEMBER_PORTAL_POST_LOGOUT="https://member.$domain" `
        OSPREY_OIDC_ADMIN_PORTAL_POST_LOGOUT="https://admin.$domain" `
        OSPREY_OIDC_SHELL_POST_LOGOUT="https://app.$domain" `
        OSPREY_CORS_ALLOWED_ORIGINS="https://app.$domain,https://member.$domain,https://admin.$domain" | Out-Null
}
else {
    kubectl -n $namespace set env deploy/security `
        OIDC_ISSUER- MEMBER_PORTAL_REDIRECT- ADMIN_PORTAL_REDIRECT- SHELL_REDIRECT- `
        OSPREY_OIDC_MEMBER_PORTAL_POST_LOGOUT- OSPREY_OIDC_ADMIN_PORTAL_POST_LOGOUT- OSPREY_OIDC_SHELL_POST_LOGOUT- `
        OSPREY_CORS_ALLOWED_ORIGINS- 2>$null | Out-Null
}

# A service token / JWKS entry cached against a previous issuer or signing key is rejected after a
# reconfigure (e.g. switching between ingress and port-forward modes). Restart the token minter and
# validator so both pick up the current IdP before we start verifying.
if ($auth) { kubectl -n $namespace rollout restart deploy/partners deploy/members | Out-Null }

Write-Host '=== Waiting for rollouts (up to 3 min each) ===' -ForegroundColor Cyan
foreach ($deploy in (kubectl -n $namespace get deploy -o name)) {
    kubectl -n $namespace rollout status $deploy --timeout=180s
}
foreach ($sts in (kubectl -n $namespace get statefulset -o name)) {
    kubectl -n $namespace rollout status $sts --timeout=180s
}
kubectl -n $namespace rollout status ds/promtail --timeout=180s
Write-Host '✓ All workloads Ready' -ForegroundColor Green

Write-Host ''
if ($ingress) {
    Show-IngressAccess
}
else {
    $forwards = @(
        'shell:5170:80', 'member-portal:5173:80', 'admin-portal:5174:80', 'route-explorer:5175:80',
        'gateway:4000:4000', 'members:5080:8080', 'partners:8081:8080', 'routes:8083:8083',
        'grafana:3000:3000'
    )
    if ($auth) { $forwards += 'security:9000:8080' }
    Write-Host 'Starting background port-forwards…'
    foreach ($f in $forwards) {
        $p = $f.Split(':')
        Start-Process kubectl -ArgumentList 'port-forward', '-n', $namespace, "svc/$($p[0])", "$($p[1]):$($p[2])" -WindowStyle Hidden
        Write-Host "  svc/$($p[0]) -> localhost:$($p[1])"
    }
    Write-Host '(each runs in its own hidden window; close them or run -Delete to stop)'
    Write-Host ''
    Show-PortForwardAccess
}

Write-Host ''
if ($auth) {
    Write-Host 'Sign in at Shell with: demo-ada / demo-erik / demo-yusra (members), or admin (admin role).' -ForegroundColor Yellow
    Write-Host 'Plain stack instead: ./run-local-k8s.ps1 -NoAuth'
}
else {
    Write-Host 'Unauthenticated stack is ready.'
    Write-Host 'Authenticated stack instead: ./run-local-k8s.ps1'
}
if ($ingress) { Write-Host 'Localhost port-forward mode instead: ./run-local-k8s.ps1 -PortForward' }
Write-Host 'Tear down: ./run-local-k8s.ps1 -Delete'
