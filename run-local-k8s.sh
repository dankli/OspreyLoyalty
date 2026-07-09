#!/usr/bin/env bash
# Build the Osprey Loyalty images and deploy the stack to Docker Desktop's built-in Kubernetes,
# with real browser zero-trust (RS256/OIDC) ON by default.
#
# Docker Desktop's Kubernetes is kind-based (its own containerd), so locally-built images are not
# visible to the cluster automatically — this script loads them into the node after building (the
# `kind load` equivalent). The manifests set imagePullPolicy: Never, so once loaded there's no pull.
#
# ACCESS MODES:
#   * Ingress (default): a Traefik ingress controller fronts everything on http://localhost:80 and
#     routes by Host header. Entry point http://app.osprey.localtest.me (localtest.me resolves to
#     127.0.0.1, so no /etc/hosts editing). The identity service issues tokens with issuer
#     http://id.osprey.localtest.me and the frontends are built to match.
#   * Port-forward (--port-forward): the older localhost:<port> setup with kubectl port-forwards and
#     issuer http://localhost:9000. No ingress controller involved.
#
#   ./run-local-k8s.sh                  authenticated stack behind Traefik ingress (default)
#   ./run-local-k8s.sh --port-forward   authenticated stack via localhost port-forwards instead
#   ./run-local-k8s.sh --no-auth        plain, unauthenticated stack
#   ./run-local-k8s.sh --no-build       skip the build and just (re)apply
#   ./run-local-k8s.sh --delete         tear the stack down (delete the osprey namespace) and exit
#
# Enable Kubernetes first: Docker Desktop -> Settings -> Kubernetes -> "Enable Kubernetes".
# Refuses to start while Docker Compose is running; stop it with ./stop-docker-compose.sh first.
# In ingress mode, mkcert is checked before any build/apply work starts.
set -euo pipefail
cd "$(dirname "$0")"

CONTEXT="docker-desktop"
NAMESPACE="osprey"
COMPOSE="docker compose -f infra/docker-compose.yml"
MANIFESTS="infra/k8s"
DOMAIN="osprey.localtest.me"
BACKENDS=(members gateway partners security points-engine)

BUILD=1
INGRESS=1
DELETE=0
AUTH=1
for arg in "$@"; do
  case "$arg" in
    --no-build)        BUILD=0 ;;
    --port-forward)    INGRESS=0 ;;
    --no-auth)         AUTH=0 ;;
    --delete)          DELETE=1 ;;
    -h|--help)         grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# URLs the frontends are baked with and the identity service issues for. Ingress mode uses the
# *.osprey.localtest.me hosts (Traefik); port-forward mode uses localhost:<port>.
if [ "$INGRESS" -eq 1 ]; then
  # HTTPS: *.localtest.me is not localhost, so http would be an insecure context and WebCrypto/PKCE
  # (oidc-client-ts) would fail. Traefik terminates TLS with a mkcert-issued wildcard cert.
  ISSUER="https://id.$DOMAIN"
  MEMBER_REDIRECT="https://member.$DOMAIN/callback"; ADMIN_REDIRECT="https://admin.$DOMAIN/callback"; SHELL_REDIRECT="https://app.$DOMAIN/callback"
  GATEWAY_URL="https://api.$DOMAIN/graphql"; MEMBERS_URL="https://members.$DOMAIN"; PARTNERS_URL="https://partners.$DOMAIN"
  MEMBER_REMOTE="https://member.$DOMAIN/assets/remoteEntry.js"; ADMIN_REMOTE="https://admin.$DOMAIN/assets/remoteEntry.js"
  ENTRY="https://app.$DOMAIN"
else
  ISSUER="http://localhost:9000"
  MEMBER_REDIRECT="http://localhost:5173/callback"; ADMIN_REDIRECT="http://localhost:5174/callback"; SHELL_REDIRECT="http://localhost:5170/callback"
  GATEWAY_URL="http://localhost:4000/graphql"; MEMBERS_URL="http://localhost:5080"; PARTNERS_URL="http://localhost:8081"
  MEMBER_REMOTE="http://localhost:5173/assets/remoteEntry.js"; ADMIN_REMOTE="http://localhost:5174/assets/remoteEntry.js"
  ENTRY="http://localhost:5170"
fi

require() { command -v "$1" >/dev/null 2>&1 || { echo "✗ '$1' is not on PATH (kubectl ships with Docker Desktop)." >&2; exit 1; }; }

compose_stack_running() {
  [ -n "$($COMPOSE ps --status running --quiet 2>/dev/null)" ]
}

