// Osprey Loyalty — k6 soak test
//
// A longer, lower-rate variant of smoke.js. Where the smoke test asks "does a
// burst pass the SLOs right now?", the soak test asks "does the stack stay
// healthy under sustained, modest load?" — the shape that surfaces slow leaks:
// growing ledgers, connection-pool exhaustion, RabbitMQ backlog, GC pressure.
//
// It reuses the same journey functions as the smoke test (single source of
// truth for request shapes) and only changes the load model and thresholds.
//
// Durations are env-overridable and SHORT by default so `k6 run soak.js` is
// safe to run ad hoc. For a real soak, bump DURATION, e.g.:
//   k6 run -e DURATION=30m -e RATE=10 infra/load/soak.js
//
// Base URLs and per-journey logic are imported from smoke.js — see that file
// for the endpoint/payload rationale and __ENV overrides.

import { sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { earn, redeem, read } from './smoke.js';

// Sustained arrival rate (iterations/sec) and how long to hold it.
const RATE = Number(__ENV.RATE || 5);
const DURATION = __ENV.DURATION || '2m';
const PRE_VUS = Number(__ENV.PRE_VUS || 10);
const MAX_VUS = Number(__ENV.MAX_VUS || 50);

export const options = {
  scenarios: {
    // constant-arrival-rate keeps a steady request pressure regardless of how
    // fast the system responds — the right model for a soak, because it does
    // NOT back off when latency climbs (which is exactly what closed-model VUs
    // would do, masking a degradation).
    soak: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_VUS,
      maxVUs: MAX_VUS,
    },
  },

  // Soak SLOs are the same shape as the smoke gates but a touch stricter on the
  // error budget — a sustained run should not accumulate errors over time.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    earn_errors: ['rate<0.01'],
    redeem_errors: ['rate<0.05'],
    read_errors: ['rate<0.01'],
    earn_latency: ['p(95)<800'],
    redeem_latency: ['p(95)<1000'],
    read_latency: ['p(95)<500'],
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
  },
};

// Same journey mix as the smoke test, minimal think time (the arrival-rate
// executor governs pacing, not sleep).
export default function () {
  read();
  if (randomIntBetween(1, 3) === 1) {
    earn();
  }
  if (randomIntBetween(1, 5) === 1) {
    redeem();
  }
  sleep(0.1);
}
