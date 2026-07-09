# Runbook: TargetDown

**Alert:** `TargetDown` — `up == 0` for a scrape target, for > 1 minute.
**Severity:** critical. **Defends:** availability of every journey through that service.

## Symptom

Prometheus cannot scrape a service's `/metrics` (or `/actuator/prometheus`)
endpoint. The `{{ job }}` label names which one (members, gateway, partners,
points-engine, security, otel-collector). If it is `gateway` or `members`, users
are likely seeing errors *right now*; if it is `otel-collector`, telemetry is
degraded but the app may be fine.

## Likely causes

- The service crashed or is crash-looping (bad deploy, unhandled exception on start, OOM).
- The service is up but not serving `/metrics` (misconfigured port / path / auth).
- A dependency at startup is unavailable (Mongo or RabbitMQ not healthy yet), so the service never becomes ready.
- Network / DNS between Prometheus and the service (wrong service name or port).

## Diagnosis

1. **Confirm scope** — Prometheus → **Status → Targets** (http://localhost:9090):
   is it one target or several? Several down at once points at shared infra
   (Mongo, RabbitMQ, the OTel collector) rather than one service.
2. **Check the container / pod:**
   - Compose: `docker compose -f infra/docker-compose.yml ps` and
     `docker compose -f infra/docker-compose.yml logs --tail=100 <service>`.
   - k8s *(illustrative)*: `kubectl -n osprey get pods`,
     `kubectl -n osprey logs deploy/<service>`,
     `kubectl -n osprey describe pod <pod>` (look for CrashLoopBackOff / OOMKilled / readiness failures).
3. **Check startup dependencies** — if members/partners are the down target,
   confirm Mongo and RabbitMQ are healthy (`docker compose ps`); the earn path
   dead-letters when RabbitMQ auth is misconfigured (see compose comments).
4. **Hit the endpoint directly** — e.g. `curl -s localhost:5080/metrics` (members)
   or `curl -s localhost:8081/actuator/prometheus` (partners) to distinguish
   "process down" from "metrics path wrong".

## Mitigation

- **Crash-loop:** read the logs, fix the cause, redeploy. If it followed a
  deploy, **roll back** to the previous image *(illustrative — the demo has no
  release pipeline; you would `docker compose up -d --build` the prior tag or
  `kubectl rollout undo`)*.
- **Dependency not ready:** restart the dependency (Mongo/RabbitMQ), then the
  service; it will re-register with Prometheus on the next scrape.
- **Metrics path/port wrong:** fix the scrape config in
  `infra/observability/prometheus.yml` (and the k8s ConfigMap) and reload.
- **Only otel-collector down:** app traffic is unaffected; restore the collector
  to recover traces/log-correlation, no user-facing action needed.

Alertmanager's inhibition rule suppresses this service's latency/error alerts
while `TargetDown` is firing (same `job`), so expect those to clear on their own
once the target is back.
