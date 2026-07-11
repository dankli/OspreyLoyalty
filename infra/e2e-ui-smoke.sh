#!/usr/bin/env bash
# Browser-level smoke for the shell + route explorer: boots the compose stack
# (auth off) and drives the explore → route search → map flow in real Chromium
# with assertions (infra/e2e-ui/smoke.mjs).
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f infra/docker-compose.yml"

cleanup() {
  status=$?
  echo ""
  echo "=== Teardown ==="
  $COMPOSE down
  exit $status
}
trap cleanup EXIT

echo "=== Boot ==="
$COMPOSE up --build -d

# wait_for <name> <url> — poll until the URL answers 2xx, max 90 x 2s (routes
# seeds ~59k edges into Neo4j on first boot, which takes 60–90 s).
wait_for() {
  local name="$1" url="$2" attempt
  for attempt in $(seq 1 90); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "✓ ${name} is up (${url})"
      return 0
    fi
    sleep 2
  done
  echo "✗ ${name} never became ready (${url})"
  return 1
}

wait_for gateway http://localhost:4000/health
wait_for routes-ready http://localhost:8083/ready
wait_for shell http://localhost:5170

echo ""
echo "=== UI smoke ==="
cd infra/e2e-ui
npm install --no-audit --no-fund
npx playwright install --with-deps chromium
BASE_URL=http://localhost:5170 node smoke.mjs
