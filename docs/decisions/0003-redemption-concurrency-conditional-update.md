# ADR-0003: Redemption concurrency via atomic conditional decrement

**Status:** accepted

## Context

Spec rule 4 states: a burn transaction must not bring `spendableBalance` below zero, and concurrent redemptions must not double-spend. The spendable balance is a field on the member document — a single document in MongoDB.

With the members service running as multiple replicas, two redemption requests for the same member can arrive and begin processing at the same moment. Any approach that reads the balance and then writes in separate steps loses the race: both reads see sufficient funds, both writes proceed, and the balance goes negative.

## Decision

A single **atomic conditional update** is the arbiter.

```
UpdateOne(
  filter: { _id: memberId, spendablePoints: { $gte: cost } },
  update: { $inc: { spendablePoints: -cost } }
)
```

The balance check lives inside the filter. MongoDB applies the filter and the increment as one atomic operation. Two concurrent requests cannot both pass it — exactly one will modify the document; the other will get `ModifiedCount = 0`.

**On `ModifiedCount = 0`:** a subsequent existence check distinguishes the two cases — member not found (returns null → 404 at the edge) versus member found with insufficient balance (throws `ArgumentException` → 400).

**The burn ledger entry** is appended after the decrement. It is deduped by the existing unique index on `PointsTransaction.idempotencyKey` (ADR-0002). If two requests slip past the fast-path check and race to insert the burn entry, only one insert succeeds; the other gets a duplicate-key error. The duplicate-key handler compensates by incrementing the balance back (`$inc +cost`), then returns the `alreadyApplied` response — exactly one burn per idempotency key.

**Retried redemptions** (same client idempotency key sent again after a timeout) check for an existing burn entry before attempting the decrement. A found entry returns `alreadyApplied: true` without touching the balance.

## Alternatives considered

**Optimistic concurrency via a version field** — increment a `version` field on each write; retry if the version has changed. Provides the same single-document guarantee but requires a retry loop in application code and adds a field with no other purpose. The conditional filter achieves the same result with less machinery.

**Ledger-sum balance check before write** — compute the balance from the ledger, check it, then insert the burn entry. Racy without a multi-document transaction: another request can decrement between the sum and the insert. This is the check-then-act race the atomic update eliminates.

**Multi-document transactions** — MongoDB supports transactions on replica sets. Would let the balance check and the ledger insert be atomic together. Adds operational requirements (replica set or transactions-capable topology), performance overhead, and lock contention on a hot member document — all to protect one invariant that the conditional update already handles on a single document.

## Consequences

- No overdraw and no double-spend under any number of concurrent replicas, without locks or retry loops.
- A crash between the balance decrement and the burn insert loses the ledger record of that spend. The balance has been decremented but no burn entry exists. This is the same class of projection gap documented in ADR-0002 for the earn-side balance increment; it is accepted for the demo. The production answer is to derive the spendable balance as a ledger sum on every read, making the two steps order-independent.
- Retried redemptions return `alreadyApplied: true` and are indistinguishable from a clean first success from the caller's perspective, which is the correct behaviour.
- The unique idempotency-key index from ADR-0002 carries double duty: earn dedup and burn dedup from the same structural decision.
