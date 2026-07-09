# ADR-0019: Declarative GitOps with ArgoCD

**Status:** accepted

## Context

Through the enterprise phases the stack is deployed to Kubernetes by `run-local-k8s`
running plain `kubectl apply -f infra/k8s`. That is fine to stand a cluster up, but it is
imperative and stateless: nothing records that the cluster *should* match `infra/k8s` at a
commit, nothing reverts a manual `kubectl edit`, nothing prunes a resource whose manifest
was deleted, and there is no audit trail beyond shell history. An enterprise-shaped demo
should show the deployment layer the way real fleets run it — the cluster continuously
reconciled to git, with drift detection, pruning and a reviewable history.

## Decision

**Add ArgoCD as a declarative GitOps controller that syncs `infra/k8s/` into the `osprey`
namespace**, with `syncPolicy.automated { prune: true, selfHeal: true }`. Git becomes the
source of truth: you change the cluster by changing git, and ArgoCD reconciles.

- An ArgoCD `Application` (`infra/gitops/application.yaml`) points at this repo's
  `infra/k8s` path (recursive, excluding `README.md`) and reconciles it into `osprey`.
  `selfHeal` reverts live drift, `prune` deletes resources removed from git, and
  `ServerSideApply` keeps the large Grafana-dashboards ConfigMap under the apply-size
  limit.
- An optional `ApplicationSet` (`infra/gitops/applicationset.yaml`) is offered as an
  app-of-apps alternative that splits the stack into per-slice Applications (data /
  services / frontends / observability / platform) for a clearer UI — apply one or the
  other, not both.
- `infra/gitops/bootstrap.sh` installs the ArgoCD control plane from the official pinned
  release manifest, waits for the server, rewrites the Application's `repoURL` to the
  repo's `origin`, and applies it — then prints the port-forward + initial-admin-password
  recipe.

This is **additive and opt-in**: `run-local-k8s` is unchanged and still deploys the base
stack imperatively. The GitOps path lives entirely under `infra/gitops/` and you bootstrap
it yourself when you want to demo it.

**The Application scopes to `infra/k8s` only** — the base, CRD-free manifests that CI
validates with `kubeconform -strict`. It deliberately does not manage `infra/gitops` or
`infra/delivery`, which carry ArgoCD and Argo Rollouts CRDs bootstrapped out-of-band; in
particular the Argo Rollouts gateway canary (ADR-0020) is an *alternative* to the base
gateway Deployment, so keeping it outside this Application stops the two from fighting over
the gateway.

## Alternatives considered

**Flux instead of ArgoCD.** Flux is an equally capable CNCF GitOps toolkit and is arguably
more composable (GitOps Toolkit controllers, CLI-first). ArgoCD was chosen for the **UI** —
a visual sync/health/diff view is central to the demo's story — and because **Argo
Rollouts** (the progressive-delivery piece in ADR-0020) is from the same project and
integrates cleanly with it. Flux would work; it just shows less.

**Keep imperative `kubectl apply`.** Simplest, but demonstrates none of the value —
no drift control, no pruning, no reconciliation, no auditable deploy surface. The whole
point of this phase is that layer.

**Manage everything (including CRDs) from one Application.** Rejected: it would pull the
Rollouts/Traefik CRDs and the canary gateway into the always-on sync and collide with the
base gateway Deployment, and it would break the `-strict` CI expectation for `infra/k8s`.
Scoping the Application to the CRD-free base keeps both the reconciliation and CI honest.

## Consequences

- New directory `infra/gitops/` (Application, ApplicationSet, `bootstrap.sh`, README). No
  application code and no changes to `infra/k8s/`.
- ArgoCD must be able to reach the git remote it syncs; a local, unpushed branch shows the
  Application as `Unknown/Missing` until pushed. The bootstrap rewrites `repoURL` to
  `origin`; an SSH remote needs credentials, so an HTTPS public URL is simplest for the
  demo.
- Recursive sync pulls in `infra/k8s/ingress/`, which on a plain run is applied only in
  ingress mode — so under ArgoCD the cluster is effectively the "ingress-on" topology.
- The `automated` policy is intentionally aggressive (prune + self-heal) to demonstrate
  the pattern; a production setup would gate prod behind sync windows and manual
  promotion.
- CI: a new **lenient** `kubeconform` job validates `infra/gitops` (and `infra/delivery`)
  with `-ignore-missing-schemas` so the ArgoCD/Rollouts/Traefik CRDs are skipped rather
  than failing the build; the existing `-strict` job over `infra/k8s` is untouched.
