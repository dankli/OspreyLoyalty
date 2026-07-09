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
wait_for prometheus http://localhost:9090/-/ready
wait_for grafana http://localhost:3000/api/health
wait_for points-engine http://localhost:8082/health

# ── Opt-in zero-trust check (auth is OFF by default, so the flow below needs no tokens) ──
# When the stack is brought up with auth ON across the services (AUTH_ENABLED=true — see
# ADR-0007), set AUTH_ENABLED=true for this script too: it fetches a service token from the
# identity service and proves a protected endpoint rejects anonymous calls but accepts the
# token. Admin flows (adjustments, rate updates) need a user login (authorization code + PKCE,
# a browser flow), so the demo-flow sections below deliberately assume auth OFF.
if [ "${AUTH_ENABLED:-}" = "true" ]; then
  echo ""
  echo "=== 2b. Zero-trust: token issuance and 401/200 (auth on) ==="
  wait_for security http://localhost:9000/.well-known/openid-configuration
  token=$(curl -fsS -X POST http://localhost:9000/oauth2/token \
    -u partners-service:partners-secret \
    -d 'grant_type=client_credentials&scope=member' \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  [ -n "$token" ] || fail "identity service did not issue a client-credentials token"
  echo "✓ identity service issued an access token"

  anon_code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5080/api/members/demo-ada)
  [ "$anon_code" = "401" ] || fail "expected 401 without a token, got $anon_code"
  echo "✓ members rejects an anonymous request (401)"

  auth_code=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $token" http://localhost:5080/api/members/demo-ada)
  [ "$auth_code" = "200" ] || fail "expected 200 with a token, got $auth_code"
  echo "✓ members accepts the bearer token (200)"
fi

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
members_earn_points=""
for attempt in $(seq 1 30); do
  txs=$(curl -fsS http://localhost:5080/api/members/demo-erik/transactions || true)
  if echo "$txs" | grep -q '"points":20000'; then
    earned=1
    # Captured for the points-engine parity check (ADR-0006) in section 19.
    members_earn_points=$(echo "$txs" | grep -o '"points":[0-9]*' | head -1 | cut -d: -f2)
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
echo "=== 15. Metrics endpoints ==="
# Capture first, grep second: `curl | grep -q` under pipefail dies with SIGPIPE (exit 23)
# when grep closes the pipe early on a body larger than the pipe buffer.
members_metrics=$(curl -sf http://localhost:5080/metrics) || fail "members /metrics unreachable"
grep -q 'http_request_duration_seconds' <<<"$members_metrics" \
  || fail "members /metrics missing http_request_duration_seconds"
echo "✓ members /metrics exposes http_request_duration_seconds"

gateway_metrics=$(curl -sf http://localhost:4000/metrics) || fail "gateway /metrics unreachable"
grep -q 'http_request_duration_seconds' <<<"$gateway_metrics" \
  || fail "gateway /metrics missing http_request_duration_seconds"
echo "✓ gateway /metrics exposes http_request_duration_seconds"

partners_metrics=$(curl -sf http://localhost:8081/actuator/prometheus) || fail "partners metrics unreachable"
grep -q 'http_server_requests_seconds' <<<"$partners_metrics" \
  || fail "partners /actuator/prometheus missing http_server_requests_seconds"
echo "✓ partners /actuator/prometheus exposes http_server_requests_seconds"

echo ""
echo "=== 16. Correlation-Id echo ==="
curl -si -H "X-Correlation-Id: e2e-corr-0001" http://localhost:4000/health \
  | grep -qi "x-correlation-id: e2e-corr-0001" \
  || fail "gateway did not echo X-Correlation-Id"
echo "✓ gateway echoes X-Correlation-Id: e2e-corr-0001"

curl -si -H "X-Correlation-Id: e2e-corr-0001" http://localhost:5080/health \
  | grep -qi "x-correlation-id: e2e-corr-0001" \
  || fail "members did not echo X-Correlation-Id"
echo "✓ members echoes X-Correlation-Id: e2e-corr-0001"

echo ""
echo "=== 17. Prometheus targets healthy ==="
prom_up=""
for attempt in $(seq 1 30); do
  up_count=$(curl -s http://localhost:9090/api/v1/targets \
    | grep -o '"health":"up"' | wc -l)
  if [ "$up_count" -ge 3 ]; then
    prom_up=1
    break
  fi
  sleep 2
done
[ -n "$prom_up" ] || fail "Prometheus does not have >= 3 targets in state 'up'"
echo "✓ Prometheus has >= 3 targets in state 'up'"

echo ""
echo "=== 18. Grafana dashboard provisioned ==="
grafana_ok=""
for attempt in $(seq 1 30); do
  dash=$(curl -s -u admin:admin http://localhost:3000/api/dashboards/uid/osprey-red || true)
  if echo "$dash" | grep -q '"uid":"osprey-red"'; then
    grafana_ok=1
    break
  fi
  sleep 2
done
[ -n "$grafana_ok" ] || fail "Grafana dashboard 'osprey-red' not found"
echo "✓ Grafana dashboard uid osprey-red is provisioned"

echo ""
echo "=== 19. Points-engine: calculate, parity, promotion, bounds, correlation ==="

# Base calculation: 40000 × 0.5, no promotions → 20000 points.
pe_calc=$(curl -fsS -X POST http://localhost:8082/calculate \
  -H "Content-Type: application/json" \
  -d '{"amount": 40000, "rate": 0.5, "promotions": []}')
echo "$pe_calc" | grep -q '"points":20000' \
  || fail "points-engine base calc did not return 20000: $pe_calc"
echo "✓ points-engine: 40000 × 0.5 → 20000 points"

# Parity contract (ADR-0006): the engine's no-promotion result must equal what
# members' ApplyEarn produced for the same input earlier in this script — compared
# against the LIVE value captured from demo-erik's ledger, not a literal.
pe_points=$(echo "$pe_calc" | grep -o '"points":[0-9]*' | grep -o '[0-9]*$')
[ -n "$members_earn_points" ] || fail "parity check has no captured members earn value"
[ "$pe_points" = "$members_earn_points" ] \
  || fail "parity breach (ADR-0006): engine returned $pe_points, members ledger shows $members_earn_points"
echo "✓ parity (ADR-0006): engine result $pe_points equals members' ledger earn ($members_earn_points) for 40000 × 0.5"

# Promotion: 1000 × 0.5 × 2.0 multiplier → 1000 points.
pe_promo=$(curl -fsS -X POST http://localhost:8082/calculate \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000, "rate": 0.5, "promotions": [{"multiplier": 2.0}]}')
echo "$pe_promo" | grep -q '"points":1000' \
  || fail "points-engine promotion calc did not return 1000: $pe_promo"
echo "✓ points-engine: 1000 × 0.5 × 2.0 → 1000 points"

# Bounds: rate 11 exceeds the allowed maximum → HTTP 400.
pe_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8082/calculate \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000, "rate": 11, "promotions": []}')
[ "$pe_status" = "400" ] \
  || fail "points-engine bounds check: expected 400, got $pe_status"
echo "✓ points-engine: rate 11 rejected with HTTP 400"

# Correlation-Id echo.
pe_corr_resp=$(curl -si -H "X-Correlation-Id: e2e-corr-pe-001" \
  http://localhost:8082/health)
echo "$pe_corr_resp" | grep -qi "x-correlation-id: e2e-corr-pe-001" \
  || fail "points-engine did not echo X-Correlation-Id"
echo "✓ points-engine echoes X-Correlation-Id: e2e-corr-pe-001"

echo ""
echo "All e2e smoke checks passed."
