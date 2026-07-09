# Runbook: High error rate (5xx ratio)

**Alerts:** `MembersHighErrorRate`, `GatewayHighErrorRate`, `PartnersHighErrorRate`
— 5xx responses > 5% of all responses for that service, for 5 minutes.
**Severity:** critical. **Defends:** the availability SLO (99.5% non-5xx).

## Symptom

A meaningful fraction of requests to `{{ service }}` are failing with 5xx. Users
on the affected journey (redeem/dashboard for gateway+members, earn for
partners) get errors. Because it is a *ratio*, this fires the same at 10 req/s or
1000 req/s — but at very low traffic a couple of errors can trip it, so always
confirm the absolute request rate too.

## Likely causes

- A downstream dependency is failing: `gateway` 5xx often means `members` or
  `partners` is erroring or timing out — check those first.
- Unhandled exceptions after a code/config change.
- Data-layer failure: Mongo unavailable / slow (members), RabbitMQ rejecting
  publishes (partners earn path).
- Auth misconfiguration: if `AUTH_ENABLED=true` without a matching shared
  secret, earn hops dead-letter and calls fail (see compose comments, ADR-0007).

## Diagnosis

1. **Grafana → Osprey RED** (http://localhost:3000): open the affected service's
   **Error Rate (5xx)** and **Request Rate** panels. Confirm the ratio is real
   and not one stray error at trickle traffic. Note when it started.
2. **Is it this service or a downstream?** If `gateway` is alerting, check the
   `members` and `partners` error panels — a gateway spike with a members spike
   underneath means members is the root cause; fix that and the gateway clears.
3. **Loki (Grafana → Osprey Logs)** — filter to the service and level=error over
   the same window, e.g. `{compose_service="members"} |= "error"`. Read the
   exception / status line; group by message to find the dominant failure.
4. **Jaeger** (http://localhost:16686) — find a failing trace for the service and
   follow the span that errored; the `trace_id` in the Loki lines links across.
   This shows *where* in the call chain the 5xx originates.
5. **Recent change?** Correlate the start time with any deploy/config change.

## Mitigation

- **Bad deploy:** roll back to the last good version *(illustrative — see
  target-down.md for the demo's rollback caveat)*.
- **Downstream dependency down:** treat the downstream as the incident (its own
  TargetDown / error-rate alert should be firing); recover it, and the ratio
  recovers upstream.
- **Mongo/RabbitMQ issue:** restart / restore the dependency; for the earn path,
  verify the `AUTH_SHARED_SECRET` pairing before re-enabling auth.
- **Auth misconfig:** align members' `Auth__TestSigningKey` and partners'
  `AUTH_SERVICE_TOKEN_SECRET` (same value) or set `AUTH_ENABLED=false` for the demo.

## Verify recovery

The 5xx ratio on the RED dashboard drops back under 5% and the alert resolves in
Prometheus (**Alerts** tab) and Alertmanager within one evaluation window.
