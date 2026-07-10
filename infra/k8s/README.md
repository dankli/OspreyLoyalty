# Osprey Loyalty — Kubernetes Quickstart

These manifests deploy the full Osprey Loyalty stack to a local Kubernetes cluster in the `osprey` namespace. Two paths: **Docker Desktop** (simplest on Windows/macOS) or **kind**.

## Quick start on Docker Desktop (recommended)

Docker Desktop ships a single-node Kubernetes and `kubectl`. Its Kubernetes is **kind-based and runs its own containerd**, so locally-built images are *not* visible to the cluster automatically — the helper script **loads each image into the node** after building (the `kind load` equivalent: `docker save … | docker exec -i <node> ctr -n k8s.io images import -`). The manifests use `imagePullPolicy: Never`, so once loaded the node uses them without pulling.

1. **Enable Kubernetes:** Docker Desktop → **Settings → Kubernetes → Enable Kubernetes → Apply & Restart**. Wait until the Kubernetes indicator (bottom-left) turns **green**. This creates the `docker-desktop` kubectl context.
2. **Run the helper script** from the repo root — it checks prerequisites, builds the ten images, applies the manifests (namespace first), and waits for every rollout:

   ```powershell
   ./run-local-k8s.ps1                 # PowerShell: authenticated stack behind Traefik ingress (default)
   ./run-local-k8s.ps1 -PortForward    # localhost:<port> kubectl port-forwards instead of the ingress
   ./run-local-k8s.ps1 -NoAuth         # plain, unauthenticated stack
   ./run-local-k8s.ps1 -NoBuild        # re-apply without rebuilding
   ./run-local-k8s.ps1 -Delete         # tear down
   ```

   ```bash
   ./run-local-k8s.sh                  # bash: authenticated stack behind Traefik ingress (default)
   ./run-local-k8s.sh --port-forward
   ./run-local-k8s.sh --no-auth
   ./run-local-k8s.sh --no-build
   ./run-local-k8s.sh --delete
   ```

