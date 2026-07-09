# ADR-0016: Transactional outbox for the partners earn path

**Status:** accepted

## Context

The partners service emits an `EarnEvent` when a purchase is recorded (ADR-0001). Until now that publish was fire-and-forget: `PurchasesController.purchase()` called `RabbitTemplate.convertAndSend(...)` directly on the request thread. If RabbitMQ was down or unreachable, the send threw, the purchase returned **500**, and the earn was **lost** — the caller saw a failure and there was no durable record to retry from. Partners was stateless, so there was nowhere for an unpublished earn to wait out a broker outage.

This is the classic dual-outcome problem: the API's success and the message's delivery were coupled to the broker being up at that exact instant. A broker restart, a network blip, or a rolling RabbitMQ upgrade turned into lost loyalty points.

The members side is already built for at-least-once: it dedups every earn on a unique `idempotencyKey` (ADR-0002). So the missing half is purely on the producer: make the earn **durable at the moment of purchase** and publish it **asynchronously and reliably** afterwards.

The infrastructure already runs a MongoDB (the members service's store; Compose service `mongo:27017`). Reusing it avoids adding a new datastore for a single collection.

## Decision

Introduce a **transactional outbox** in partners, backed by MongoDB.

- Add `spring-boot-starter-data-mongodb`. Partners connects via `spring.data.mongodb.uri` (env-overridable `SPRING_DATA_MONGODB_URI`), defaulting to `mongodb://localhost:27017/osprey_partners` for local `mvnw` runs and `mongodb://mongo:27017/osprey_partners` in Compose/k8s. Partners uses its **own database** (`osprey_partners`) so it never collides with members' collections.

**Write-then-relay:**

1. **On purchase**, instead of publishing synchronously, persist **one** `OutboxEntry` document (status `PENDING`, the full `EarnEvent` embedded, `createdAt`, `attempts = 0`, `nextAttemptAt`) and return success **immediately**. The API no longer depends on RabbitMQ being up — the earn is durable the moment the purchase returns `202`.

2. **A relay** (`@Scheduled(fixedDelayString = ...)`, ~1s, configurable) drains the outbox: it atomically **claims** a bounded batch of due `PENDING` entries, publishes each to RabbitMQ via the existing publish path (which keeps the service-token minting and W3C `traceparent` stitching, ADR-0007/0008), marks `PUBLISHED` on success, and on failure increments `attempts` and sets a backoff `nextAttemptAt`. After a bounded `max-attempts` an entry is marked `FAILED` and logged for operator follow-up — never retried forever.

**Multi-pod claim.** Each claim is a single atomic `findAndModify`: it matches a row that is due (`nextAttemptAt <= now`) and either `PENDING` or a `SENDING` row whose lease has lapsed, and flips it to `SENDING` stamped with this pod's owner id and a fresh lease (`leaseExpiresAt`). Because match-and-flip is one atomic operation, five pods racing the same row leave exactly one winner; the losers no longer match it. A pod that crashes mid-publish leaves a `SENDING` row whose lease eventually lapses and is reclaimed on a later pass.

**No unique index on `idempotencyKey`.** Each `OutboxEntry` is keyed by its own `_id`, **not** by the business `idempotencyKey`. This deliberately preserves the duplicate-delivery demo: `PurchasesController`'s `/duplicate-demo` endpoint writes **two** outbox rows carrying the same `idempotencyKey`; the relay publishes **both**; the members consumer dedups them to **one** ledger entry (ADR-0002). A unique index on the business key would have rejected the second row and broken the showcase. At-least-once is the contract, and the consumer's dedup is the arbiter.

## Alternatives considered

**Keep fire-and-forget, add a retry/buffer in memory** — an in-process queue survives neither a crash nor a pod eviction, and is wrong across the ≥5 replicas that run in production. It moves the lost-earn window rather than closing it.

**Publisher confirms + application-side retry** — RabbitMQ publisher confirms tell you a send failed, but with no durable store there is still nothing to retry from once the process dies. Confirms are complementary to an outbox, not a substitute.

**A dedicated queue/stream (e.g. Kafka) as the durable log** — heavier operationally than reusing the Mongo already in the stack, for a single producer collection (echoes ADR-0001's reasoning).

**Unique index on `idempotencyKey` in the outbox** — would give producer-side dedup, but breaks the duplicate-demo and duplicates a guarantee the consumer already owns (ADR-0002). Rejected.

## Consequences

- **Partners is now stateful.** It owns the `outbox` collection in its own `osprey_partners` database and depends on MongoDB being reachable at startup and on the purchase path. Compose and k8s add the Mongo dependency/env; in Compose, `partners` now `depends_on` `mongo` being healthy.
- **The purchase API is decoupled from RabbitMQ.** A broker outage no longer fails a purchase; the earn waits durably in the outbox and publishes when the broker returns. The API's success now means "durably recorded", not "delivered".
- **At-least-once, end to end.** A crash after publish but before the `PUBLISHED` write re-publishes on the next pass. That is safe precisely because members dedups on `idempotencyKey` (ADR-0002). The outbox does not attempt exactly-once.
- **Everything is bounded.** Batch size, max attempts, lease duration, and backoff base are all configuration with finite defaults (`osprey.outbox.*` / `OUTBOX_*` env) — no unbounded fan-out, no infinite retry, no unbounded backlog scan per pass.
- **e2e timing holds.** With a ~1s relay interval the earn lands within a second or two of purchase, well inside the e2e suite's ~60s retry window.
- **Terminal `FAILED` entries accumulate** in the collection and are surfaced by an error log; a monitoring alert on `FAILED` count (and a cleanup/replay tool) is the natural next step, mirroring the dead-letter follow-up noted in ADR-0001.
- **Integration tests need Docker.** The outbox repository and relay are covered by Testcontainers-Mongo integration tests, matching how members tests use Testcontainers; they self-skip (not fail) where no usable Docker is reachable, so `mvnw test` stays green on machines without Docker.
