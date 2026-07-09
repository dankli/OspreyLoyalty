#!/usr/bin/env bash
# Run every repository unit/component test suite.
# Does not start Docker Compose, Kubernetes, or the e2e smoke test.
# Members tests that require Testcontainers are skipped by default.
#
#   ./run-unit-tests.sh                       run unit/component test suites
#   ./run-unit-tests.sh --install             force npm ci before every Node/Vite suite
#   ./run-unit-tests.sh --include-integration include members Testcontainers integration tests
set -euo pipefail

cd "$(dirname "$0")"

INSTALL=0
INCLUDE_INTEGRATION=0
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    --include-integration) INCLUDE_INTEGRATION=1 ;;
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

MEMBERS_UNIT_FILTER="FullyQualifiedName!~ApplyEarnIdempotencyTests&FullyQualifiedName!~AuthTests&FullyQualifiedName!~EarnEventsAuthQueueTests&FullyQualifiedName!~EarnEventsQueueTests&FullyQualifiedName!~ExpirySweepTests&FullyQualifiedName!~MembersApiTests&FullyQualifiedName!~RedeemConcurrencyTests"
if [ "$INCLUDE_INTEGRATION" -eq 1 ]; then
  run_in "members (.NET)" "." dotnet test services/members --nologo
else
  run_in "members (.NET unit)" "." dotnet test services/members --nologo --filter "$MEMBERS_UNIT_FILTER"
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
