# Delivery: GitOps + progressive delivery

This is the operator-facing overview of how the Osprey stack is *deployed* and how new
versions are *rolled out safely*, and how both tie into the observability stack. It is the
enterprise-phase delivery layer on top of the plain `run-local-k8s` deploy. Two ADRs back
it: [ADR-0019 (GitOps/ArgoCD)](decisions/0019-gitops-argocd.md) and
[ADR-0020 (progressive delivery/Argo Rollouts)](decisions/0020-progressive-delivery-argo-rollouts.md).

Both pieces are **additive and opt-in** — `run-local-k8s` is untouched and still deploys
the base stack imperatively. You bootstrap GitOps and/or the canary yourself when you want
to show them.

## The two layers

```
        git (infra/k8s)                        new gateway image
              │                                       │
   ┌──────────▼──────────┐               ┌────────────▼─────────────┐
   │  ArgoCD Application  │  reconciles   │   Argo Rollouts canary   │  shifts weight
   │  prune + selfHeal    ├──────────────▶│  20→40→60→80→100 % via    │  20→100 %
   │  (infra/gitops/)     │   cluster     │  weighted TraefikService  │
   └──────────────────────┘               └────────────┬─────────────┘
                                                        │ queries
                                          ┌─────────────▼─────────────┐
                                          │  Prometheus RED metrics   │  gate: success-rate
                                          │  (ADR-0013 SLOs)          │  >=95%, p95 <=1s
                                          └───────────────────────────┘
                                                        │ breach
                                                        ▼
                                              auto-abort → 100% stable
```

### 1. GitOps — how the cluster gets its desired state (ADR-0019)

**ArgoCD** continuously reconciles the `osprey` namespace to match `infra/k8s/` at a git
commit. You change the cluster by changing git; ArgoCD applies it, reverts manual drift
(`selfHeal`) and deletes resources removed from git (`prune`). The ArgoCD UI shows sync
status, health and diffs.

- Bootstrap: `infra/gitops/bootstrap.sh` (installs ArgoCD, applies the Application).
- Scope: the Application syncs `infra/k8s` only — the CRD-free base that CI validates
  strictly. It does not manage the canary (that would fight the base gateway Deployment).
- Details + caveats: [`infra/gitops/README.md`](../infra/gitops/README.md).

### 2. Progressive delivery — how a new version rolls out safely (ADR-0020)

**Argo Rollouts** replaces the gateway's default rolling update with a **canary**: a new
version takes a stepped slice of live traffic (**20 → 40 → 60 → 80 → 100 %**), split at
**Traefik** via a weighted `TraefikService`. Between steps, a Prometheus **AnalysisTemplate**
checks the gateway's own RED metrics; a breach **auto-aborts and rolls back** to stable.

- Subject: the **gateway**, because it's on the request path behind Traefik (all frontend
  journeys hit `api.osprey.localtest.me`) and already exposes the RED histogram. The
  pattern generalises to members/partners.
- Bootstrap + demo (including how to force a rollback): [`infra/delivery/README.md`](../infra/delivery/README.md).

## How this ties into observability

The delivery layer is only as good as the signal it trusts, and that signal is the Fas 2
observability stack:

- The canary **analysis reuses the ADR-0013 SLO/RED metrics** — gateway success-rate
  (non-5xx ratio, `>= 95%`) and p95 latency (`<= 1s`) from
  `http_request_duration_seconds_*`, scraped by the in-cluster Prometheus
  (`http://prometheus.osprey:9090`). The same thresholds that *page* an operator after the
  fact (`GatewayHighErrorRate`, `GatewayHighLatencyCritical`) *gate the rollout* before a
  bad version lands. Release safety and alerting agree on what "healthy" means.
- While a canary runs you can watch it across the three signals: the RED **Grafana**
  dashboard (does the 5xx ratio move as the canary takes weight?), **Jaeger** traces
  (are canary requests erroring or slow?), and **Loki** logs (what did the canary pods
  actually log?). ArgoCD adds a fourth pane: the deploy's sync/health state.

## Order of operations for a full demo

1. Push your branch (ArgoCD pulls from a reachable remote, not your disk).
2. `infra/gitops/bootstrap.sh` → ArgoCD reconciles `infra/k8s` into `osprey`.
3. Install the Argo Rollouts controller + `kubectl argo rollouts` plugin
   (`infra/delivery/README.md`).
4. Pause the ArgoCD Application (or add an `ignoreDifferences` for `deploy/gateway`), scale
   the base gateway Deployment to 0, and apply the canary stack.
5. Trigger a new gateway revision and watch the canary step + analyse; force a bad version
   or drive 5xx/slow load to watch the automatic rollback.

## Honest caveats (see the ADRs and READMEs for the full list)

- Neither piece is wired into `run-local-k8s`; both are manual showcases that keep the base
  deploy path — and its `kubeconform -strict` CI — untouched. The new CRD manifests live in
  `infra/gitops/` and `infra/delivery/` and are CI-validated **leniently**
  (`-ignore-missing-schemas`) so unknown CRDs are skipped, not failed.
- ArgoCD self-heal and the Rollouts canary both want to own the gateway — run one at a time
  or scope them apart (documented in both READMEs and ADR-0020).
- Thresholds and step timings are demo-tuned to be visible in a session, not derived from a
  negotiated error budget.
