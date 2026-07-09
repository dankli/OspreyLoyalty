# Progressive delivery with Argo Rollouts (gateway canary)

This directory replaces the gateway's plain rolling Deployment with an **Argo Rollouts
canary**: new versions get a stepped slice of live traffic (20 → 40 → 60 → 80 → 100 %),
and an automated **Prometheus analysis** judges each step against the gateway's own RED
metrics. A bad version **auto-aborts and rolls back** before it reaches everyone. See
ADR-0020.

Like the GitOps piece, this is **additive and opt-in** — it is *not* wired into
`run-local-k8s`. The gateway is the demo subject because it sits on the request path
behind Traefik (every frontend journey routes through `api.osprey.localtest.me`), so a
real traffic split is observable; the pattern generalises to the other services.

## Files

| File | Purpose |
|------|---------|
| `gateway-rollout.yaml` | The `Rollout` (drop-in replacement for `infra/k8s/gateway.yaml`'s Deployment) with the canary strategy, steps, traffic routing and background analysis. |
| `gateway-services.yaml` | `gateway-stable` + `gateway-canary` Services and the weighted `TraefikService` whose weights Argo Rollouts rewrites per step. |
| `gateway-analysistemplate.yaml` | Prometheus `AnalysisTemplate` — success-rate (>= 95%) and p95 latency (<= 1s) queries against in-cluster Prometheus. |
| `gateway-ingress-canary.yaml` | Traefik `IngressRoute` sending `api.` at the weighted `TraefikService` so the split applies to real traffic. |

## Install the controller + plugin

```bash
# Argo Rollouts controller (official manifest, into its own namespace):
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# The kubectl plugin (for `kubectl argo rollouts ...`):
#   macOS:  brew install argoproj/tap/kubectl-argo-rollouts
#   linux:  curl -sSLo kubectl-argo-rollouts \
#             https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-linux-amd64
#           chmod +x kubectl-argo-rollouts && sudo mv kubectl-argo-rollouts /usr/local/bin/
#   docs:   https://argo-rollouts.readthedocs.io/en/stable/installation/#kubectl-plugin-installation
```

## Apply the canary (replacing the base gateway Deployment)

The Rollout and the base Deployment both own `app: gateway` pods, so run only one. Scale
the base Deployment to 0 (don't delete the file — we keep it as the always-on path), then
apply the Rollout stack:

```bash
# Stand down the plain Deployment (keeps the manifest, removes the pods):
kubectl -n osprey scale deploy/gateway --replicas=0

# Apply the canary stack:
kubectl -n osprey apply -f infra/delivery/gateway-services.yaml
kubectl -n osprey apply -f infra/delivery/gateway-analysistemplate.yaml
kubectl -n osprey apply -f infra/delivery/gateway-rollout.yaml
kubectl -n osprey apply -f infra/delivery/gateway-ingress-canary.yaml

# First rollout comes up at 100% stable (no canary yet):
kubectl argo rollouts -n osprey get rollout gateway --watch
```

> If you run ArgoCD (infra/gitops), remember its Application manages `infra/k8s` only, so
> it will try to keep `deploy/gateway` at its git replica count (self-heal). Either pause
> that Application while demoing the canary, or add `deploy/gateway` to an ignoreDifferences
> block. This is called out in ADR-0019/0020 as a demo caveat.

## Trigger a new revision and watch the canary

Any change to the Rollout's pod template starts a canary. Simplest trigger:

```bash
# Bump an annotation / image to create a new revision:
kubectl argo rollouts -n osprey set image gateway \
  gateway=osprey-loyalty-gateway:latest
# (or `kubectl -n osprey patch rollout gateway --type merge \
#      -p '{"spec":{"template":{"metadata":{"annotations":{"rollout/trigger":"'$(date +%s)'"}}}}}')

# Watch the steps advance (weights 20 → 40 → 60 → 80 → 100) and the AnalysisRun:
kubectl argo rollouts -n osprey get rollout gateway --watch

# The first pause has a 60s duration; the rollout auto-advances. To gate manually,
# change that pause to `{}` (no duration) and promote by hand:
kubectl argo rollouts -n osprey promote gateway
```

Confirm the Traefik weights are actually moving:

```bash
kubectl -n osprey get traefikservice gateway -o jsonpath='{.spec.weighted.services}'; echo
```

## Demonstrate an automatic rollback

The analysis fails the canary when gateway success-rate drops below 95% or p95 latency
exceeds 1s over the analysis window. To force it, deploy a **deliberately bad** gateway
revision (one that 500s or is slow) as the new image, or drive 5xx/slow load at
`api.osprey.localtest.me` during the canary (see `infra/load/`). Then:

```bash
kubectl argo rollouts -n osprey get rollout gateway --watch
# The AnalysisRun goes Failed → the Rollout status flips to Degraded/Aborted →
# traffic weight snaps back to 100% stable, canary pods are scaled down.

# Inspect the failed analysis:
kubectl -n osprey get analysisrun
kubectl -n osprey describe analysisrun <name>
```

Manual abort/rollback (without waiting for analysis) for the demo:

```bash
kubectl argo rollouts -n osprey abort gateway     # abort in-flight canary → back to stable
kubectl argo rollouts -n osprey undo gateway      # roll back to the previous revision
```

## Return to the non-canary topology

```bash
kubectl -n osprey delete -f infra/delivery/gateway-ingress-canary.yaml
kubectl -n osprey delete -f infra/delivery/gateway-rollout.yaml
kubectl -n osprey delete -f infra/delivery/gateway-services.yaml
kubectl -n osprey delete -f infra/delivery/gateway-analysistemplate.yaml
kubectl -n osprey scale deploy/gateway --replicas=1   # bring the plain Deployment back
```

## Honest demo caveats

- **It's a showcase.** Thresholds (95% success, 1s p95, 2m windows) reuse the ADR-0013
  demo SLOs; they're tuned to be visible in a demo session, not derived from an error
  budget.
- **Analysis measures the gateway job, not just canary pods.** The gateway metrics aren't
  labelled per rollout hash, so the queries judge the aggregate `job="gateway"`. For a
  short canary taking a real traffic slice that's a serviceable signal (a bad canary drags
  the aggregate below threshold), but it's not a clean per-version SLI. Production would
  add a version/pod label and filter to the canary ReplicaSet.
- **Not in run-local-k8s.** You install the controller, the plugin, and swap the
  Deployment for the Rollout by hand (above). This keeps the base path and its
  `kubeconform -strict` CI untouched.
- **CI validates these manifests leniently.** They use Argo Rollouts + Traefik CRDs
  (`Rollout`, `AnalysisTemplate`, `TraefikService`, `IngressRoute`) that `kubeconform
  -strict` doesn't know, so the `infra.yml` lenient job runs with `-ignore-missing-schemas`
  (schemas skipped, not errored) — see the workflow.
- **ArgoCD self-heal vs the scaled-down base Deployment.** If ArgoCD manages `infra/k8s`,
  pause that Application (or add an ignoreDifferences for `deploy/gateway`) while demoing
  the canary, or it will scale the base Deployment back up and fight the Rollout.
