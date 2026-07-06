#!/usr/bin/env bash
# End-to-end smoke test for the full compose stack.
# Boots everything, then walks the demo flow: seeded profiles, a partner
# purchase that promotes demo-erik to SILVER, the duplicate-delivery
# idempotency demo, and a GraphQL dashboard query through the gateway.
set -euo pipefail

# Run from the repo root regardless of where the script is invoked from.
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

# wait_for <name> <url> — poll until the URL answers 2xx, max 60 x 2s.
wait_for() {
  local name="$1" url="$2" attempt
  for attempt in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "✓ ${name} is up (${url})"
      return 0
    fi
    sleep 2
  done
  echo "✗ Timed out waiting for ${name} (${url})" >&2
  exit 1
}

fail() {
  echo "✗ $1" >&2
  exit 1
}

echo "=== 1. Build and start the stack ==="
$COMPOSE down --remove-orphans >/dev/null 2>&1 || true
$COMPOSE up --build -d

echo ""
echo "=== 2. Wait for services ==="
wait_for members http://localhost:5080/health
wait_for gateway http://localhost:4000/health
wait_for partners http://localhost:8081/partners
wait_for member-portal http://localhost:5173/

echo ""
echo "=== 3. Seeded data: demo-ada is SILVER ==="
ada=$(curl -fsS http://localhost:5080/api/members/demo-ada)
echo "$ada" | grep -q '"tier":"SILVER"' || fail "demo-ada is not SILVER: $ada"
echo "✓ demo-ada profile shows tier SILVER"

echo ""
echo "=== 4. Earn flow: cardco purchase promotes demo-erik ==="
# Right after boot RabbitMQ may not accept AMQP connections yet even though
# partners' HTTP endpoint answers, so retry the first publish until it lands.
posted=""
for attempt in $(seq 1 30); do
  if curl -fsS -X POST http://localhost:8081/partners/cardco/purchases \
    -H "Content-Type: application/json" \
    -d '{"memberId":"demo-erik","amount":40000}' >/dev/null 2>&1; then
    posted=1
    break
  fi
  sleep 2
done
[ -n "$posted" ] || fail "partners never accepted the purchase POST"
echo "✓ purchase accepted by partners"

earned=""
for attempt in $(seq 1 30); do
  txs=$(curl -fsS http://localhost:5080/api/members/demo-erik/transactions || true)
  if echo "$txs" | grep -q '"points":20000'; then
    earned=1
    break
  fi
  sleep 2
done
[ -n "$earned" ] || fail "earn transaction (20000 points) never appeared for demo-erik"
echo "✓ earn transaction with 20000 points landed in the ledger"

erik=$(curl -fsS http://localhost:5080/api/members/demo-erik)
echo "$erik" | grep -q '"tier":"SILVER"' || fail "demo-erik did not reach SILVER: $erik"
echo "$erik" | grep -q '"qualifyingPoints":20000' || fail "demo-erik qualifying points wrong: $erik"
echo "✓ demo-erik is SILVER with 20000 qualifying points"

echo ""
echo "=== 5. Idempotency: duplicate delivery, single ledger entry ==="
curl -fsS -X POST http://localhost:8081/partners/stayinn/purchases/duplicate-demo \
  -H "Content-Type: application/json" \
  -d '{"memberId":"demo-ada","amount":1000}' >/dev/null
echo "✓ duplicate-demo accepted (same event published twice)"

count=0
for attempt in $(seq 1 30); do
  txs=$(curl -fsS http://localhost:5080/api/members/demo-ada/transactions || true)
  count=$({ echo "$txs" | grep -o '"source":"stayinn"' || true; } | wc -l)
  if [ "$count" -ge 1 ]; then
    break
  fi
  sleep 2
done
[ "$count" -ge 1 ] || fail "stayinn transaction never appeared for demo-ada"

# Give a would-be duplicate time to arrive, then assert exactly one entry.
sleep 5
txs=$(curl -fsS http://localhost:5080/api/members/demo-ada/transactions)
count=$({ echo "$txs" | grep -o '"source":"stayinn"' || true; } | wc -l)
[ "$count" -eq 1 ] || fail "expected exactly 1 stayinn transaction, found $count"
echo "✓ exactly one stayinn transaction despite two deliveries"

echo ""
echo "=== 6. Gateway GraphQL: dashboard query ==="
gql=$(curl -fsS -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ dashboard(memberId: \"demo-erik\") { member { tier } partners { id } } }"}')
echo "$gql" | grep -q 'SILVER' || fail "dashboard did not return SILVER: $gql"
echo "$gql" | grep -q 'cardco' || fail "dashboard did not return partner cardco: $gql"
echo "✓ GraphQL dashboard returns SILVER and the cardco partner"

echo ""
echo "All e2e smoke checks passed."
