// Osprey Loyalty — k6 smoke / load test
//
// Exercises the three real user journeys against the running compose stack:
//   1. Earn    — POST a partner purchase (partners service, RabbitMQ-backed).
//   2. Redeem  — GraphQL `redeem` mutation through the gateway BFF.
//   3. Read    — GraphQL `dashboard` query through the gateway AND a members
//                profile GET (the two read paths a member portal actually hits).
//
// The request shapes below are copied from infra/e2e-smoke.sh so the load
// mirrors the demo flow rather than a synthetic endpoint.
//
// Base URLs are parameterised via __ENV with localhost defaults matching the
// docker-compose port mappings. Override for a clustered target, e.g.:
//   k6 run -e GATEWAY_URL=http://api.osprey.localtest.me \
//          -e PARTNERS_URL=http://partners.osprey.localtest.me \
//          -e MEMBERS_URL=http://members.osprey.localtest.me infra/load/smoke.js
//
// Thresholds act as SLO-style pass/fail gates: the run exits non-zero if p95
// latency or the error rate breaches them, so CI (and a human) get a verdict,
// not just a graph.

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Targets (localhost defaults match infra/docker-compose.yml) ──
const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:4000';
const PARTNERS_URL = __ENV.PARTNERS_URL || 'http://localhost:8081';
const MEMBERS_URL = __ENV.MEMBERS_URL || 'http://localhost:5080';

// Seeded demo members (see services/members demo seed). We spread earns across
// a few members so we are not hammering a single ledger document.
const EARN_MEMBERS = ['demo-erik', 'demo-ada', 'demo-yusra'];
const PARTNER = __ENV.PARTNER || 'cardco';

// Load shape is env-overridable but SHORT by default so a smoke run is quick.
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || '30s';

// ── Custom metrics: split latency per journey so a slow redeem does not hide
//    behind a fast health read in the aggregate p95. ──
const earnErrors = new Rate('earn_errors');
const redeemErrors = new Rate('redeem_errors');
const readErrors = new Rate('read_errors');
const earnLatency = new Trend('earn_latency', true);
const redeemLatency = new Trend('redeem_latency', true);
const readLatency = new Trend('read_latency', true);

export const options = {
  // Default scenario: a constant pool of VUs walking the journey for DURATION.
  // The soak scenario lives in soak.js; keep this one lean.
  vus: VUS,
  duration: DURATION,

  // SLO-style gates. A breach fails the run (non-zero exit) — see README.
  thresholds: {
    // Overall HTTP error rate must stay under 1%.
    http_req_failed: ['rate<0.01'],

    // Per-journey error budgets (custom Rate metrics).
    earn_errors: ['rate<0.01'],
    redeem_errors: ['rate<0.05'], // redeem can legitimately refuse (insufficient points); see note below
    read_errors: ['rate<0.01'],

    // Per-journey latency SLOs. Writes (earn/redeem) get more headroom than
    // reads because they cross a service hop (and, for earn, a broker publish).
    earn_latency: ['p(95)<800'],
    redeem_latency: ['p(95)<1000'],
    read_latency: ['p(95)<500'],

    // A coarse overall p95 as a backstop.
    http_req_duration: ['p(95)<1000'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ── Journey 1: earn — a partner purchase ──
// Mirrors: POST http://localhost:8081/partners/cardco/purchases
//          {"memberId":"demo-erik","amount":40000}
export function earn() {
  group('earn', () => {
    const memberId = EARN_MEMBERS[randomIntBetween(0, EARN_MEMBERS.length - 1)];
    const body = JSON.stringify({ memberId, amount: randomIntBetween(1000, 40000) });
    const res = http.post(`${PARTNERS_URL}/partners/${PARTNER}/purchases`, body, {
      headers: JSON_HEADERS,
      tags: { journey: 'earn' },
    });
    const ok = check(res, {
      'earn: status is 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    earnErrors.add(!ok);
    earnLatency.add(res.timings.duration);
  });
}

// ── Journey 2: redeem — GraphQL mutation through the gateway ──
// Mirrors the e2e redeem mutation. Each iteration uses a fresh idempotency key
// so it is a real burn attempt (a repeated key would be a no-op and not
// representative of write load). The reward is a low-cost one so most members
// can afford it; a refusal ("Insufficient spendable points") is a valid
// business outcome, not a transport error — hence the wider redeem error budget.
export function redeem() {
  group('redeem', () => {
    const memberId = EARN_MEMBERS[randomIntBetween(0, EARN_MEMBERS.length - 1)];
    const idempotencyKey = `k6-${__VU}-${__ITER}-${Date.now()}`;
    const query =
      'mutation ($m: String!, $r: String!, $k: String!) {' +
      ' redeem(memberId: $m, rewardId: $r, idempotencyKey: $k)' +
      ' { spendablePoints alreadyApplied } }';
    const body = JSON.stringify({
      query,
      variables: { m: memberId, r: __ENV.REWARD_ID || 'lounge-pass', k: idempotencyKey },
    });
    const res = http.post(`${GATEWAY_URL}/graphql`, body, {
      headers: JSON_HEADERS,
      tags: { journey: 'redeem' },
    });
    // Transport-level success = 200 with a JSON body. GraphQL "errors" for a
    // business refusal still come back 200; we only count transport failures
    // and 5xx toward the redeem error budget.
    const ok = check(res, {
      'redeem: status is 200': (r) => r.status === 200,
      'redeem: has body': (r) => !!r.body && r.body.length > 0,
    });
    redeemErrors.add(!ok);
    redeemLatency.add(res.timings.duration);
  });
}

// ── Journey 3: read — dashboard (GraphQL) + members profile (REST) ──
// Mirrors: gateway `{ dashboard(memberId) { member { tier } partners { id } } }`
//          and GET http://localhost:5080/api/members/<id>
export function read() {
  group('read', () => {
    const memberId = EARN_MEMBERS[randomIntBetween(0, EARN_MEMBERS.length - 1)];

    const dashQuery =
      '{ dashboard(memberId: "' + memberId + '") { member { tier } partners { id } } }';
    const dashRes = http.post(`${GATEWAY_URL}/graphql`, JSON.stringify({ query: dashQuery }), {
      headers: JSON_HEADERS,
      tags: { journey: 'read', op: 'dashboard' },
    });
    const dashOk = check(dashRes, {
      'dashboard: status is 200': (r) => r.status === 200,
      'dashboard: returns a tier': (r) => !!r.body && r.body.indexOf('tier') !== -1,
    });
    readErrors.add(!dashOk);
    readLatency.add(dashRes.timings.duration);

    const profileRes = http.get(`${MEMBERS_URL}/api/members/${memberId}`, {
      tags: { journey: 'read', op: 'profile' },
    });
    const profileOk = check(profileRes, {
      'profile: status is 200': (r) => r.status === 200,
    });
    readErrors.add(!profileOk);
    readLatency.add(profileRes.timings.duration);
  });
}

// Each VU iteration walks a realistic mix: read-heavy, with earns and redeems
// mixed in — closer to a real portal than an even 1:1:1 split.
export default function () {
  read();
  if (randomIntBetween(1, 3) === 1) {
    earn();
  }
  if (randomIntBetween(1, 5) === 1) {
    redeem();
  }
  sleep(randomIntBetween(1, 3) / 10); // 0.1–0.3s think time
}
