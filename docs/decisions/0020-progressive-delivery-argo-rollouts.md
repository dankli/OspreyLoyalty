# ADR-0020: Progressive delivery with Argo Rollouts (canary + automatic rollback)

**Status:** accepted

## Context

The base stack ships new versions with Kubernetes' default rolling update: pods are
replaced in place, all traffic moves to the new version as it comes up, and the only gate
is the readiness probe. A readiness probe answers "is the process listening?" — not "is
this version actually healthy for users?". A build that starts fine but returns 5xx or is
slow under real traffic reaches 100% of users before anyone notices, and rolling back is a
manual scramble.

ADR-0013 already gave us the signal that would catch such a bad version: RED SLOs on the
gateway (`http_request_duration_seconds_*`, `status` label) scraped by Prometheus. What was
missing was a release mechanism that *consults* that signal automatically and stops a bad
rollout before it hurts everyone.

## Decision

**Adopt Argo Rollouts for the gateway with a canary strategy gated by Prometheus
analysis and automatic rollback.**

- A `Rollout` (`infra/delivery/gateway-rollout.yaml`) replaces the base gateway Deployment
  during the demo. Its pod template is a faithful copy of `infra/k8s/gateway.yaml`; only
  the deploy strategy differs. New versions roll out in steps — **weight 20 → 40 → 60 → 80
  → 100 %** — with a `pause` between steps.
- A Prometheus `AnalysisTemplate` (`infra/delivery/gateway-analysistemplate.yaml`) runs in
  the background from the first canary step and queries in-cluster Prometheus for gateway
  **success-rate** (non-5xx ratio, must stay `>= 0.95`) and **p95 latency** (must stay
  `<= 1.0s`) over a 2m window. These thresholds deliberately mirror the
  `GatewayHighErrorRate` (5% budget) and `GatewayHighLatencyCritical` (1s p95) alerts from
  ADR-0013 — **the canary is judged by the exact symptoms an operator would be paged on.**
  If either metric breaches for enough measurements, the `AnalysisRun` fails, the Rollout
  aborts, and traffic snaps back to 100% stable — **automatic rollback**.
- **Traffic is split at Traefik**, the ingress already on the request path (ADR-0011). A
  weighted `TraefikService` (`gateway-stable` + `gateway-canary`) has its two weights
  rewritten by the Rollouts controller at each step, and a Traefik `IngressRoute` sends
  `api.osprey.localtest.me` at that TraefikService, so the split applies to real requests
  — not just pod counts.

**Why the gateway as the representative service.** It sits on the request path behind
Traefik — every frontend journey routes through `api.osprey.localtest.me` — so a weighted
split is real and observable, and it already exposes the RED histogram the analysis needs.
The pattern generalises: members and partners expose equivalent histograms (ADR-0013) and
would get their own Rollout + AnalysisTemplate the same way; the gateway is the clearest
single showcase, not a special case.

**Why symptom-driven canary analysis.** Reusing the Fas 2 SLO/RED metrics means the
release gate and the alerting gate agree on what "healthy" means. The same 5xx-ratio and
p95 that page an on-call after the fact are what block a bad version *before* it lands. No
new metrics, no synthetic canary probe that can disagree with production reality.

## Alternatives considered

**Plain Kubernetes rolling update (status quo).** No traffic-percentage control, no
metric-based gate, no automatic rollback — exactly the gap this ADR closes.

**Flagger instead of Argo Rollouts.** Flagger is a strong canary controller and also
integrates with Traefik + Prometheus. Argo Rollouts was chosen for same-project
consistency with ArgoCD (ADR-0019), its `kubectl argo rollouts` UX/dashboard for the demo,
and the first-class `Rollout` object.

**Service-mesh traffic splitting (Istio/Linkerd SMI).** More powerful routing (header/
mirroring), but a mesh is a large dependency to add to a local demo. Traefik is already the
ingress and Argo Rollouts supports it natively, so the split rides on infrastructure that
is already there.

**Blue/green instead of canary.** Simpler to reason about (flip 0→100), but it exposes the
new version to *all* traffic at cutover and gives the analysis no gradual, low-blast-radius
window. Canary with stepped weights is the better fit for metric-gated rollout.

## Consequences

- New directory `infra/delivery/` (Rollout, stable/canary Services + weighted
  TraefikService, AnalysisTemplate, canary IngressRoute, README). No application code; no
  change to `infra/k8s/gateway.yaml` — the base Deployment stays the always-on path and
  keeps `kubeconform -strict` green.
- Running the canary means scaling the base gateway Deployment to 0 and applying the
  Rollout (they both own `app: gateway` pods, so only one runs at a time); the README has
  the exact steps and the return path.
- **ArgoCD interaction:** if ArgoCD (ADR-0019) manages `infra/k8s`, its self-heal will try
  to scale the base gateway Deployment back up and fight the Rollout — so the canary demo
  requires pausing that Application or adding an `ignoreDifferences` for `deploy/gateway`.
- The analysis judges the aggregate `job="gateway"`, not only canary pods (the gateway
  metrics aren't labelled per rollout hash). For a short canary taking a real traffic slice
  that's a serviceable signal; a production setup would add a version label and filter to
  the canary ReplicaSet.
- Thresholds/windows are the demo-tuned ADR-0013 values, short enough to be visible in a
  demo session — not derived from a negotiated error budget.
- CI: these manifests use Argo Rollouts + Traefik CRDs unknown to `kubeconform -strict`,
  so they are covered by the new **lenient** job (`-ignore-missing-schemas`) that also
  validates `infra/gitops`; the strict `infra/k8s` job is unchanged.
