#!/usr/bin/env bash
# End-to-end smoke test for the full compose stack.
# Boots everything, then walks the demo flow: seeded profiles, a partner
# purchase that promotes demo-erik to SILVER, the duplicate-delivery
# idempotency demo, a GraphQL dashboard query through the gateway, and the
# phase 3 additions: redeem (with idempotent retry and the insufficient-points
# guard), admin adjustments, the PANDION invitation toggle, partner rate
# updates, and the micro-frontend shell + admin portal static hosts.
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
wait_for admin-portal http://localhost:5174/
wait_for shell http://localhost:5170/

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
echo "=== 7. Rewards catalog via the gateway ==="
gql=$(curl -fsS -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ rewards { id cost } }"}')
echo "$gql" | grep -q 'lounge-pass' || fail "rewards catalog missing lounge-pass: $gql"
echo "✓ GraphQL rewards catalog lists lounge-pass"

echo ""
echo "=== 8. Redeem via the gateway: demo-yusra burns a lounge pass ==="
redeem_query='{"query":"mutation { redeem(memberId: \"demo-yusra\", rewardId: \"lounge-pass\", idempotencyKey: \"e2e-redeem-0001\") { spendablePoints alreadyApplied } }"}'
gql=$(curl -fsS -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d "$redeem_query")
echo "$gql" | grep -q '"spendablePoints":36000' || fail "redeem did not leave 36000 spendable: $gql"
echo "$gql" | grep -q '"alreadyApplied":false' || fail "first redeem reported alreadyApplied: $gql"
echo "✓ redeem burned 15000 points (51000 -> 36000, alreadyApplied false)"

echo ""
echo "=== 9. Redeem idempotency: same key, no second burn ==="
gql=$(curl -fsS -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d "$redeem_query")
echo "$gql" | grep -q '"alreadyApplied":true' || fail "retried redeem did not report alreadyApplied: $gql"
echo "$gql" | grep -q '"spendablePoints":36000' || fail "retried redeem changed the balance: $gql"

txs=$(curl -fsS http://localhost:5080/api/members/demo-yusra/transactions)
count=$({ echo "$txs" | grep -o '"source":"lounge-pass"' || true; } | wc -l)
[ "$count" -eq 1 ] || fail "expected exactly 1 lounge-pass burn for demo-yusra, found $count"
echo "✓ retried redeem is a no-op: alreadyApplied true, exactly one lounge-pass burn"

echo ""
echo "=== 10. Redeem guard: demo-erik cannot afford the upgrade voucher ==="
# After the earn above demo-erik holds ~24200 spendable — the 30000 voucher must be refused.
gql=$(curl -fsS -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { redeem(memberId: \"demo-erik\", rewardId: \"upgrade-voucher\", idempotencyKey: \"e2e-redeem-0002\") { spendablePoints } }"}')
echo "$gql" | grep -q 'Insufficient spendable points' || fail "underfunded redeem was not refused: $gql"
echo "✓ underfunded redeem refused with 'Insufficient spendable points'"

echo ""
echo "=== 11. Admin adjustment: +1000 goodwill for demo-erik ==="
curl -fsS -X POST http://localhost:5080/api/members/demo-erik/adjustments \
  -H "Content-Type: application/json" \
  -d '{"points":1000,"reason":"e2e goodwill","idempotencyKey":"e2e-adjust-0001"}' >/dev/null
txs=$(curl -fsS http://localhost:5080/api/members/demo-erik/transactions)
echo "$txs" | grep -q '"type":"adjustment"' || fail "adjustment transaction missing: $txs"
echo "$txs" | grep -q '"source":"admin: e2e goodwill"' || fail "adjustment source wrong: $txs"
echo "✓ adjustment landed in the ledger with source 'admin: e2e goodwill'"

echo ""
echo "=== 12. PANDION invitation toggle on demo-erik ==="
profile=$(curl -fsS -X PUT http://localhost:5080/api/members/demo-erik/pandion \
  -H "Content-Type: application/json" -d '{"invited":true}')
echo "$profile" | grep -q '"tier":"PANDION"' || fail "invitation did not make demo-erik PANDION: $profile"
profile=$(curl -fsS -X PUT http://localhost:5080/api/members/demo-erik/pandion \
  -H "Content-Type: application/json" -d '{"invited":false}')
echo "$profile" | grep -q '"tier":"SILVER"' || fail "revoking the invitation did not restore SILVER: $profile"
echo "✓ invitation flag flips demo-erik to PANDION and back to points-based SILVER"

echo ""
echo "=== 13. Partner rate update ==="
curl -fsS -X PUT http://localhost:8081/partners/wheelsgo/rate \
  -H "Content-Type: application/json" -d '{"rate":2.5}' >/dev/null
partners=$(curl -fsS http://localhost:8081/partners)
echo "$partners" | grep -q '"rate":2.5' || fail "wheelsgo rate not updated to 2.5: $partners"
echo "✓ wheelsgo earn rate updated to 2.5"

echo ""
echo "=== 14. Static frontends: admin portal, shell, federation contract ==="
admin_html=$(curl -fsS http://localhost:5174/)
echo "$admin_html" | grep -q 'Osprey Loyalty' || fail "admin portal HTML missing the title: $admin_html"
curl -fsS http://localhost:5170/ >/dev/null || fail "shell did not answer on :5170"
echo "✓ admin portal and shell serve their HTML"

# The shell imports each portal's remoteEntry.js in the browser (ADR-0004);
# if either 404s, module federation is broken even though the pages load.
curl -fsS http://localhost:5173/assets/remoteEntry.js >/dev/null \
  || fail "member-portal remoteEntry.js not served"
curl -fsS http://localhost:5174/assets/remoteEntry.js >/dev/null \
  || fail "admin-portal remoteEntry.js not served"
echo "✓ both portals serve /assets/remoteEntry.js — the federation contract holds"

echo ""
echo "All e2e smoke checks passed."