3. **Sign in.** By default the script deploys a **Traefik ingress** and routes the stack under `*.osprey.localtest.me` (a wildcard domain resolving to `127.0.0.1`, so no hosts-file editing; Traefik's LoadBalancer binds `localhost:80`). Open the entry point **http://app.osprey.localtest.me** and log in with a demo user (`demo-ada` / `demo-erik` / `demo-yusra`, or `admin`). Identity is at `http://id.osprey.localtest.me`, the GraphQL API at `http://api.osprey.localtest.me`, **Grafana at http://grafana.osprey.localtest.me** (metrics, logs, and traces in one place), Jaeger at `http://jaeger.osprey.localtest.me`, and the Traefik dashboard at `http://traefik.osprey.localtest.me`. See ADR-0011. Pass `-PortForward` / `--port-forward` for the older localhost:`<port>` setup (issuer `http://localhost:9000`) instead.

### What "authenticated" does (the default), and the caveat

With auth on (the default), `run-local-k8s.*`:

- builds member-portal / admin-portal / shell with `VITE_AUTH_ENABLED=true` and the OIDC config baked in (redirect URIs matching the forwarded ports the `security` service has registered);
- sets **members** to `Auth__Enabled=true` (validates RS256 via the direct JWKS at `security:8080/oauth2/jwks`, not OIDC discovery — only the issuer *string* tracks the mode: `http://id.osprey.localtest.me` for ingress, `http://localhost:9000` for `-PortForward`) and **partners** to fetch a real client-credentials token (`AUTH_TOKEN_ENDPOINT` + `AUTH_CLIENT_SECRET`);
- in the default **ingress** mode, points every origin at the `*.osprey.localtest.me` hosts (issuer, redirect/post-logout URIs, CORS) via Traefik; in **`-PortForward`** mode, port-forwards shell (5170), member-portal (5173), admin-portal (5174), gateway (4000), members (5080), partners (8081) and security (9000) on `localhost`.

The gateway forwards the caller's bearer downstream and every backend re-validates — the gateway is **not** a trust boundary. **Caveat:** these code paths are unit-/build-tested, but the end-to-end browser login has not been driven in a live cluster here — treat the first run as a verification, not a guarantee. The IdP's demo users and RSA key are in-memory (reset on restart); points-engine is off the request path and is left auth-off. See ADR-0007. For the plain stack, pass `-NoAuth` / `--no-auth`.

### Optional: the HS256 service-token demo (manual)

Separately from browser login, the manifests can read an HS256 shared secret from an `osprey-auth` Secret (`secretKeyRef`, `optional: true`) to exercise **only** the RabbitMQ hop's token validation. This is a test shortcut — with it on, HTTP endpoints 401 without a minted token, so the portal will not work. To try it, create the Secret and restart the readers:

```bash
kubectl -n osprey create secret generic osprey-auth \
  --from-literal=enabled=true --from-literal=signing-key="$(openssl rand -base64 48)"
kubectl -n osprey rollout restart deploy/members deploy/partners deploy/points-engine
```

Remove it with `kubectl -n osprey delete secret osprey-auth` (then restart the readers), or tear down with `-Delete`. Do not run this together with the default browser-auth mode — the shared secret would push members into HS256 and reject the IdP's RS256 tokens.

The rest of this document is the **manual / kind** path.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) running
- [kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) installed
- [kubectl](https://kubernetes.io/docs/tasks/tools/) installed

## Steps

### 1. Build images

```bash
docker compose -f infra/docker-compose.yml build
```

This produces the application images used by the manifests:

- `osprey-loyalty-members:latest`
- `osprey-loyalty-gateway:latest`
- `osprey-loyalty-partners:latest`
- `osprey-loyalty-security:latest`
- `osprey-loyalty-points-engine:latest`
- `osprey-loyalty-routes:latest`
- `osprey-loyalty-member-portal:latest`
- `osprey-loyalty-admin-portal:latest`
- `osprey-loyalty-route-explorer:latest`
- `osprey-loyalty-shell:latest`

The observability images (jaeger, otel-collector, loki, promtail, prometheus, grafana) and the
neo4j route-graph store are public and are pulled by the cluster rather than side-loaded.

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
kind load docker-image osprey-loyalty-security:latest --name osprey
kind load docker-image osprey-loyalty-points-engine:latest --name osprey
kind load docker-image osprey-loyalty-routes:latest --name osprey
kind load docker-image osprey-loyalty-member-portal:latest --name osprey
kind load docker-image osprey-loyalty-admin-portal:latest --name osprey
kind load docker-image osprey-loyalty-route-explorer:latest --name osprey
kind load docker-image osprey-loyalty-shell:latest --name osprey
```

### 4. Apply the manifests

```bash
kubectl apply -f infra/k8s/
```

### 5. Wait for all pods to become Ready

```bash
kubectl -n osprey get pods -w
```

Partners (Spring Boot / JVM) has a 20 s readiness delay, and routes seeds ~3.9k airports + 59k edges into Neo4j and warms its query plans on first boot before `/ready` returns 200. Expect 60–90 s for most pods and up to ~2–3 min for routes to reach `Running 1/1`.

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

- **Persistent state, single replica.** MongoDB, RabbitMQ and Neo4j are **StatefulSets with PersistentVolumeClaims** (2Gi each via the default StorageClass), so their data **survives a pod restart**. It is still a single replica with no HA, and the data is removed when the namespace/PVCs are deleted (`-Delete`).
- **Single replicas.** Every workload runs as a single replica. There is no high availability or pod disruption budget.
- **No ingress.** Services are ClusterIP only; access requires `kubectl port-forward`.
- **Secrets in plain env vars.** Environment variables (connection strings, hostnames) are embedded directly in the manifests. For any non-local environment, move these to Kubernetes Secrets or an external secrets manager.
- **The full stack.** All application services (members, gateway, partners, security, points-engine, routes), all four frontends (member-portal, admin-portal, route-explorer, shell), their dependencies (mongo, rabbitmq, neo4j), and the complete observability stack — tracing (jaeger, otel-collector), logging (loki, promtail), and metrics/dashboards (prometheus, grafana) — are deployed. **Grafana** (`localhost:3000`, opens anonymously as Admin) is the single pane of glass: RED dashboards from Prometheus, logs from Loki, and traces from Jaeger, cross-linked by `trace_id`.
- **Auth off by default.** The zero-trust kill-switch is off in these manifests (as in compose), so the stack runs without tokens. Turning it on means setting `Auth__Enabled`/`AUTH_ENABLED` and the shared signing config across services — see ADR-0007.
