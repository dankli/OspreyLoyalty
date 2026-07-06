# Domain model — Osprey Loyalty

This document defines the ubiquitous language and business rules for the project. All services, tests, and documentation use the terms below without qualification.

---

## Ubiquitous language

**Member**
A person enrolled in the loyalty programme. Identified by a UUID. Carries a current tier, a points account, and a join date.

**Tier**
The membership level assigned to a member. Five levels exist:

| Tier    | Qualifying points threshold (12-month window) |
|---------|-----------------------------------------------|
| MEMBER  | 0 (default on enrolment)                      |
| SILVER  | 20 000                                        |
| GOLD    | 45 000                                        |
| DIAMOND | 90 000                                        |
| PANDION | Invitation only — no threshold                |

Tier is recomputed on every earn event. A member drops a tier when the rolling window rolls off enough qualifying points. PANDION is granted by an admin or support flow via an `IsPandionInvited` flag; the criteria are secret and the points engine never computes it. An invited PANDION member is unaffected by window roll-off.

**PointsTransaction**
An immutable ledger entry. Every change to a member's points balance is represented as a transaction. Fields: `id`, `memberId`, `type` (earn / burn / expiry / adjustment), `points` (signed integer — positive for earn/adjustment credit, negative for burn/expiry/adjustment debit), `idempotencyKey`, `partnerId` (nullable), `occurredAtUtc`, `createdAtUtc`.

**PointsAccount**
A projection of the ledger stored on the member document for fast reads. Holds `spendableBalance` and `qualifyingPoints` (rolling 12-month window sum). Recomputed from the ledger on every earn; an adjustment or expiry job also triggers a recompute. If the projection is stale after a crash it heals on the next event.

**Partner**
An external earn source. Three partners exist in this demo:

| Partner ID  | Display name | Points per currency unit |
|-------------|--------------|--------------------------|
| `cardco`    | CardCo       | 0.5                      |
| `stayinn`   | StayInn      | 2.0                      |
| `wheelsgo`  | WheelsGo     | 1.5                      |

**EarnEvent**
An event emitted by a partner service when a qualifying purchase is recorded. The earn rate travels with the event so the members service needs no partner reference data at processing time.

Wire format — JSON, camelCase:

```json
{
  "memberId":       "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "partnerId":      "stayinn",
  "amount":         250.00,
  "rate":           2.0,
  "idempotencyKey": "stayinn-txn-98765",
  "occurredAtUtc":  "2025-11-03T14:22:00Z"
}
```

**Redemption**
A request to spend spendable points on a Reward. Appends a burn transaction to the ledger. Must not overdraw the balance. Concurrent redemptions are handled with optimistic concurrency (an ADR will document the choice when phase 3 is implemented).

**Benefit**
A tier-linked perk displayed to the member. No points logic — display only. Examples: lounge access (GOLD+), upgrade voucher (DIAMOND+). Content is driven by a static mapping.

---

## Business rules

1. **Earn formula.** `points = floor(amount × rate)`. The rate is the partner's configured rate-per-currency-unit and travels with the `EarnEvent`.

2. **Tier qualification.** Qualifying points are the sum of earn transactions in a rolling 12-month window. Tier is recomputed after every earn event using the thresholds in the table above. A member's tier can decrease when old earn transactions fall out of the window. An invited PANDION member's tier is unaffected by any window computation.

3. **Idempotency.** The same `EarnEvent` (same `idempotencyKey`) processed twice must produce exactly one `PointsTransaction`. This is enforced by a unique MongoDB index on `PointsTransaction.idempotencyKey`; a duplicate-key error is treated as "already applied" (ADR-0002). The duplicate-delivery test is a first-class showcase in the test suite.

4. **Redemption balance check.** *(Phase 3.)* A burn transaction must not bring `spendableBalance` below zero. Concurrent redemptions must not double-spend.

5. **Point expiry.** *(Phase 3.)* Spendable points expire 24 months after the earn date. Consumption is FIFO.

---

## Seeded demo data

Phase 1 seeds balances directly on member documents so the dashboard is immediately populated. These balances carry no backing ledger transactions. The `PointsAccount` projection is replaced by a ledger-driven recompute on the first real earn event processed in phase 2.
