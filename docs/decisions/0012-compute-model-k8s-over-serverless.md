# ADR-0012: Compute model — Kubernetes over serverless

**Status:** accepted

## Context

The guiding principle for compute is the same one that governs service boundaries (ADR-0005): a cost is only worth paying when it buys something back. Applied to runtime, that principle bends toward serverless — _the cheapest cluster is the one you don't run_. Several workloads in this repo are textbook serverless-shaped:

- **`services/points-engine`** — a pure, stateless, CPU-bound calculation with no persistent state. The canonical scale-to-zero function.
- **`services/members` expiry sweep** (`Features/Expiry/Expiry.HostedService` + `Expiry.Sweep`) — a periodic job. A timer-triggered function is a more honest fit than a hosted service pinned inside an always-on pod.
- **`services/members` earn consumer** (`Features/ConsumeEarnEvents`) — a queue consumer. Queue-triggered functions exist precisely for this.
- **`services/partners` earn simulation** — bursty, event-driven HTTP that publishes to a queue.

So the honest question this ADR answers is: given that principle and those workloads, why does the whole fleet run on Kubernetes (AKS in the cloud, kind/k3d locally) instead of Azure Functions / Container Apps / Cloud Run with scale-to-zero on the edges?

## Decision

Run the entire fleet on **Kubernetes**, one uniform substrate, and accept that scale-to-zero is left on the table for the stateless edges.

The deciding factor is the same second forcing function named openly in ADR-0004 and ADR-0005: **this repo exists to demonstrate the full cloud-native operational stack, and serverless would hide exactly the surface the repo is built to show.**

- **Zero-trust across a mesh (ADR-0007).** JWT validation on every hop between five polyglot services is a Kubernetes/service-mesh story. On a serverless platform the same guarantees come from the platform's managed identity and are largely invisible — there is nothing to demonstrate.
- **Observability (ADR-0008).** The OpenTelemetry collector, Jaeger, Loki, Prometheus and Grafana wiring (`infra/observability`, `infra/k8s`) is deployed and correlated as first-class workloads. Serverless would push tracing/metrics behind per-cloud managed services and remove the collector topology from view.
- **Ingress (ADR-0011).** Traefik as a demonstrated ingress choice only exists because there is a cluster in front of it.
- **Uniform polyglot deployment.** One deployment model (Dockerfile → image → `Deployment`/`Service`) across C#, Java×2, Rust and Node. A serverless split would fragment this into per-runtime packaging and per-cloud triggers — a worse story to read, not a better one.
- **Local reproducibility.** `run-local-k8s` stands the entire system — services, queue, database, observability — up on a laptop. Serverless emulators are per-cloud, partial, and would not reproduce the mesh or the collector faithfully.

Cost also does not bite at this scale. RabbitMQ and MongoDB are stateful and always-on regardless; with the always-on core already paid for, scaling the stateless edges to zero saves little while splintering the operational narrative the repo is meant to tell.

## When serverless would win

This decision inverts the moment the goal shifts from _demonstrate the operational stack_ to _minimise idle cost in production_. In that world the first workloads to move off the cluster, in order, are:

1. **`points-engine`** → a stateless function (Azure Functions / Cloud Run). No state, spiky, trivially scale-to-zero.
2. **members expiry sweep** → a timer-triggered function. It runs on a schedule; paying for a pod to hold it 24/7 is the exact waste the principle warns about.
3. **members earn consumer** → a queue-triggered function, scaling with queue depth instead of a fixed replica count.

The always-on core (the members HTTP API under redemption latency SLAs, the gateway, the stateful backing services) would stay on Kubernetes. This would be a hybrid, and it would be the right call in a cost-sensitive production build. It is deliberately **not** the call here.

## Alternatives considered

**All-serverless (Functions / Container Apps / Cloud Run everywhere).** Cheapest at idle and closest to the stated principle. Rejected because it hides the zero-trust mesh, the observability topology and the ingress layer — the three things this repo is built to demonstrate — and because it fragments a clean uniform deployment model across four runtimes into per-cloud trigger plumbing.

**Hybrid (serverless edges + k8s core), as described above.** The production-honest answer, and explicitly the recommended path if this were cost-optimised rather than showcase-optimised. Rejected _for this repo only_ because splitting the substrate would dilute the single, legible operational story for a saving that does not matter at demo scale.

## Consequences

- The stateless edges (`points-engine`, expiry sweep, earn consumer) run as always-on pods even though their workload shape argues for scale-to-zero. This is a conscious showcase decision, not a cost-optimal one — the same honesty as ADR-0004 and ADR-0005.
- The observability, zero-trust and ingress ADRs (0007, 0008, 0011) depend on there being a cluster; they are consequences of this decision as much as inputs to it.
- Moving an edge workload to serverless later is a contained change: extract it behind its existing HTTP/queue contract, repackage as a function, delete its `Deployment`. The contracts already permit it; this ADR would gain an addendum recording the split.
</content>
</invoke>
