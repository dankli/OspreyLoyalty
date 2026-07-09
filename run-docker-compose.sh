#!/usr/bin/env bash
# Build and run the whole Osprey Loyalty stack, then print the useful URLs.
#
#   ./run-docker-compose.sh              build + start, wait until ready, print URLs
#   ./run-docker-compose.sh --no-build   start without rebuilding images
#   ./run-docker-compose.sh --open       also open the shell in a browser
#
# Stop the stack with:  ./stop-docker-compose.sh  (or: docker compose -f infra/docker-compose.yml down)
# Refuses to start while the local Kubernetes stack exists; tear that down with ./run-local-k8s.sh --delete first.
set -euo pipefail

# Run from the repo root regardless of where the script is invoked from.
cd "$(dirname "$0")"

COMPOSE="docker compose -f infra/docker-compose.yml"
K8S_CONTEXT="docker-desktop"
K8S_NAMESPACE="osprey"

BUILD_FLAG="--build"
OPEN_BROWSER=0
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD_FLAG="" ;;
    --open)     OPEN_BROWSER=1 ;;
    --no-open)  OPEN_BROWSER=0 ;; # legacy no-op: browsers are not opened by default anymore
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# Open the shell only — it hosts both portals via module federation, so one tab
# covers member + admin. (5173/5174 still run in compose as the shell's remotes.)
FRONTENDS=(
  "Shell (hosts both portals):http://localhost:5170"
)

# open_url <url> — best-effort cross-platform browser launch.
open_url() {
  local url="$1"
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then open "$url" >/dev/null 2>&1 &        # macOS
  elif command -v cmd.exe >/dev/null 2>&1; then cmd.exe /c start "" "$url" >/dev/null 2>&1 &  # Git Bash on Windows
  elif command -v powershell.exe >/dev/null 2>&1; then powershell.exe -NoProfile -Command "Start-Process '$url'" >/dev/null 2>&1 &
  else echo "  (open $url manually)"; fi
}

# wait_for <name> <url> — poll until the URL answers, max 90 x 2s (3 min).
wait_for() {
  local name="$1" url="$2" attempt
  for attempt in $(seq 1 90); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "  ✓ ${name} ready (${url})"
      return 0
    fi
    sleep 2
  done
  echo "  ✗ ${name} did not become ready at ${url}" >&2
  return 1
}

print_access() {
  echo "=== Access URLs ==="
  printf "  %-18s %s\n" "Shell" "http://localhost:5170"
  printf "  %-18s %s\n" "Member portal" "http://localhost:5173"
  printf "  %-18s %s\n" "Admin portal" "http://localhost:5174"
  printf "  %-18s %s\n" "Gateway GraphQL" "http://localhost:4000/graphql"
  printf "  %-18s %s\n" "Members API" "http://localhost:5080"
  printf "  %-18s %s\n" "Partners API" "http://localhost:8081"
  printf "  %-18s %s\n" "Points engine" "http://localhost:8082"
  printf "  %-18s %s\n" "Grafana" "http://localhost:3000  (admin/admin)"
  printf "  %-18s %s\n" "Prometheus" "http://localhost:9090"
  printf "  %-18s %s\n" "Jaeger" "http://localhost:16686"
}

kubernetes_stack_present() {
  command -v kubectl >/dev/null 2>&1 || return 1
  kubectl --context "$K8S_CONTEXT" --request-timeout=3s get namespace "$K8S_NAMESPACE" >/dev/null 2>&1
}

echo "=== Conflict check ==="
if kubernetes_stack_present; then
  echo "✗ Kubernetes stack '$K8S_NAMESPACE' exists on context '$K8S_CONTEXT'." >&2
  echo "  Run ./run-local-k8s.sh --delete before starting Docker Compose." >&2
  exit 1
fi
echo "  ✓ No Kubernetes stack found"
echo ""

echo "=== Building and starting the stack (docker compose up ${BUILD_FLAG:-} -d) ==="
$COMPOSE up $BUILD_FLAG -d

echo ""
echo "=== Waiting for services to come up ==="
# Gateway backs the portals; wait for it plus each static frontend host.
wait_for "gateway"       "http://localhost:4000/health"
wait_for "shell"         "http://localhost:5170"
wait_for "member portal" "http://localhost:5173"
wait_for "admin portal"  "http://localhost:5174"

echo ""
print_access

echo ""
if [ "$OPEN_BROWSER" -eq 1 ]; then
  echo "=== Opening browser (--open) ==="
  for entry in "${FRONTENDS[@]}"; do
    name="${entry%%:*}"
    url="${entry#*:}"
    echo "  → ${name}: ${url}"
    open_url "$url"
  done
else
  echo "Browser not opened by default. Use --open to launch the shell automatically."
fi

echo ""
echo "Logs : $COMPOSE logs -f"
echo "Stop : $COMPOSE down"
