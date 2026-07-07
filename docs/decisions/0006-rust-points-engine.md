# ADR-0006: Rust points-engine as a standalone service

**Status:** accepted

## Context

Spec §4.4 asks for a worked example of the "microservices only when they pay for themselves" principle — in both directions. A loyalty platform recomputes points on every earn event across every partner integration. Add promotion rules and the calculation becomes a genuinely hot, allocation-sensitive, pure path with a clear performance argument.

The three-line formula in `services/members` (`ApplyEarn.PointsFor`) already handles the no-promotion case. The question is whether extraction into a Rust service is justified, and where the honest line sits between "pays for itself" and "architecture theater."

## Decision

Build a standalone Rust service (`services/points-engine`, axum, rust_decimal) that owns the full promotion-aware calculation: `floor(amount × rate × Π promotion_multipliers)`. It is heavily property-tested with proptest and exposes an HTTP API so it can be called from any service.

The service is deliberately **not wired into the members earn path.** At this repo's scale a synchronous network hop — serialisation, TCP round trip, deserialisation — costs orders of magnitude more than the three arithmetic operations members already performs. Wiring it in would demonstrate the pattern while actively worsening the system, which is architecture theater.

`ApplyEarn.PointsFor` in members remains the earn path for all current earn events. The e2e smoke test asserts that the two implementations agree for the no-promotion case: this is the **parity contract** that keeps them from drifting without a real integration dependency.

### What would justify wiring it in

- **Batch ledger repricing.** Retroactively recomputing points across millions of historical rows when a partner rate or promotion changes — a CPU-bound job where Rust throughput is the bottleneck, not network latency.
- **Promotion simulation.** A marketing tool that scores millions of member/event combinations against candidate promotion configurations. At that fan-out the throughput delta matters.
- **Promotion rules hot enough to dominate the earn pipeline.** If a complex promotion engine (time-window rules, tier-conditional multipliers, partner-specific caps) grows to the point where it dominates earn latency and release cadence, extracting it behind a versioned API isolates its deployment from members.

None of those conditions hold in this repo. The extraction is justified here as a demonstration, not as the right production answer at this scale.

## Alternatives considered

**Implement promotions inside members.** Keeps the earn path in one binary and avoids the network hop. The downside in a production system: couples a hot earn pipeline to the promotion engine's release cadence and memory footprint. The right call at demo scale but not the interesting trade-off to demonstrate.

**FFI a Rust library into .NET.** Captures some of the throughput gain without the network hop. Introduces P/Invoke plumbing, lifetime management, and a non-standard build step — operational novelty without the service-boundary demonstration the spec asks for.

## Consequences

- Two implementations of the same formula (mitigated by the e2e parity check and by promotions existing only in the engine, so the feature sets deliberately diverge).
- One additional container image and CI pipeline (`points-engine.yml`).
- A Criterion benchmark in the service quantifies the throughput claim. Numbers land in the service README once measured.
- Promotion rules are today a points-engine concept only. Adopting them in the members earn flow is future work and would require routing earn calculations through the engine per this ADR — a decision with real latency implications that must be made deliberately.
