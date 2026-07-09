# ADR-0017: Append-only audit log for privileged actions

**Status:** accepted

## Context

The members service exposes privileged admin/support mutations that move money-like state: manual points adjustments (`POST /api/members/{id}/adjustments`), the OSPREY invitation toggle (`PUT /api/members/{id}/osprey`), and — from ADR-0018 — GDPR erasure (`DELETE /api/members/{id}/pii`).

Before this decision, the only trace of who did what was the ledger entry's `source` free-text (`"admin: {reason}"`). That records the *reason* but never the *actor*: there was no way to answer "who granted this member OSPREY?" or "which operator adjusted this balance, and when?". For a compliance-sensitive, points-are-money system that is a gap — privileged actions must be attributable.

The caller identity was already validated at the framework level (the JWT `sub` claim is checked by JwtBearer when `Auth:Enabled`, ADR-0007), but it was never extracted into the handlers, so nothing downstream could record it.

## Decision

An **append-only audit collection** (`AuditLogDocument` in Mongo) records every privileged action. Each entry carries:

- `Actor` — the caller's `sub` (subject) claim,
- `Action` — one of `adjust_points`, `set_osprey`, `erase_member`,
- `TargetMemberId` — the member acted upon,
- `Details` — a small structured, PII-free bag (points+reason, `invited=true/false`, retained-transaction count),
- `CorrelationId` — the per-request id (ties the audit line to the request logs/traces),
- `OccurredAtUtc`.

**Insert-only.** The writer (`Audit.Writer`) only ever `InsertOneAsync`s — never update, never delete. The collection is the tamper-evident trail; there is no code path that mutates a past entry. An index on `(TargetMemberId, OccurredAtUtc desc)` serves the only query shape that matters: "what happened to member X, newest first".

**Actor capture.** The minimal-API endpoints resolve the actor from `HttpContext.User` at the edge (`Audit.Caller.From`) and pass a small `Caller.Context` (actor + correlation id) into the handler. The handler never touches `HttpContext` — I/O stays at the edges (A-frame). The `sub` claim is read either as `ClaimTypes.NameIdentifier` (JwtBearer maps `sub` there by default) or the raw `sub` claim, covering both claim-mapping modes.

**Anonymous fallback under the kill-switch.** Auth is opt-in via `Auth:Enabled` (default OFF for local/dev/tests). When it is off there is no authenticated principal, so the actor is recorded as the honest literal **`anonymous (auth disabled)`** — not a fabricated user, not an empty string. The audit trail never lies about who it does not know.

**Edge concern, off the happy path.** The audit write happens after the privileged mutation has committed, as an edge step in the handler (like the ledger write in ADR-0002). A retried idempotent action (an adjustment with an already-applied key) changed nothing new and therefore writes no second audit entry — the trail stays idempotent too.

## Alternatives considered

**Reuse the ledger `source` field** — cram the actor into `"admin: {actor}: {reason}"`. Conflates two concerns (the accounting ledger vs. the security trail), only covers point-moving actions (the OSPREY toggle writes no ledger entry), and mixes a free-text field that may itself carry PII with an attribution record. A separate collection keeps each concern clean.

**Structured logs only** — emit an audit line to stdout/Loki instead of a collection. Logs are retention-bounded and mutable-in-practice (rotated, dropped, sampled); they are the wrong substrate for a durable, queryable "who touched this member" trail. Logs remain useful for the request narrative; the audit collection is the record of authority.

**Write the audit inside a transaction with the mutation** — atomically bind the mutation and its audit entry. Adds the same multi-document-transaction cost rejected in ADR-0003 to protect an invariant the demo does not need: an audit gap on a crash between mutation and audit-write is the same accepted projection-gap class documented across ADR-0002/0003.

## Consequences

- Every privileged action is attributable to an actor (or honestly to `anonymous (auth disabled)` when the kill-switch is off), with correlation id, timestamp and structured details.
- The audit write is a side effect after the committed mutation. A crash in the window between the mutation and the audit insert loses that one audit entry — the same projection-gap trade-off accepted elsewhere for the demo; the production answer is an outbox/transactional write.
- `Details` is deliberately PII-free: names and emails never enter the audit trail, so the trail itself does not become a new PII store to erase (see ADR-0018).
- Anyone can *read* audit history via Mongo; exposing it over an API and access-controlling that read surface is out of scope for the demo.
