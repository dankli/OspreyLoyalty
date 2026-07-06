# ADR-0001: RabbitMQ as the event backbone between partners and members

**Status:** accepted

## Context

Partner services emit `EarnEvent`s when a purchase is recorded. The members service must process them idempotently, recompute tier, and append a ledger entry. A direct HTTP call from partners to members would couple startup order, add synchronous latency to the purchase response, and leave no natural place to handle retries or poison messages.

The system runs in Docker Compose (demo) but the pattern should hold under production conditions: multiple consumer replicas, occasional broker restarts, and bursts from a batch partner job.

## Decision

Use **RabbitMQ 3** (`rabbitmq:3-management` in Compose).

- One quorum queue **`earn-events`** with `x-delivery-limit: 5`. After five delivery attempts the broker dead-letters the message automatically to **`earn-events.dead`** — no custom retry logic in application code.
- Both producer (partners, Java) and consumer (members, .NET) declare the identical topology on startup using passive-or-declare semantics, so startup order does not matter.
- The management UI (`localhost:15672`) is exposed in Compose for local inspection of queue depth and dead-letter contents.

See ADR-0002 for how the consumer achieves idempotency.

## Alternatives considered

**Redis Streams** — already in the infrastructure shape and familiar. Lacks first-class per-message delivery limits and a built-in dead-letter mechanism; replicating that behaviour requires custom consumer-group logic.

**Kafka** — well-suited for high-throughput event streaming but operationally heavy for a three-partner demo. Partitioning, consumer groups, and retention policies would dwarf the application logic.

## Consequences

- At-least-once delivery is guaranteed by the broker; consumers must be idempotent (ADR-0002).
- The queue topology is mirrored in two codebases (`services/partners` and `services/members`). Each file carries a comment pointing to the other — the topology must be kept in sync by hand.
- The dead-letter queue makes poison messages visible without bringing down the consumer. A monitoring alert on `earn-events.dead` depth is the natural next step in a production system.
