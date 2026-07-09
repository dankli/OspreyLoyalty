# Runbook: High latency (p95)

**Alerts (two windows per service):**
- `*HighLatencyWarning` — p95 over the warning threshold for 10 minutes.
- `*HighLatencyCritical` — p95 over the (higher) critical threshold for 5 minutes.

| Service | Warning p95 | Critical p95 |
|---------|-------------|--------------|
| members | 300 ms | 750 ms |
| gateway | 500 ms | 1 s |
| partners | 300 ms | 750 ms |

**Defends:** the latency SLO (see [slos.md](slos.md)). Warning is an early "the
budget is starting to burn"; critical is "users feel it".

## Symptom

`{{ service }}` p95 request latency is above threshold. Pages/actions on the
affected journey feel sluggish. The two-window design means a warning without a
critical is a slow ramp worth investigating before it hurts; a critical is an
active problem.

## Likely causes

- Downstream latency: `gateway` p95 rises when `members`/`partners` slow down
  (it waits on them). Check whether the backend is also alerting.
- Data layer: slow Mongo queries or a hot collection (members); broker back-pressure (partners earn).
- Resource pressure: CPU throttling / memory pressure under load — check whether request rate climbed at the same time.
- A change that added synchronous work on the hot path.

## Diagnosis

1. **Grafana → Osprey RED**: open the service's **p95 Latency** and **Request
   Rate** panels together. Did latency rise *with* traffic (load/capacity) or
   independently (a slow dependency or a code change)?
2. **Fan-out check (gateway):** compare gateway p95 against members/partners p95.
   If a backend rose first, it is the root cause — the gateway is just waiting.
3. **Jaeger** (http://localhost:16686): open a slow trace for the service and
   read the span durations — the widest span is where the time goes (a slow DB
   call, an external hop, or the gateway's own resolver work). This is the single
   most useful step for latency.
4. **Loki** (Grafana → Osprey Logs): scan for timeouts / retry log lines in the
   window; correlate by `trace_id` with the slow trace above.

## Mitigation

- **Slow downstream:** address the backend (it should have its own latency
  alert); the gateway recovers once it does.
- **Slow query / hot collection:** identify it from the Jaeger span, add/fix the
  index or reduce the work *(illustrative — depends on the actual query)*.
- **Load-driven:** scale the service out *(illustrative — `kubectl -n osprey
  scale deploy/<svc> --replicas=N`, or add compose replicas)* and/or shed load;
  confirm request rate vs capacity on the RED dashboard.
- **Regression from a change:** roll back the change on the hot path.

## Verify recovery

p95 on the RED dashboard falls back under the threshold and the alert resolves.
Expect the **warning** to linger slightly after the **critical** clears (its
10-minute `for:` window has to re-baseline) — that is normal, not a second
incident.
