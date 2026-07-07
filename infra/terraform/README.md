# infra/terraform

A small IaC sample from Phase 4 (optional item). Deliberately tiny: one namespace and one `ResourceQuota` — nothing more.

## What it manages

- `kubernetes_namespace` — creates the `osprey` namespace with standard labels.
- `kubernetes_resource_quota` — caps the namespace at 20 pods, 4/8 CPU, and 4 Gi/8 Gi memory. The "bound everything" principle applies to infrastructure: a runaway rollout should not be able to exhaust a shared cluster.

It intentionally does **not** manage Deployments, Services, or any other workload objects. Those are owned by `infra/k8s/` manifests applied with `kubectl`. Two owners of the same resource is how drift starts.

## Namespace ownership — use one, not both

`infra/k8s/namespace.yaml` also creates the `osprey` namespace. Pick one approach per environment:

- **kubectl only** — apply `infra/k8s/` and skip Terraform.
- **Terraform** — run this module and remove or skip `namespace.yaml`, or import the existing namespace first: `terraform import kubernetes_namespace.osprey osprey`.

## How to run (against the kind cluster from infra/k8s/README.md)

Using Docker (no local Terraform install needed):

```bash
docker run --rm \
  -v "$HOME/.kube:/root/.kube" \
  -v "$(pwd):/tf" -w /tf \
  hashicorp/terraform:1.9 init

docker run --rm \
  -v "$HOME/.kube:/root/.kube" \
  -v "$(pwd):/tf" -w /tf \
  hashicorp/terraform:1.9 plan

docker run --rm \
  -v "$HOME/.kube:/root/.kube" \
  -v "$(pwd):/tf" -w /tf \
  hashicorp/terraform:1.9 apply
```

Or with a local Terraform install: `terraform init && terraform plan && terraform apply`.
