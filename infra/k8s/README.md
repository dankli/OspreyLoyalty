# Osprey Loyalty — Kubernetes (kind) Quickstart

These manifests deploy the full Osprey Loyalty stack to a local [kind](https://kind.sigs.k8s.io/) cluster in the `osprey` namespace.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) running
- [kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) installed
- [kubectl](https://kubernetes.io/docs/tasks/tools/) installed

## Steps

### 1. Build images

```bash
docker compose -f infra/docker-compose.yml build
```

This produces the four application images used by the manifests:

- `osprey-loyalty-members:latest`
- `osprey-loyalty-gateway:latest`
- `osprey-loyalty-partners:latest`
- `osprey-loyalty-member-portal:latest`

### 2. Create the kind cluster

```bash
kind create cluster --name osprey
```

### 3. Load images into kind

kind does not pull from the local Docker daemon automatically. Side-load each image:

```bash
kind load docker-image osprey-loyalty-members:latest --name osprey
kind load docker-image osprey-loyalty-gateway:latest --name osprey
kind load docker-image osprey-loyalty-partners:latest --name osprey
kind load docker-image osprey-loyalty-member-portal:latest --name osprey
```

### 4. Apply the manifests

```bash
kubectl apply -f infra/k8s/
```

### 5. Wait for all pods to become Ready

```bash
kubectl -n osprey get pods -w
```

Partners (Spring Boot / JVM) has a 20 s readiness delay and is the slowest to start. Expect 60–90 s for all pods to reach `Running 1/1`.

### 6. Access the services

Port-forward the gateway and the member portal in two separate terminals:

```bash
# Terminal 1
kubectl -n osprey port-forward svc/gateway 4000:4000

# Terminal 2
kubectl -n osprey port-forward svc/member-portal 5173:80
```

The member portal's Vite build has the gateway URL baked in as `http://localhost:4000/graphql`. Port-forwarding **both** services on their expected local ports is required for the portal to function correctly.

| Service | Local URL |
|---|---|
| Gateway (GraphQL) | http://localhost:4000/graphql |
| Member Portal | http://localhost:5173 |
| RabbitMQ Management | `kubectl -n osprey port-forward svc/rabbitmq 15672:15672` → http://localhost:15672 |

## Limitations

These manifests are intentionally minimal for local development and demos:

- **Data loss on restart.** Both MongoDB and RabbitMQ use `emptyDir` volumes. All data is lost when the respective pod is deleted or the cluster is torn down.
- **Single replicas.** Every workload runs as a single replica. There is no high availability or pod disruption budget.
- **No ingress.** Services are ClusterIP only; access requires `kubectl port-forward`.
- **Secrets in plain env vars.** Environment variables (connection strings, hostnames) are embedded directly in the manifests. For any non-local environment, move these to Kubernetes Secrets or an external secrets manager.
- **Core services only.** Only the four application services (members, gateway, partners, member-portal) plus their dependencies (mongo, rabbitmq) are deployed. The admin portal, shell, Prometheus, and Grafana are not included — they are handled by `infra/docker-compose.yml` for local observability work.
