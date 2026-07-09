# Data privacy (members service)

An honest inventory of the personal data the members service holds, where it lives, how it is erased on a GDPR request, and what is deliberately out of scope for the demo. Like the [threat model](threat-model.md), several rows end in "accepted for the demo" — each is a documented trade-off, not an oversight.

Read alongside [ADR-0017](decisions/0017-audit-log.md) (audit log) and [ADR-0018](decisions/0018-gdpr-erasure.md) (erasure), which record the decisions this document describes.

## PII inventory — what, and where

| Data | Where it lives | Classification | Notes |
|------|----------------|----------------|-------|
| `Name` | `MemberDocument.Name` (Mongo `members`) | Direct PII | Identifying. Erased → `"[erased]"`. |
| `Email` | `MemberDocument.Email` (Mongo `members`) | Direct PII | Identifying; enrollment normalizes to lowercase. Erased → `null`. |
| `JoinedAtUtc` | `MemberDocument.JoinedAtUtc` | Low-risk | Kept on erasure — not identifying on its own. |
| `IsOspreyInvited`, points, `Id` | `MemberDocument` | Not PII | Account/ledger state; kept on erasure. |
| Adjustment `source` free-text | `PointsTransactionDocument.Source` (Mongo `transactions`) | Possible PII | Operator-authored (`"admin: {reason}"`); could contain PII. Redacted on erasure. |
| Transaction amounts/types/keys | `PointsTransactionDocument` | Not PII | Numeric ledger, linked by `MemberId` only. Retained. |
| `EarnEvent` payload | RabbitMQ message + `PointsTransaction` | **No PII** | Carries `MemberId`, amount, rate, partner, key, timestamp — no name/email. This is load-bearing (see resurrection guard). |
| Audit entries | `AuditLogDocument` (Mongo `audit`) | **No PII** | Actor + action + target id + PII-free details. Deliberately not a PII store. |
| Mongo command text in traces | OTel spans | Possible PII | A query filter or insert can carry name/email. Mitigated — see below. |

## Erasure semantics — pseudonymize and retain

On `DELETE /api/members/{id}/pii` (admin-only), the service **pseudonymizes PII and retains the numeric ledger** (ADR-0018):

- **Erased:** `Name → "[erased]"`, `Email → null`, and an `ErasedAtUtc` marker is stamped. The adjustment `source` free-text is redacted to `"admin: [erased]"` — the one place operator-authored PII could hide in the retained ledger.
- **Kept:** `Id`, `SpendablePoints`, `QualifyingPoints`, `IsOspreyInvited`, `JoinedAtUtc`, and every transaction's numeric fields.

**Why pseudonymize rather than hard-delete?** Points are money-like. There is a legitimate-interest / accounting basis to retain the numeric record of value issued and redeemed. Erasure of *identity* does not require destruction of anonymized *financial history*. Deleting the member and their transactions would destroy that record and orphan aggregate accounting. See ADR-0018 for the alternatives (hash-the-email, hard-delete, soft-delete) and why they were rejected.

**Idempotent.** Re-erasing an already-erased member is a success no-op — the marker is not moved and no second audit entry is written. The endpoint 404s an unknown member.

**Audited.** Each erasure writes an `erase_member` audit entry (actor, target, retained-transaction count) — ADR-0017.

## The resurrection guard

RabbitMQ delivers earn events at-least-once (ADR-0001), so an earn can arrive *after* a member has been erased. This must not silently re-populate name/email.

It cannot, by construction: `EarnEvent` carries **no PII**, and `ApplyEarn` only ever writes `QualifyingPoints` and `SpendablePoints` — never `Name` or `Email`. A late earn against an erased member updates points only. The `ErasedAtUtc` marker records that the erasure happened and makes it durable and auditable; the earn path's PII-blindness is what makes it safe. Both properties are pinned by tests.

## Log / trace PII mitigation

The Mongo driver can attach full command text — which may include a member's name or email in a query filter or insert — to every command trace span. That text would then sit in retained traces, defeating erasure.

`CaptureCommandText` is therefore **off by default**, gated behind `Mongo:CaptureCommandText` (default `false`). Capturing command text is now a deliberate, per-environment opt-in, and must never be enabled where traces reach a shared or retained backend.

## Out of scope for the demo

Honestly, the following are noted but **not** implemented:

- **Backups / snapshots.** Erasure updates the live document; it does not reach into database backups or point-in-time snapshots. Production would need a backup-expiry or crypto-shredding strategy.
- **Already-exported traces / logs.** The mitigation stops *new* PII entering command spans; it does not retroactively scrub traces already exported before the change.
- **Self-service erasure.** Erasure is an operator-driven admin action, not a member-facing self-service flow.
- **Legal-hold exceptions** and jurisdiction-specific retention rules.
- **Audit read surface.** Audit history is readable in Mongo; exposing and access-controlling it over an API is not built.

Each of these is a deliberate demo boundary, not an accidental gap.
