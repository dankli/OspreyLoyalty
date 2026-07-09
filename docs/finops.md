# FinOps — cost, right-sizing and where serverless would win

This is a demo, so nothing here is a real cloud bill. But the *pattern* is real:
if this fleet ran in production on AKS you would reason about cost the way this
document does. It ties directly to **ADR-0012** (Kubernetes over serverless) and
to the load tests in `infra/load/` — you cannot right-size what you have not
measured, and the k6 scripts are how you measure.

Honest framing: everything below is a back-of-envelope on public list prices to
show the shape of the trade-off, not a quote.

## 1. Right-sizing and QoS

The backend pods run **request == limit** for memory, which places them in
Kubernetes' **Guaranteed** QoS class. That buys predictability at some cost:

- **Why Guaranteed:** a pod whose memory request equals its limit is the last to
  be evicted under node memory pressure and cannot be OOM-killed for exceeding a
  soft request. For latency-sensitive paths (the members redemption API, the
  gateway) that predictability is worth more than the bin-packing density you
  give up. It also makes the pod's cost trivial to attribute — the request is
  the reservation is the bill.
- **The cost of Guaranteed:** you pay for the limit whether or not you use it.
  A pod that requests 512Mi but idles at 120Mi is 75% waste, 24/7. That waste is
  exactly what the measurement and VPA sections below attack.

CPU is intentionally left with `request < limit` (Burstable on CPU) so a spiky,
CPU-bound path — notably `points-engine` — can burst into idle node CPU without
reserving it. Memory is the resource we pin; CPU is the resource we let float.

## 2. A simple cost model

Cost on Kubernetes is, to first order, **the nodes you keep running**, not the
pods. Pods are just how you pack work onto nodes. So the model is:

```
monthly_node_cost  ≈  Σ(node vCPU × $/vCPU-month)  +  Σ(node GiB × $/GiB-month)
effective_cost     ≈  monthly_node_cost / packing_efficiency
packing_efficiency  =  Σ(used resources) / Σ(reserved resources)
```

Two levers, and only two:

1. **Raise packing efficiency** — right-size requests so reservations track real
   usage (VPA), and scale replica count to real demand (HPA). Guaranteed QoS
   *lowers* efficiency by design, so the requests must be honest or the waste is
   permanent.
2. **Stop paying for idle** — if a workload is idle most of the time, the
   cheapest node is the one you do not run: move it to scale-to-zero (§5).

Illustrative, list-price-ish numbers for one small node pool (do not quote):

| Item | Rough monthly |
|------|--------------|
| 1 × 2-vCPU / 8-GiB node (always-on, e.g. Standard_D2s_v5-class) | ~$70–90 |
| 3-node pool for HA + headroom | ~$210–270 |
| Stateful backing (managed Mongo/Cosmos + broker), always-on | dominates; often > the compute |

The headline: at demo scale the **always-on stateful core dominates**, which is
precisely ADR-0012's cost argument — scaling the stateless edges to zero saves
little while the broker and database are paid for anyway.

## 3. How you'd measure real cost

Guesses are not FinOps. On a real cluster:

- **OpenCost / Kubecost.** Deploy [OpenCost](https://www.opencost.io/) (the CNCF
  project) or its Kubecost distribution into the cluster. It joins pod resource
  usage against cloud billing rates and attributes cost **per namespace, per
  workload, per label** — so "what does the earn consumer cost per month?" and
  "what does tenant X cost?" become dashboard queries, not spreadsheets.
- **Prometheus you already have.** `infra/observability` already runs Prometheus.
  `container_cpu_usage_seconds_total` and `container_memory_working_set_bytes`
  vs. the configured requests give the packing-efficiency ratio directly — the
  numerator OpenCost needs, without waiting for OpenCost.
- **Load as the input signal.** Run `infra/load/soak.js` at a representative
  arrival rate, then read the working-set and CPU curves. That tells you the
  *real* memory ceiling to set requests against, and the request/replica point
  where the p95 latency SLO (the k6 thresholds) starts to break — which is the
  HPA target you want.

Measure → right-size → re-measure. The load tests close that loop.

## 4. VPA and HPA recommendations

