# Osprey runbooks & SLOs

This directory defines the service-level objectives (SLOs) for the Osprey
loyalty demo and, for every alert Prometheus can fire, a runbook: symptom →
likely cause → diagnosis → mitigation.

**Honesty note:** this is a demo. The SLO numbers below are plausible starting
points, not values measured against real traffic or negotiated with a business
owner. The error budgets are illustrative — there is no real burn-rate
accounting or paging rotation behind them. Where a diagnosis or mitigation step
would depend on production infrastructure we do not have (a real incident
channel, a deploy pipeline to roll back, an on-call), it is marked
*(illustrative)*.

- [SLOs & error budgets](slos.md)
- Runbooks:
  - [Target down](target-down.md) — a service is unreachable / not scraping
  - [High error rate](high-error-rate.md) — 5xx ratio over budget
  - [High latency](high-latency.md) — p95 over the latency SLO

## Where the signals live

| Signal | Tool | Local URL (compose) |
|--------|------|---------------------|
| Metrics / alerts | Prometheus | http://localhost:9090 (Alerts tab) |
| Alert routing | Alertmanager | http://localhost:9093 |
| Dashboards (RED) | Grafana → **Osprey RED** | http://localhost:3000 |
| Traces | Jaeger (or Grafana Jaeger datasource) | http://localhost:16686 |
| Logs | Loki (via Grafana → **Osprey Logs**) | http://localhost:3000 |

Alert definitions: [`infra/observability/alert-rules.yml`](../../infra/observability/alert-rules.yml)
(compose) and the `prometheus-alert-rules` ConfigMap in
[`infra/k8s/prometheus.yaml`](../../infra/k8s/prometheus.yaml) (Kubernetes). The
design rationale is [ADR-0013](../decisions/0013-slo-and-alerting.md).
