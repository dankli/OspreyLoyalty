# GitOps with ArgoCD

This directory adds **declarative GitOps** on top of the plain Kubernetes manifests in
`infra/k8s/`. Instead of a human running `kubectl apply`, **ArgoCD** continuously syncs
the cluster to match what is in git, and reverts drift.

It is **additive and opt-in**: the base stack still deploys the ordinary way via
`run-local-k8s` (plain `kubectl apply`). Nothing here is wired into that script — you
bootstrap ArgoCD yourself when you want the GitOps showcase. See ADR-0019.

## What GitOps buys here

- **Git is the source of truth.** The desired state of the cluster is exactly `infra/k8s/`
  at a commit. To change the cluster you change git; there is no out-of-band `kubectl`.
- **Drift control (self-heal).** If someone `kubectl edit`s or `kubectl scale`s a live
  resource, ArgoCD detects the divergence and reverts it to the git state.
- **Pruning.** Delete a manifest from git and ArgoCD deletes the corresponding live
  resource — no orphaned objects lingering from an old apply.
- **Auditable, reviewable deploys.** Every change is a git commit/PR with history, review
  and rollback (revert the commit). The ArgoCD UI shows sync status, diffs and health.

## Files

| File | Purpose |
|------|---------|
| `application.yaml` | A single ArgoCD `Application` syncing `infra/k8s` (recursive) into `osprey`, with `automated { prune, selfHeal }`. The default. |
| `applicationset.yaml` | Optional `ApplicationSet` that splits the stack into per-slice Applications (data / services / frontends / observability / platform) for a nicer UI breakdown. Use *instead of* `application.yaml`. |
| `bootstrap.sh` | Installs ArgoCD (official manifest), waits for it, rewrites the Application's `repoURL` to your `origin`, and applies it. Prints UI + admin-password instructions. |

## Bootstrap

```bash
# Push your branch first — ArgoCD pulls from a git remote it can reach, not your disk.
git push -u origin <your-branch>

# Install ArgoCD + apply the Application (single-Application mode):
infra/gitops/bootstrap.sh

# ...or app-of-apps grouping:
infra/gitops/bootstrap.sh --appset

# Pin a specific ArgoCD release:
ARGOCD_VERSION=v2.13.2 infra/gitops/bootstrap.sh
```

Open the UI:

```bash
kubectl -n argocd port-forward svc/argocd-server 8081:443
# browse https://localhost:8081 (self-signed cert — accept it)
```

Initial admin password (user `admin`):

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d; echo
```

## Why ArgoCD over Flux

Both are solid CNCF GitOps controllers. ArgoCD wins here for the **UI** — a visual sync/
health/diff view is a big part of the demo's story — and because Argo Rollouts (the
progressive-delivery piece in `infra/delivery/`) is from the same project and integrates
cleanly. Flux is more GitOps-toolkit/CLI-first; excellent, but less to *show*. See
ADR-0019 for the full rationale.

## Honest demo caveats

- **ArgoCD must reach your git remote.** A local, unpushed branch shows the Application as
  `Unknown/Missing`. Push first. The bootstrap rewrites `repoURL` to your `origin`; if
  that is an SSH `git@` URL you'll need to give ArgoCD SSH credentials — an HTTPS public
  URL is simplest for the demo.
- **Recursive sync pulls in `infra/k8s/ingress/`.** On a plain run that ingress is applied
  only in ingress mode; under ArgoCD the whole tree is applied, so this is effectively the
  "ingress-on" topology. Narrow `directory.include` if you don't want that.
- **This does not manage the canary.** The Argo Rollouts gateway in `infra/delivery/`
  replaces the base gateway Deployment on demand and is intentionally *outside* this
  Application, so the two don't fight over the gateway. See `infra/delivery/README.md`.
- **`ServerSideApply=true`** is set so the large Grafana-dashboards ConfigMap doesn't blow
  the client-side apply annotation size limit.
- **It's a showcase.** The `automated` sync policy is aggressive (prunes + self-heals) on
  purpose to demonstrate the pattern; a production setup would gate prod syncs behind sync
  windows and manual promotion.
