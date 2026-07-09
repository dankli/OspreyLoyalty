# ADR-0018: GDPR right-to-erasure via pseudonymize-and-retain

**Status:** accepted

## Context

Under GDPR Article 17 a member may request erasure of their personal data. The members service holds member PII in `MemberDocument`: `Name` and `Email` (identifying), alongside `JoinedAtUtc` and the OSPREY flag. The `PointsTransaction` ledger links to a member by `MemberId` only and carries no direct PII — except that an adjustment's `source` free-text (`"admin: {reason}"`) is operator-authored and *could* contain PII.

Two obligations pull in opposite directions:

- **Right to erasure** — the member's identifying data must go.
- **Ledger / accounting integrity** — the points ledger is money-like and there is a legitimate-interest / legal basis to retain the numeric record of value issued and redeemed. Deleting the member document and its transactions outright would destroy that record and orphan any aggregate accounting.

We also have to prevent **PII resurrection**: an at-least-once earn event redelivered *after* erasure must not silently re-create name/email.

## Decision

**Pseudonymize the PII, retain the numeric ledger.** A new admin-only slice `EraseMember` (`DELETE /api/members/{id}/pii`) performs:

1. **Pseudonymize `MemberDocument`:** `Name → "[erased]"`, `Email → null`, and stamp an `ErasedAtUtc` marker. **Keep** `Id`, `SpendablePoints`, `QualifyingPoints`, `IsOspreyInvited`, `JoinedAtUtc` — the account survives, stripped of identity.
2. **Retain `PointsTransaction`s** (the numeric ledger, linked by `MemberId`) untouched in their amounts and types. **Defensively redact** the one free-text field that could hold PII: adjustment entries' `source` is set to `"admin: [erased]"`. Points and every other field are left intact — the numeric ledger is fully preserved.
3. **Write an audit entry** (`action = erase_member`, ADR-0017) recording who erased whom and how many transactions were retained.

**Idempotent.** Erasing an already-erased member (`ErasedAtUtc` already set) is a success no-op: no re-pseudonymize, no second audit entry, and the original marker is returned unchanged. The endpoint validates the member exists (404 otherwise).

**The `ErasedAtUtc` marker is the resurrection guard.** `EarnEvent` carries no PII (only `MemberId`, amount, rate, partner, key, timestamp — see the earn contract). `ApplyEarn` only ever `Set`s `QualifyingPoints` and `Inc`s `SpendablePoints`; it never writes `Name` or `Email`. Therefore a redelivered or late earn against an erased member updates points only and can never re-populate identity. The marker makes the erasure durable and auditable, and the earn path's PII-blindness is what makes it safe — a property this ADR pins down and the test suite verifies.

**Log-PII mitigation.** The Mongo driver's `CaptureCommandText` (which puts full command text — including a member's name/email in a filter or insert — into trace spans) is changed from unconditionally `true` to config-gated **OFF by default** (`Mongo:CaptureCommandText`, default `false`). Erased PII must not linger in retained traces, and it must be a deliberate, per-environment choice to capture command text at all.

## Alternatives considered

**Hard-delete the member and all transactions** — simplest to reason about for erasure, but destroys the money-like ledger and the accounting record of value issued/redeemed, which there is a legitimate basis to retain. Erasure of identity does not require destruction of anonymized financial history.

**Hash the email instead of nulling it** — a stable non-reversible hash preserves "same person across records" linkage. We do not need that linkage post-erasure, and a hash of a low-entropy identifier (an email) is trivially reversible by dictionary attack, so it would be pseudonymization in name only. `null` is honest and unambiguous.

**Keep the member document but delete only transactions** — inverts the trade-off: loses the ledger (the thing worth keeping) while retaining identity (the thing that must go). Exactly backwards.

**Soft-delete flag with no PII change** — hiding the record from reads is not erasure; the PII still exists at rest and in backups. Pseudonymizing the stored values is the actual erasure.

## Consequences

- Identity (`Name`, `Email`) is removed from the live document; the account, its balances, tier eligibility and numeric ledger survive for accounting integrity.
- The operation is idempotent and safe to retry (at-least-once admin tooling, double-clicks); a re-erase returns `alreadyErased: true` and touches nothing.
- The `ErasedAtUtc` marker plus the PII-free earn path guarantee no resurrection: a late earn bumps points, never identity.
- Adjustment `source` free-text is redacted on erasure, closing the one place operator-authored PII could hide in the retained ledger. This is a targeted, single-field in-place write to an otherwise-immutable ledger — the *only* sanctioned reason to touch a past ledger row, and it changes no numeric value.
- Command-text capture is off by default, so member PII no longer flows into Mongo command spans unless an operator explicitly opts in per environment.
- **Out of scope for the demo:** erasing PII from database backups/snapshots and from already-exported traces/logs; a self-service member-facing erasure request flow (this is an operator-driven admin action); and legal-hold exceptions. These are noted, not implemented.
