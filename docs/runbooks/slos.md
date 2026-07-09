# SLIs, SLOs and error budgets

Symptom-based objectives for the three user journeys that matter in the demo.
See [ADR-0013](../decisions/0013-slo-and-alerting.md) for why these are RED
(Rate / Errors / Duration) SLOs rather than resource-based ones.

**Demo caveat:** these numbers are illustrative starting points, not measured or
negotiated. The 30-day windows and error-budget maths below describe *how* you
would run this, not a real budget being tracked. Alert `for:` windows are
deliberately short (minutes) so an alert is visible within a demo session.

## User journeys and the services they cross

| Journey | What the user does | Path |
|---------|--------------------|------|
| **Earn** | A purchase earns points | partner → `partners` → RabbitMQ → `members` ledger |
| **Redeem** | Member spends points | frontend → `gateway` → `members` |
| **Dashboard** | Member views balance / history | frontend → `gateway` → `members` |

The `gateway` (GraphQL BFF) and `members` sit on the redeem and dashboard paths;
`partners` fronts earn submission. `points-engine` is off the earn path
(ADR-0006) and exposes no HTTP request histogram, so it has an availability
objective only.

## SLIs

- **Availability SLI** — fraction of requests that are *not* 5xx:
  `1 - (rate(5xx) / rate(all))` over the window, per service.
- **Latency SLI** — fraction of requests served under the per-service p95
  threshold, read as `histogram_quantile(0.95, …)` on the request-duration
  histogram.

Metric sources (already exposed — see the **Osprey RED** dashboard):

| Service | Request/duration metric | Status label |
|---------|-------------------------|--------------|
| members | `http_request_duration_seconds_*` | `code` |
| gateway | `http_request_duration_seconds_*` | `status` |
| partners | `http_server_requests_seconds_*` | `status` |

## SLOs (30-day rolling window)

| Journey / service | Availability SLO | Latency SLO (p95) |
|-------------------|------------------|-------------------|
| Redeem / dashboard (`gateway`) | 99.5% non-5xx | p95 < 500 ms |
| Redeem / dashboard (`members`) | 99.5% non-5xx | p95 < 300 ms |
| Earn (`partners`) | 99.5% non-5xx | p95 < 300 ms |
| `points-engine` (availability only) | scrape target up | — |

The gateway gets a wider latency budget than the backends because it fans out
to `members` + `partners`; its latency is the sum of theirs plus its own work.

## Error budget

A 99.5% availability SLO over 30 days allows **0.5%** of requests to fail —
roughly **3h 36m** of full downtime-equivalent per month. The budget is what
you *spend* on risky changes; when it is exhausted, the response is to stop
shipping risk and stabilise, not to raise the threshold.

*(Illustrative — the demo does not compute burn rate or track budget
consumption. A production setup would add multi-window multi-burn-rate alerts:
e.g. page if 2% of the 30-day budget burns in 1h, ticket if 10% burns in 6h.)*

## Alert → SLO mapping

| Alert | Defends | Runbook |
|-------|---------|---------|
| `TargetDown` | Availability (all journeys) | [target-down.md](target-down.md) |
| `MembersHighErrorRate` / `GatewayHighErrorRate` / `PartnersHighErrorRate` | Availability | [high-error-rate.md](high-error-rate.md) |
| `*HighLatencyWarning` / `*HighLatencyCritical` | Latency | [high-latency.md](high-latency.md) |
