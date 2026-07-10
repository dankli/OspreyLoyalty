#!/usr/bin/env bash
# Run every repository unit/component test suite.
# Does not start Docker Compose, Kubernetes, or the e2e smoke test.
# Members integration tests (Testcontainers) run by default when Docker is available.
#
#   ./run-unit-tests.sh                    run unit/component suites (+ integration if Docker is up)
#   ./run-unit-tests.sh --install          force npm ci before every Node/Vite suite
#   ./run-unit-tests.sh --skip-integration force members unit-only (skip Testcontainers suites)
set -euo pipefail

cd "$(dirname "$0")"

INSTALL=0
SKIP_INTEGRATION=0
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    --skip-integration) SKIP_INTEGRATION=1 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ '$1' is not on PATH." >&2; exit 1; }
}

step() {
  local name="$1"
  shift
  echo ""
  echo "━━ $name ━━"
  "$@"
}

run_in() {
  local name="$1" dir="$2"
  shift 2
  step "$name" bash -c "cd \"\$1\" && shift && \"\$@\"" bash "$dir" "$@"
}

npm_tests() {
  local name="$1" dir="$2"
  if [ "$INSTALL" -eq 1 ] || [ ! -d "$dir/node_modules" ]; then
    run_in "$name dependencies" "$dir" npm ci
  else
    echo ""
    echo "━━ $name dependencies ━━"
    echo "node_modules present; skipping npm ci (use --install to force)."
  fi
  run_in "$name tests" "$dir" npm test
}

require dotnet
require npm
require java
require cargo

echo "Osprey Loyalty unit/component test suites"

# The members Testcontainers suites hold the showcase distributed-correctness invariants
# (idempotency/duplicate-delivery, redemption concurrency, expiry sweep, HTTP API, queue, auth).
# They run BY DEFAULT when Docker is available so the headline command actually exercises them;
# skipped (with a visible warning) only when Docker is down or --skip-integration is passed.
MEMBERS_UNIT_FILTER="FullyQualifiedName!~ApplyEarnIdempotencyTests&FullyQualifiedName!~AuthTests&FullyQualifiedName!~EarnEventsAuthQueueTests&FullyQualifiedName!~EarnEventsQueueTests&FullyQualifiedName!~ExpirySweepTests&FullyQualifiedName!~MembersApiTests&FullyQualifiedName!~RedeemConcurrencyTests"
DOCKER_OK=0
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then DOCKER_OK=1; fi
if [ "$SKIP_INTEGRATION" -eq 1 ]; then
  echo "Skipping members integration tests (--skip-integration)."
  run_in "members (.NET unit only)" "." dotnet test services/members --nologo --filter "$MEMBERS_UNIT_FILTER"
elif [ "$DOCKER_OK" -eq 0 ]; then
  echo "⚠ Docker not available — SKIPPING members integration tests (idempotency, redemption concurrency, expiry sweep, API, queue, auth). Start Docker to run them."
  run_in "members (.NET unit only)" "." dotnet test services/members --nologo --filter "$MEMBERS_UNIT_FILTER"
else
  run_in "members (.NET, incl. integration)" "." dotnet test services/members --nologo
fi
npm_tests "gateway (Node/TypeScript)" "services/gateway"
run_in "partners (Spring Boot)" "services/partners" ./mvnw -q test
run_in "security (Spring Boot)" "services/security" ./mvnw -q test
run_in "points-engine (Rust)" "services/points-engine" cargo test
npm_tests "member-portal (React/Vite)" "frontends/member-portal"
npm_tests "admin-portal (Vue/Vite)" "frontends/admin-portal"
npm_tests "shell (Vite)" "frontends/shell"

echo ""
echo "All unit/component test suites passed."
