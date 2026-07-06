# ADR-0002: Idempotency via unique index on PointsTransaction.idempotencyKey

**Status:** accepted

## Context

Spec rule 3 states: the same `EarnEvent` processed twice must produce exactly one `PointsTransaction`. This is the showcase rule for the project.

With RabbitMQ delivering at-least-once (ADR-0001) and potentially multiple consumer replicas running in parallel, duplicate delivery is not an edge case — it is the expected steady state under restarts and rebalances. Any dedup strategy that relies on application-level coordination is racing against itself.

## Decision

A **unique index** on `PointsTransaction.idempotencyKey` in MongoDB is the single arbiter of whether an event has already been applied.

Processing flow:

1. Deserialise the `EarnEvent` from the queue message.
2. Attempt to insert a new `PointsTransaction` with `idempotencyKey` set to the event's key.
3. If the insert succeeds, continue: recompute tier, update the `PointsAccount` projection on the member document.
4. If MongoDB returns a duplicate-key error (`E11000`), treat the event as already applied — acknowledge the message and return without any further side effects.

The database enforces the invariant. No lock, no pre-check, no cache.

## Alternatives considered

**Check-then-insert** — query for an existing transaction before inserting. Loses the race between the query and the insert under concurrent consumers; the unique index is the only way to close that window.

**In-memory dedup cache** — fast but lost on restart and wrong across multiple pods. Does not survive any failure mode that matters.

**Distributed lock (Redis/Mongo advisory lock)** — adds complexity without a stronger guarantee. The unique index already provides the atomic all-or-nothing semantics a lock is trying to replicate.

## Consequences

- The ledger insert must happen **before** any projection updates (tier, balance). The healing guarantee differs per projection: **qualifying points** are recomputed from the ledger on every earn, so a crash between insert and projection leaves them stale only until the next event — they self-heal. **Spendable points** are a one-time increment protected by the dedup: a crash between the ledger insert and the projection update loses that increment, because the duplicate-key path returns without re-applying it. This is accepted for the demo; the production answer is to recompute the spendable balance as a ledger sum too.
- `idempotencyKey` on `PointsTransaction` is required and indexed; any earn path that does not supply one is a bug caught at the boundary.
- The duplicate-delivery test (`Same_earn_event_delivered_twice_produces_exactly_one_transaction`) exercises this path directly and is treated as a first-class showcase in the test suite.