| Workload | HPA | VPA | Note |
|----------|-----|-----|------|
| **gateway** (BFF) | Yes — scale on CPU / RPS; it fans out per request | Recommender mode | Latency-sensitive; keep a floor of ≥2 replicas. |
| **members** HTTP API | Yes — scale on CPU and p95 latency | Recommender mode | Under redemption SLA; do not let VPA auto-evict it — use VPA in *recommend* mode and apply on deploy. |
| **partners** | Yes — bursty earn HTTP | Recommender mode | Publishes to the broker; scales with earn spikes. |
| **points-engine** | Yes — CPU-bound, spiky | Auto — safe, it is stateless | Prime scale-to-zero candidate (§5). |
| **members expiry sweep** | No — it is a schedule, not a request stream | n/a | Should not be a replica at all (§5). |
| **members earn consumer** | Yes — but on **queue depth**, not CPU (KEDA) | Recommender | Fixed replicas waste money at idle and lag under bursts; queue-depth scaling fixes both. |

Practical guidance:

- Run **VPA in recommendation mode** for the stateful/latency paths and apply
  the recommendation at deploy time. Auto-mode VPA evicts pods to resize them,
  which is unacceptable mid-redemption. Because these pods are Guaranteed
  (request == limit), a stale request is *pure* waste, so the recommendation is
  worth harvesting regularly.
- Use **HPA for anything request- or queue-driven**, and prefer **KEDA** for the
  earn consumer so it scales on RabbitMQ queue depth rather than a CPU proxy.
- **Never run VPA-auto and HPA on the same resource dimension** (both on CPU) —
  they fight. HPA on CPU, VPA on memory-in-recommend-mode is the safe split.

## 5. Where serverless would win (tie-in to ADR-0012)

ADR-0012 decided to run the **whole** fleet on Kubernetes for a showcase reason
(demonstrating the zero-trust mesh, the observability topology and ingress),
and *explicitly* left scale-to-zero on the table for the stateless edges. This
section quantifies what that costs, so the trade-off is honest.

If the goal flipped from *demonstrate the operational stack* to *minimise idle
cost*, these three workloads move off the cluster first, in this order — the
same order ADR-0012 names:

1. **`points-engine`** → a stateless function (Azure Functions / Cloud Run /
   Container Apps scale-to-zero). Pure, stateless, CPU-bound, spiky. Today it is
   an always-on pod holding memory 24/7 for work that arrives in bursts.
   *Back-of-envelope:* an always-on small pod is on the order of ~$15–30/mo of
   reserved node capacity; the same work as a function billed per-invocation for
   a demo-scale request volume is effectively **within the free grant / a few
   cents/mo**. Scale-to-zero wins by roughly an order of magnitude here — the
   textbook case.
2. **members expiry sweep** (`Features/Expiry`) → a **timer-triggered** function.
   It runs on a schedule; paying for a pod (or a slice of one) to hold it 24/7
   is the exact waste. A cron-triggered function costs ~nothing between runs.
   *Back-of-envelope:* effectively **$0 idle** vs. a permanent memory
   reservation — savings are "whatever the reservation was", pure win because
   there is no latency SLA to protect.
3. **members earn consumer** (`Features/ConsumeEarnEvents`) → a **queue-triggered**
   function that scales with queue depth instead of a fixed replica count. It is
   idle between earn bursts and can lag during them; both are fixed by
   scale-on-depth. *Back-of-envelope:* removes a fixed always-on replica's
   reservation; per-message billing at demo volume is negligible. Caveat: a cold
   start adds latency to the *first* earn after idle — acceptable for an
   asynchronous earn, unacceptable for the synchronous redemption path (which is
   why redemption stays on Kubernetes).

**What stays on Kubernetes** (correctly, per ADR-0012): the members HTTP API
under redemption latency SLAs, the gateway, and the stateful backing services
(Mongo/Cosmos, RabbitMQ) which are always-on regardless. Because that core is
paid for anyway, the *net* saving from moving the three edges is small at demo
scale — which is exactly why ADR-0012 does not do it. The saving grows with
idle time and shrinks with request volume; a spiky, mostly-idle production
tenant is where the hybrid finally pays off.

### The honest bottom line

| | Kubernetes-everywhere (today) | Hybrid (edges → functions) |
|--|-------------------------------|----------------------------|
| Idle cost | Pays for edge pods 24/7 | Edges cost ~$0 at idle |
| Busy cost | Flat (already reserved) | Per-invocation; can exceed pods under sustained high load |
| Operational story | One uniform substrate (the point of the demo) | Fragmented across per-cloud triggers |
| Right call for… | A showcase | A cost-sensitive, spiky production workload |

FinOps is not "serverless is cheaper" — it is *knowing which regime you are in*.
The load tests tell you your request volume; the packing-efficiency ratio tells
you your waste; and only with both do you know whether moving an edge to
scale-to-zero actually saves money or just adds cold-start latency for nothing.
