# ADR-0013: SLOs and symptom-based alerting with Prometheus + Alertmanager

**Status:** accepted

## Context

By ADR-0008 the stack has the three observability signals — metrics (Prometheus
+ a RED Grafana dashboard), traces (Jaeger) and logs (Loki). That is enough to
*investigate* a problem, but nothing yet *tells you* there is one, and there is
no written statement of how good "good enough" is. An enterprise-shaped demo
should be able to say, for its key user journeys, what availability and latency
it targets, and should page (or in a demo, "page") when those targets are at
risk — without a human watching a dashboard.

We wanted to add that top layer: service-level objectives for the earn, redeem
and dashboard journeys, and alerting that fires on user-visible symptoms, routed
through an Alertmanager, with a runbook for each alert.

## Decision

**Define RED SLOs for the key journeys and alert on symptoms, not causes.**
`docs/runbooks/slos.md` states an availability SLO (fraction of non-5xx
responses) and a latency SLO (p95) per service on the earn/redeem/dashboard
paths, plus an error-budget framing. Alerts fire on the *symptoms* a user feels
— high 5xx ratio (Errors), high p95 (Duration), and target-down (availability) —
using the metrics the services already expose:

- members + gateway: `http_request_duration_seconds_*`
  (members labels status as `code`, gateway as `status`).
- partners: `http_server_requests_seconds_*`.
- points-engine has `/metrics` but no HTTP request histogram (Rust, off the earn
  path per ADR-0006), so it gets a target-down alert only.

Rules live in `infra/observability/alert-rules.yml` (compose) and, mirrored, in
the `prometheus-alert-rules` ConfigMap in `infra/k8s/prometheus.yaml` (k8s).

**Alertmanager as the routing layer.** Prometheus pushes firing alerts to a new
Alertmanager service. Its route sends critical alerts to a placeholder webhook
receiver and warnings to a null receiver, with one inhibition rule: a
`TargetDown` for a service suppresses that same service's latency/error alerts,
because those are downstream symptoms of the outage, not independent incidents.

**Why symptom-based (RED) over cause-based.** Cause-based alerts (high CPU, GC
pauses, queue depth, low free memory) generate noise: most fire when nothing is
actually wrong for a user, and they multiply as the system grows. Symptom-based
alerting on Rate/Errors/Duration keeps the alert set small and every alert
actionable — it fires when a user is being hurt — and the three existing signals
are exactly the tools to find the *cause* once an alert points you at the *what*.
Each alert annotation carries a `runbook:` path to that investigation.

**A light nod to multi-window alerting.** Latency has a fast "warning" window and
a slower, higher "critical" window per service, so a slow ramp is visible before
it becomes user-facing. This is deliberately not a full multi-burn-rate model.

## Alternatives considered

**Cause-based / resource alerts (CPU, memory, GC, queue depth).** Rejected as the
primary signal for the noise reasons above; they belong on dashboards for
diagnosis, not as pagers. Symptom-based alerting is the Google SRE default.

**Full multi-window multi-burn-rate error-budget alerting.** The rigorous
approach (page if X% of the budget burns in 1h, ticket if Y% in 6h). It is the
right answer for a real service but is overkill to compute and tune for a demo
with synthetic traffic; the runbook documents it as the production next step.

**Skip Alertmanager, alert straight from Prometheus.** Prometheus can evaluate
rules but not route/group/inhibit/silence — Alertmanager is the standard piece
for that, and demonstrating the routing + inhibition semantics is part of the
enterprise pattern, so it is worth one container.

## Consequences

- One new container/pod: `alertmanager` (compose service + `infra/k8s/alertmanager.yaml`).
  Prometheus gains `rule_files` + an `alerting` block in both environments and mounts the rules.
- Alert thresholds and `for:` windows are demo-tuned and short (minutes) so
  alerts are visible within a demo session; they are not derived from measured
  traffic or a negotiated budget. The runbooks say so.
- No real notification path: the webhook receiver points at a placeholder URL and
  nobody is paged. Swapping in Slack/PagerDuty/email is a config-only change in `alertmanager.yml`.
- The alert rules exist twice (compose file + k8s ConfigMap) and are kept in sync
  by hand; a production setup would generate both from one source.
- SLI/SLO definitions and per-alert runbooks live under `docs/runbooks/`, giving
  the demo an on-call-shaped story: an alert links to a runbook that names the
  Grafana dashboard, Loki query and Jaeger trace to open.
