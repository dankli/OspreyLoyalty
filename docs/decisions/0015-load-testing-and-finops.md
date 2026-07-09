# ADR-0015: Load/soak testing with k6, and cost reasoning via FinOps

**Status:** accepted

## Context

The repo already proves *correctness* on every push: `infra/e2e-smoke.sh` walks
the full demo flow through the compose stack in the `e2e` workflow. What it does
not prove is *behaviour under load* — that the redemption path holds its latency
when several members hit it at once, that the earn pipeline does not back up, or
that a sustained trickle of traffic does not slowly leak memory. Correctness and
performance are different questions and want different tests.

There is also a cost question with no artefact behind it. ADR-0012 made a
deliberate, cost-aware decision (Kubernetes over serverless, scale-to-zero left
on the table for the stateless edges) and explicitly said the hybrid would be
the right call *if this were cost-optimised rather than showcase-optimised*.
That reasoning deserves to be written down and, crucially, connected to a way of
*measuring* the numbers rather than asserting them — otherwise "cost does not
bite at this scale" is a claim no one can check.

Two forces shape how far to take this:

- **Load tests are slow and flaky-prone**, because they boot the whole fleet and
  push real traffic through it. Gating every push on them would make `main` red
  for reasons that are about a laptop runner's mood, not the code.
- **This is a demo.** The point is to demonstrate the *pattern* — an executable
  SLO gate, a measured packing-efficiency ratio, a defensible serverless
  trade-off — not to publish production-tuned numbers.

## Decision

Add **k6** load and soak scripts under `infra/load/` that drive the real user
journeys (earn / redeem / dashboard+profile read), copied from the e2e smoke
flow so the load mirrors the demo rather than a synthetic endpoint, and gate
each run on **SLO-style k6 thresholds** (per-journey p95 latency and error-rate
budgets) so the run has a machine-checkable pass/fail verdict.

Run them **on a schedule and on manual dispatch only** — `.github/workflows/load-test.yml`
triggers on `workflow_dispatch` and a weekly `schedule`, **never** on push or
pull_request. Per-push correctness stays with the `e2e` workflow; load testing
is a periodic health check that can never turn `main` red.

Reason about cost via **FinOps** in `docs/finops.md`: right-sizing under the
Guaranteed-QoS (request == limit memory) posture the backend pods now run, a
simple node-cost model, how to measure real cost (OpenCost/Kubecost on the
cluster, backed by the Prometheus already deployed), VPA/HPA recommendations,
and a back-of-envelope for the three edge workloads ADR-0012 named as
scale-to-zero candidates. This ADR and that doc are two halves of one thing:
the load test tells you your request volume, and FinOps turns that into a cost
and a right-sizing decision.

## Why

- **Two axes, two harnesses.** e2e-smoke answers "is it correct?" on every push;
  k6 answers "is it fast enough under load?" on a schedule. Collapsing them would
  either slow every push to a crawl or leave performance untested.
- **An SLO you cannot fail is not an SLO.** Encoding p95/error budgets as k6
  thresholds makes the objective executable — the run exits non-zero on a breach,
  the same discipline as a failing unit test, and it ties back to the alerting in
  `infra/observability` (ADR-0008).
- **Cost claims should be checkable.** ADR-0012 asserts cost does not bite at
  demo scale. FinOps + a measurable packing-efficiency ratio makes that a number
  you can verify, and names exactly when the opposite becomes true.
- **Never red `main` for a slow test.** Scheduled + manual triggers are the whole
  point: load tests inform, they do not gate.

## Alternatives considered

**Run k6 on every push/PR (gate on it).** Rejected: load runs are minutes long
and sensitive to runner contention; they would make `main` red for reasons
unrelated to the change, training everyone to ignore the signal. Scheduled runs
keep the signal trustworthy.

**A heavier tool (Gatling, Locust, JMeter).** Rejected for this repo: k6's
scripts are plain JS, diff cleanly, need no JVM or extra service, run identically
from the `grafana/k6` image locally and in CI, and express thresholds natively.
The others buy features a demo does not need at the cost of weight.

**Skip load testing; rely on e2e-smoke.** Rejected: correctness under a single
request says nothing about latency under concurrency or leaks under duration —
the exact failures a loyalty backend hits in production.

**Real cost tooling wired into the demo (OpenCost deployed in compose).**
Rejected as out of scope: OpenCost needs cloud billing rates to be meaningful and
adds an always-on workload to a laptop stack. `docs/finops.md` documents how to
deploy it on a real cluster instead — the honest boundary for a demo.

## Consequences

- Performance regressions surface on the weekly run (or on demand before a demo),
  not for the first time in front of an audience. Investigating a red load-test
  run is deliberately decoupled from shipping code.
- The k6 thresholds are demo-generous (a laptop runs the whole fleet plus
  observability); they demonstrate the SLO-as-code pattern and must be tightened
  against a real error budget before they mean anything in production.
- The backend pods' Guaranteed-QoS posture makes cost trivial to attribute but
  makes honest requests essential — stale requests are pure, permanent waste,
  which is why `docs/finops.md` leans on VPA-in-recommend-mode and the load-driven
  measurement loop.
- The serverless trade-off ADR-0012 left open now has numbers attached. If the
  goal ever flips from showcase to cost-minimisation, moving `points-engine`, the
  expiry sweep and the earn consumer to scale-to-zero is a contained change
  behind their existing HTTP/queue contracts — this ADR and the FinOps doc record
  why and roughly what it saves.
- **Out of scope for the demo:** production-tuned thresholds, a deployed
  OpenCost/Kubecost instance, distributed/multi-region load generation, and
  chaos/fault injection. Each is noted as the real-cluster next step rather than
  faked here.
