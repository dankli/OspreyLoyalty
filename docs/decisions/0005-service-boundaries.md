# ADR-0005: Service boundaries

**Status:** accepted

## Context

The repo needs deployable units with distinct build artifacts and CI pipelines. The guiding principle from the project spec is _microservices only when they pay for themselves_: a split is justified when it removes a real constraint — a team boundary, an independent release cadence, an incompatible consistency requirement, or a genuinely different scaling profile — not simply because the architecture diagram looks cleaner.

There is a second forcing function that is honest to name: each service is meant to demonstrate a distinct technology. The repo exists to show multi-language, full-stack engineering. That is a valid reason to draw a boundary here; it would not be a valid reason in a production codebase, and the distinction matters.

## Decision

Four services, plus three frontend artifacts that are not services.

**`services/members` (C# / .NET 10)** — the core loyalty domain. Enrollment, the tier ladder, the points ledger, redemption, expiry. This is the service with the deepest quality bar; C# and .NET are the right tool for a domain-heavy core with strict TDD, Vertical Slice Architecture, and a railway-oriented request flow (described under Consequences).

**`services/gateway` (TypeScript / Node 22)** — the BFF for both frontends. Owns the GraphQL schema the member portal queries, plus the REST proxy used for health checks and thin integrations. The aggregation and contract edge: it translates between the member portal's needs and the REST interfaces of members and partners, and it enforces a 2-second timeout on every upstream call. TypeScript on Node is the right fit for a layer that is mostly receiving, validating and reshaping JSON.

**`services/partners` (Java 21 / Spring Boot)** — simulates external partner earn flows (CardCo, StayInn, WheelsGo). In a real loyalty platform a partner integration would be an entirely separate system under a different team; the boundary here reflects that reality. It also demonstrates the Java/Spring Boot stack.

**`services/points-engine` (Rust, phase 5)** — a pure calculation path extracted from members in a later phase, with its own ADR. It does not exist yet. Frontends are not services; they are static build artifacts served by Nginx.

**Why members is not split further.** Ledger, tiers, redemption, and expiry all share a single consistency boundary: one MongoDB document per member, one conditional atomic update, one idempotency index. Splitting them would buy network hops and distributed invariants (two-phase commit, compensating transactions, or eventual consistency) in exchange for nothing at this scale. The test that one `EarnEvent` produces exactly one `PointsTransaction` — the showcase rule — would become a distributed coordination problem instead of a single unique-index check.

## What would trigger a split later

- A team takes ownership of, say, the redemption surface and needs an independent release cadence.
- The queue consumer and the HTTP API need to scale independently (the consumer is CPU-bound on high-volume earn; the HTTP API is latency-bound on redemption).
- The consistency boundary stops being shared — for example, expiry moves to a separate ledger store with different retention requirements.

## Alternatives considered

**One monolith.** Would be the right call in a production codebase with one team at this scale. Rejected here because demonstrating multi-language integration is an explicit goal of the repo.

**More granular splits (e.g. a separate tier service, a separate ledger service).** Every proposed split collapses back into the members service: tier recomputation reads the ledger; the ledger write and the tier update share a document; the balance check and the burn entry are one atomic operation. There is no seam to cut without introducing distributed invariants.

## Consequences

- Four container images and four CI pipelines (`members.yml`, `gateway.yml`, `partners.yml`, plus a future `points-engine.yml`).
- The gateway owns the frontend-facing contract. Adding a field to a GraphQL type is the gateway's concern; the members REST API is an internal contract.
- Cross-service invariants — idempotency, duplicate delivery — are handled by the patterns in ADR-0002 and ADR-0003, not by distributed transactions.
- The admin portal calls members and partners directly over REST (demo CORS, no auth). In production those calls would route through an authenticated BFF.
- **Railway-oriented request flow in members.** Validation, loading and preconditions run as endpoint-pipeline guards (`Infrastructure/Pipeline/Guard.cs`) that short-circuit to the right HTTP status _before_ the handler; the handler runs the happy path only. Expected sad paths — malformed input, insufficient balance, unknown member/reward, overdraw — are returned as small **feature-local outcome values** (e.g. `Redeem.Outcome`, `AdjustPoints.Outcome`), never thrown. Exceptions are reserved for genuine technical faults (→ the framework's default 500) and, on the queue leg, poison-message dead-lettering. This deliberately avoids a fleet-wide generic `Result<T>`: that native railway lives only in the Rust points-engine (ADR-0006), where the type is idiomatic. C# and Java stay value-and-exception idiomatic, not monadic.
