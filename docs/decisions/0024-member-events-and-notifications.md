# ADR-0024: Member domain events over a transactional outbox, and an email notifications service

**Status:** accepted

## Context

The platform's only domain event was `EarnEvent` (partners → members). Everything members itself concludes — a tier promotion, a sweep downgrade (ADR-0023-adjacent requalification work), points about to expire — stayed invisible: a member discovered an expiry after the fact, in the transaction list. Emitting these as events unlocks the first consumer (email notifications) without coupling members to any delivery channel. The write side already had a proven pattern for exactly this problem: partners' transactional outbox (ADR-0016).

## Decision

**Members gets a transactional outbox.** Domain changes insert an `OutboxDocument` into the same Mongo database; a relay hosted service polls every 2 seconds and publishes to a new durable topic exchange `member-events` (routing keys `tier.changed`, `points.expiring`), stamping `PublishedAtUtc`. The relay is at-least-once — a crash between publish and stamp republishes — and has an `OutboxRelay` kill switch like every other background worker.

**The outbox document id IS the event id, and it is deterministic.** Earn-path tier changes derive it from the ledger entry (`tier-{memberId}-{newTier}-{entryId}`), sweep changes carry a day stamp (`tier-{memberId}-{newTier}-{yyyyMMdd}`), expiry warnings are once-per-lot (`expiring-{earnId}`). Re-emission from any retry or overlapping sweep hits the primary key and no-ops — the ADR-0002 idempotency mechanism, reused for events. Outbox entries are never deleted; at demo scale the collection is the audit trail of what was published.

**Events carry no PII.** A consumer that needs the member's email resolves it from members at send time — an erased member (ADR-0018) resolves to null and the notification is skipped. This keeps the events replayable without dragging personal data through the broker.

**A new `notifications` service (TypeScript/Node) is the first consumer.** It declares the earn-events topology one exchange over — quorum queue `notifications` bound `#`, dead-letter after 5 attempts — applies the same ack/dead-letter/requeue semantics as the members earn consumer, dedups on the event id (bounded in-memory set; a duplicate email in the demo sink is tolerable), and delivers over SMTP to **Mailpit**, whose UI at `mailpit.osprey.localtest.me` shows what a member would have received. Mail bodies are English-only: the member's UI language is a browser-side choice the backend never sees; a stored contact-language preference is the noted follow-up.

**Contracts follow ADR-0014.** JSON Schemas + fixtures live in `contracts/member-events/`; members holds the producer-side test (records serialize to the schema's wire names), notifications the consumer side (AJV against the fixtures + runtime shape guards), and the e2e smoke asserts the whole chain by finding the tier email in Mailpit after the demo promotion.

## Alternatives considered

**Publish directly from the handler (no outbox).** A broker outage would either fail the earn (coupling points-crediting to RabbitMQ) or silently drop the event. The outbox rides the Mongo write that already happened and drains later — the exact reasoning of ADR-0016.

**Notifications inside members.** Fewer moving parts, but couples the domain service to SMTP and every future channel; a queue consumer per channel is the shape the fleet already demonstrates.

**Localized mail bodies.** Requires a persisted language preference on the member (consent-adjacent, enrollment change); deferred rather than guessed from `Accept-Language` at enrollment time.

## Consequences

- Tier changes and expiry warnings become observable outside members — email today, any consumer tomorrow, without members changing.
- Two new containers (notifications, Mailpit) in compose and k8s; the notifications workload follows the fleet hardening baseline.
- The outbox collection grows monotonically (never deleted); a retention sweep is a known follow-up if this were long-running.
- In-memory consumer dedup means a redelivery after a pod restart can re-send an email — accepted for a demo mail sink, and the deterministic event ids make a durable dedup store a drop-in upgrade.