confirm_continue_without_mkcert() {
  echo "  ! mkcert not found. In ingress mode Traefik falls back to a self-signed cert:" >&2
  echo "    browsers will warn, and auth-related cross-origin calls can fail." >&2
  echo "    Install mkcert, then re-run:" >&2
  echo "      Windows: choco install mkcert   (or: scoop install mkcert)" >&2
  echo "      macOS:   brew install mkcert       Linux: see github.com/FiloSottile/mkcert" >&2
  echo "    Or use ./run-local-k8s.sh --port-forward (localhost is already a secure context)." >&2
  if [ ! -t 0 ]; then
    echo "✗ No interactive terminal available to confirm continuing without mkcert." >&2
    exit 1
  fi
  read -r -p "Continue without mkcert? [y/N] " answer
  case "${answer,,}" in
    y|yes|j|ja) echo "  ! Continuing without mkcert at your request." >&2 ;;
    *) echo "✗ Aborted. Install mkcert or run with --port-forward." >&2; exit 1 ;;
  esac
}

print_url() {
  printf "  %-18s %s\n" "$1" "$2"
}

print_ingress_access() {
  echo "=== Access URLs ==="
  echo "Traefik terminates HTTPS on localhost:443; *.localtest.me resolves to 127.0.0.1."
  print_url "Shell" "$ENTRY"
  print_url "Member portal" "https://member.$DOMAIN"
  print_url "Admin portal" "https://admin.$DOMAIN"
  print_url "Identity" "https://id.$DOMAIN"
  print_url "Gateway GraphQL" "$GATEWAY_URL"
  print_url "Members API" "$MEMBERS_URL"
  print_url "Partners API" "$PARTNERS_URL"
  print_url "Grafana" "https://grafana.$DOMAIN"
  print_url "Jaeger" "https://jaeger.$DOMAIN"
  print_url "Traefik" "https://traefik.$DOMAIN"
}

print_port_forward_access() {
  echo "=== Access URLs ==="
  print_url "Shell" "$ENTRY"
  print_url "Member portal" "http://localhost:5173"
  print_url "Admin portal" "http://localhost:5174"
  [ "$AUTH" -eq 1 ] && print_url "Identity" "http://localhost:9000"
  print_url "Gateway GraphQL" "$GATEWAY_URL"
  print_url "Members API" "$MEMBERS_URL"
  print_url "Partners API" "$PARTNERS_URL"
  print_url "Grafana" "http://localhost:3000"
}

echo "=== Preconditions ==="
require docker
docker info >/dev/null 2>&1 || { echo "✗ Docker is not running. Start Docker Desktop and retry." >&2; exit 1; }
if [ "$DELETE" -ne 1 ] && compose_stack_running; then
  echo "✗ Docker Compose stack is already running." >&2
  echo "  Stop it first with ./stop-docker-compose.sh (or: docker compose -f infra/docker-compose.yml down)." >&2
  exit 1
fi
require kubectl
if ! kubectl config get-contexts "$CONTEXT" >/dev/null 2>&1; then
  echo "✗ kubectl has no '$CONTEXT' context. Enable it in Docker Desktop -> Settings -> Kubernetes -> Enable Kubernetes." >&2
  exit 1
fi
kubectl config use-context "$CONTEXT" >/dev/null
kubectl get nodes >/dev/null 2>&1 || { echo "✗ The '$CONTEXT' cluster is not reachable. Is Kubernetes enabled and green in Docker Desktop?" >&2; exit 1; }
echo "✓ Docker running, kubectl on context '$CONTEXT', cluster reachable"

if [ "$DELETE" -eq 1 ]; then
  echo "=== Deleting namespace '$NAMESPACE' ==="
  kubectl delete namespace "$NAMESPACE" --ignore-not-found
  kubectl delete clusterrole promtail traefik-ingress prometheus kube-state-metrics --ignore-not-found >/dev/null
  kubectl delete clusterrolebinding promtail traefik-ingress prometheus kube-state-metrics --ignore-not-found >/dev/null
  kubectl delete ingressclass traefik --ignore-not-found >/dev/null
  echo "✓ Torn down."
  exit 0
fi

MKCERT_AVAILABLE=0
command -v mkcert >/dev/null 2>&1 && MKCERT_AVAILABLE=1
if [ "$INGRESS" -eq 1 ] && [ "$MKCERT_AVAILABLE" -ne 1 ]; then
  confirm_continue_without_mkcert
fi

