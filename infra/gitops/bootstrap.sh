#!/usr/bin/env bash
# Bootstrap ArgoCD onto the local cluster and hand it the Osprey stack.
#
# This is a self-contained, out-of-band installer: run-local-k8s does NOT install ArgoCD,
# so this is the opt-in GitOps showcase. It:
#   1. installs the ArgoCD control plane into the `argocd` namespace (official manifest),
#   2. waits for the ArgoCD server to become available,
#   3. rewrites the Application's repoURL to this repo's `origin` remote (so ArgoCD tracks
#      whatever you actually pushed), and applies the Application (or ApplicationSet),
#   4. prints how to open the UI and the initial admin password.
#
# Prereqs: kubectl pointed at your local cluster (Docker Desktop / kind), a git `origin`
# remote that ArgoCD can reach (push your branch first), and the base namespace can be
# created by ArgoCD itself.
#
# Usage:
#   infra/gitops/bootstrap.sh                 # single Application (default)
#   infra/gitops/bootstrap.sh --appset        # ApplicationSet (app-of-apps grouping)
#   ARGOCD_VERSION=v2.13.2 infra/gitops/bootstrap.sh   # pin a specific ArgoCD release
set -euo pipefail

# Pin to a stable release rather than `stable` so the demo is reproducible. Override with
# ARGOCD_VERSION. See https://github.com/argoproj/argo-cd/releases for tags.
ARGOCD_VERSION="${ARGOCD_VERSION:-v2.13.2}"
INSTALL_URL="https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION}/manifests/install.yaml"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

USE_APPSET=0
if [[ "${1:-}" == "--appset" ]]; then
  USE_APPSET=1
fi

echo "==> Creating argocd namespace"
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -

echo "==> Installing ArgoCD ${ARGOCD_VERSION} (official manifest)"
echo "    ${INSTALL_URL}"
kubectl apply -n argocd -f "${INSTALL_URL}"

echo "==> Waiting for the ArgoCD server to become available (up to 5m)"
kubectl -n argocd rollout status deploy/argocd-server --timeout=300s

# Resolve the repo's origin remote so ArgoCD tracks the branch you pushed. If origin is a
# git@ SSH URL, ArgoCD needs SSH creds — for the demo an https URL is simplest.
ORIGIN_URL="$(git -C "${REPO_ROOT}" remote get-url origin 2>/dev/null || echo '')"
MANIFEST="${SCRIPT_DIR}/application.yaml"
if [[ "${USE_APPSET}" -eq 1 ]]; then
  MANIFEST="${SCRIPT_DIR}/applicationset.yaml"
fi

echo "==> Applying $(basename "${MANIFEST}")"
if [[ -n "${ORIGIN_URL}" ]]; then
  echo "    Rewriting repoURL -> ${ORIGIN_URL}"
  # Substitute the placeholder repoURL with the real origin, apply the patched stream.
  sed "s#https://github.com/your-org/OspreyLoyalty.git#${ORIGIN_URL}#g" "${MANIFEST}" \
    | kubectl apply -f -
else
  echo "    WARNING: no git 'origin' remote found; applying the manifest as-is."
  echo "    Edit the repoURL in ${MANIFEST} to a repo ArgoCD can reach, then re-apply."
  kubectl apply -f "${MANIFEST}"
fi

cat <<'EOF'

==> ArgoCD is installed and the Osprey Application is applied.

Open the UI (port-forward in a separate terminal):
    kubectl -n argocd port-forward svc/argocd-server 8081:443
    # then browse https://localhost:8081  (accept the self-signed cert)

Initial admin password (username: admin):
    kubectl -n argocd get secret argocd-initial-admin-secret \
      -o jsonpath='{.data.password}' | base64 -d; echo

Watch it sync from the CLI:
    kubectl -n argocd get applications
    kubectl -n argocd get application osprey -o wide

Caveats:
  * ArgoCD must be able to reach your git 'origin' over the network. A purely local,
    unpushed branch will show the Application as "Unknown/Missing" until you push.
  * This Application syncs infra/k8s only. It does NOT manage the Argo Rollouts canary
    in infra/delivery (that replaces the base gateway Deployment on demand — see
    infra/delivery/README.md).
EOF