if [ "$BUILD" -eq 1 ]; then
  echo "=== Building backend images ==="
  $COMPOSE build "${BACKENDS[@]}"
  echo "=== Building frontend images (auth=$AUTH, ingress=$INGRESS) ==="
  if [ "$AUTH" -eq 1 ]; then
    # OIDC + remote URLs are baked at build time (Vite/module federation). They must match the URLs
    # the browser will actually use — the ingress hosts or the forwarded localhost ports.
    docker build \
      --build-arg VITE_AUTH_ENABLED=true --build-arg "VITE_OIDC_ISSUER=$ISSUER" \
      --build-arg VITE_OIDC_CLIENT_ID=member-portal \
      --build-arg "VITE_OIDC_REDIRECT_URI=$MEMBER_REDIRECT" \
      --build-arg "VITE_GATEWAY_URL=$GATEWAY_URL" \
      -t osprey-loyalty-member-portal:latest ./frontends/member-portal
    docker build \
      --build-arg VITE_AUTH_ENABLED=true --build-arg "VITE_OIDC_ISSUER=$ISSUER" \
      --build-arg VITE_OIDC_CLIENT_ID=admin-portal \
      --build-arg "VITE_OIDC_REDIRECT_URI=$ADMIN_REDIRECT" \
      --build-arg "VITE_MEMBERS_URL=$MEMBERS_URL" \
      --build-arg "VITE_PARTNERS_URL=$PARTNERS_URL" \
      -t osprey-loyalty-admin-portal:latest ./frontends/admin-portal
    docker build \
      --build-arg VITE_AUTH_ENABLED=true --build-arg "VITE_OIDC_ISSUER=$ISSUER" \
      --build-arg VITE_OIDC_CLIENT_ID=admin-portal \
      --build-arg "VITE_OIDC_REDIRECT_URI=$SHELL_REDIRECT" \
      --build-arg "MEMBER_PORTAL_URL=$MEMBER_REMOTE" \
      --build-arg "ADMIN_PORTAL_URL=$ADMIN_REMOTE" \
      -t osprey-loyalty-shell:latest ./frontends/shell
  else
    $COMPOSE build member-portal admin-portal shell
  fi
  echo "✓ Images built"

  # Docker Desktop's Kubernetes (kind-based) runs its own containerd, so it does NOT see images in
  # the Docker daemon — load them into the node (the `kind load` equivalent). Bash pipes are binary-safe.
  echo "=== Loading images into the cluster node ==="
  NODE=$(kubectl --context "$CONTEXT" get nodes -o jsonpath='{.items[0].metadata.name}')
  for svc in members gateway partners security points-engine member-portal admin-portal shell; do
    docker save "osprey-loyalty-$svc:latest" | docker exec -i "$NODE" ctr -n k8s.io images import - >/dev/null 2>&1 \
      || echo "  ! could not load osprey-loyalty-$svc"
  done
  echo "✓ Images loaded into node '$NODE'"
fi

echo "=== Applying manifests ==="
kubectl apply -f "$MANIFESTS/namespace.yaml"
kubectl apply -f "$MANIFESTS"
if [ "$INGRESS" -eq 1 ]; then
  echo "=== TLS certificate for *.$DOMAIN ==="
  if [ "$MKCERT_AVAILABLE" -eq 1 ]; then
    CERTDIR=$(mktemp -d)
    mkcert -install >/dev/null 2>&1 || true    # trust the local CA (idempotent)
    mkcert -cert-file "$CERTDIR/tls.crt" -key-file "$CERTDIR/tls.key" "*.$DOMAIN" "$DOMAIN" >/dev/null 2>&1
    kubectl -n "$NAMESPACE" create secret tls osprey-tls \
      --cert="$CERTDIR/tls.crt" --key="$CERTDIR/tls.key" \
      --dry-run=client -o yaml | kubectl apply -f - >/dev/null
    rm -rf "$CERTDIR"
    echo "✓ osprey-tls secret from a mkcert-issued cert (locally trusted — no browser warnings)"
  else
    echo "  ! Continuing without mkcert; Traefik will use its self-signed fallback cert."
  fi
  echo "=== Applying Traefik ingress ($DOMAIN) ==="
  kubectl apply -f "$MANIFESTS/ingress"
fi

if [ "$AUTH" -eq 1 ]; then
  echo "=== Turning on RS256 zero-trust (issuer $ISSUER) ==="
  # members validates via JWKS (no shared secret); partners fetches a real client-credentials token.
  # The issuer must match how the browser reaches the identity service (ingress host vs localhost).
  kubectl -n "$NAMESPACE" set env deploy/members Auth__Enabled=true "Auth__Issuer=$ISSUER" >/dev/null
  kubectl -n "$NAMESPACE" set env deploy/partners \
    AUTH_ENABLED=true \
    AUTH_TOKEN_ENDPOINT=http://security:8080/oauth2/token \
    AUTH_CLIENT_SECRET=partners-secret >/dev/null
else
  # Reset any auth env from a prior run so --no-auth is predictable.
  kubectl -n "$NAMESPACE" set env deploy/members Auth__Enabled- Auth__Issuer- >/dev/null 2>&1 || true
  kubectl -n "$NAMESPACE" set env deploy/partners AUTH_ENABLED- AUTH_TOKEN_ENDPOINT- AUTH_CLIENT_SECRET- >/dev/null 2>&1 || true
fi

# Point the identity service's issuer, redirect/post-logout URIs and CORS at the active mode's URLs.
# Ingress mode sets the hostnames; port-forward mode clears them so the localhost defaults apply.
if [ "$INGRESS" -eq 1 ]; then
  kubectl -n "$NAMESPACE" set env deploy/security \
    "OIDC_ISSUER=$ISSUER" \
    "MEMBER_PORTAL_REDIRECT=$MEMBER_REDIRECT" "ADMIN_PORTAL_REDIRECT=$ADMIN_REDIRECT" "SHELL_REDIRECT=$SHELL_REDIRECT" \
    "OSPREY_OIDC_MEMBER_PORTAL_POST_LOGOUT=https://member.$DOMAIN" \
    "OSPREY_OIDC_ADMIN_PORTAL_POST_LOGOUT=https://admin.$DOMAIN" \
    "OSPREY_OIDC_SHELL_POST_LOGOUT=https://app.$DOMAIN" \
    "OSPREY_CORS_ALLOWED_ORIGINS=https://app.$DOMAIN,https://member.$DOMAIN,https://admin.$DOMAIN" >/dev/null
else
  kubectl -n "$NAMESPACE" set env deploy/security \
    OIDC_ISSUER- MEMBER_PORTAL_REDIRECT- ADMIN_PORTAL_REDIRECT- SHELL_REDIRECT- \
    OSPREY_OIDC_MEMBER_PORTAL_POST_LOGOUT- OSPREY_OIDC_ADMIN_PORTAL_POST_LOGOUT- OSPREY_OIDC_SHELL_POST_LOGOUT- \
    OSPREY_CORS_ALLOWED_ORIGINS- >/dev/null 2>&1 || true
fi

# A service token / JWKS entry cached against a previous issuer or signing key is rejected after a
# reconfigure (e.g. switching between ingress and port-forward modes). Restart the token minter and
# validator so both pick up the current IdP before we start verifying.
[ "$AUTH" -eq 1 ] && kubectl -n "$NAMESPACE" rollout restart deploy/partners deploy/members >/dev/null

echo "=== Waiting for rollouts (up to 3 min each) ==="
for deploy in $(kubectl -n "$NAMESPACE" get deploy -o name); do
  kubectl -n "$NAMESPACE" rollout status "$deploy" --timeout=180s
done
for sts in $(kubectl -n "$NAMESPACE" get statefulset -o name); do
  kubectl -n "$NAMESPACE" rollout status "$sts" --timeout=180s
done
kubectl -n "$NAMESPACE" rollout status ds/promtail --timeout=180s
echo "✓ All workloads Ready"

echo ""
if [ "$INGRESS" -eq 1 ]; then
  print_ingress_access
else
  FORWARDS=(shell:5170:80 member-portal:5173:80 admin-portal:5174:80 gateway:4000:4000 members:5080:8080 partners:8081:8080 grafana:3000:3000)
  [ "$AUTH" -eq 1 ] && FORWARDS+=(security:9000:8080)
  echo "Starting background port-forwards…"
  for f in "${FORWARDS[@]}"; do
    IFS=: read -r svc lp tp <<<"$f"
    kubectl -n "$NAMESPACE" port-forward "svc/$svc" "$lp:$tp" >/dev/null 2>&1 &
    echo "  svc/$svc -> localhost:$lp  (pid $!)"
  done
  echo "(stop them with: pkill -f 'kubectl.*port-forward')"
  echo ""
  print_port_forward_access
fi

echo ""
if [ "$AUTH" -eq 1 ]; then
  echo "Sign in at Shell with: demo-ada / demo-erik / demo-yusra (members), or admin (admin role)."
  echo "Plain stack instead: ./run-local-k8s.sh --no-auth"
else
  echo "Unauthenticated stack is ready."
  echo "Authenticated stack instead: ./run-local-k8s.sh"
fi
[ "$INGRESS" -eq 1 ] && echo "Localhost port-forward mode instead: ./run-local-k8s.sh --port-forward"
echo "Tear down: ./run-local-k8s.sh --delete"
