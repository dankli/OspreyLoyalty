# Threat model (STRIDE)

A STRIDE pass over Osprey Loyalty: what an attacker could try, what already defends against it, and — honestly — what does not yet. This is a demo, so several rows end in "accepted for the demo"; each of those is a deliberate, documented trade-off, not an oversight. The point of writing it down is that the difference is visible.

Read this alongside the [architecture overview](architecture.md) (the container diagram and trust boundaries) and [ADR-0007](decisions/0007-zero-trust-auth.md) (the zero-trust model).

## Scope and assets

**In scope:** the five backend services, the three frontends, the RabbitMQ earn hop, MongoDB, and the first-party identity service.

**Assets worth protecting:**

1. **The points ledger** — points are money-like. Minting, double-spending, or altering points is the highest-value target.
2. **Member PII** — names, emails, transaction history.
3. **Tier status** — especially the invitation-only OSPREY tier.
4. **Signing keys and tokens** — the RSA key that mints fleet-wide JWTs.
5. **Availability** of the earn and redeem paths.

## Trust boundaries

| # | Boundary | Carries |
|---|----------|---------|
| B1 | Browser → frontends (Nginx static) | public assets |
| B2 | SPA → security IdP | OIDC authorization code + PKCE |
| B3 | SPA → gateway (GraphQL) | Bearer access token |
| B4 | admin-portal → members / partners (direct REST) | Bearer (demo CORS) |
| B5 | gateway → members / partners (REST, 2 s timeout) | forwarded Bearer + correlation id |
| B6 | partners → RabbitMQ → members (async earn) | `EarnEvent` + service token in payload |
| B7 | services → security (JWKS) | signature verification |
| B8 | services → MongoDB | tenant/member-scoped queries |

## STRIDE analysis

### S — Spoofing (who are you?)

| Threat | Mitigation / status |
|--------|---------------------|
| Forged access token to call members/partners (B3–B6) | Each backend validates the JWT signature against the IdP's JWKS (RS256) under zero-trust; the gateway is **not** a trust boundary — it forwards the bearer and every hop re-validates ([ADR-0007](decisions/0007-zero-trust-auth.md)). **Gap:** zero-trust is **off by default** (kill-switch) so the demo runs open. |
| Stolen authorization code replayed (B2) | Browser clients are **public + PKCE** — the code is useless without the verifier. No client secret is shipped to the browser. |
| A rogue service consuming the earn queue impersonates members (B6) | The `EarnEvent` carries a short-lived HS256 service token that members validates before applying. **Gap:** this async hop is the last zero-trust surface still being hardened (roadmap). |
| Correlation id spoofed to poison logs | Correlation ids are for tracing only; they grant no authority. |

### T — Tampering (did you change it?)

| Threat | Mitigation / status |
|--------|---------------------|
| Alter points in flight on the earn path (B6) | Points are computed server-side by members from `amount × rate`; the client never supplies a point total. The ledger entry is immutable once written. |
| NoSQL/DQL injection into Mongo queries (B8) | Queries use the typed driver with parameterised filters, never string-concatenated query bodies. |
| Tamper with a JWT's claims (roles, aud) | Any change breaks the RS256 signature; validation rejects it. |
| Man-in-the-middle on service-to-service calls | Accepted for local demo (HTTP inside the cluster). In production this is mTLS / a service mesh — noted as out of scope here. |

### R — Repudiation (can you deny it?)

| Threat | Mitigation / status |
|--------|---------------------|
| An admin denies making a point adjustment or an OSPREY grant | **Gap (tracked):** every request is logged with a correlation id, but there is no dedicated, immutable **audit trail** of privileged actions yet — this is a planned addition (audit-log initiative). Today the ledger records the adjustment entry (`source: "admin: …"`) but not *which* admin. |
| Duplicate/forged earn events inflate a balance | The unique ledger index on `idempotencyKey` makes redelivery a no-op ([ADR-0002](decisions/0002-idempotency-unique-ledger-key.md)); one `EarnEvent` yields exactly one `PointsTransaction`. |

### I — Information disclosure (can you see what you shouldn't?)

| Threat | Mitigation / status |
|--------|---------------------|
| Read another member's profile / transactions (IDOR) | Under zero-trust the member portal resolves identity from the token `sub`; admin surfaces require the `admin` role. **Gap:** with auth off (default), the members REST API is open — a demo convenience. |
| Internal error details leak to clients | The gateway runs `maskedErrors: false` **on purpose** so validation messages surface; documented as a demo choice, not a recommendation. |
| PII in logs | Structured logs carry ids and correlation ids, not passwords or full PII payloads. **Gap:** no formal PII-tagging/redaction policy yet — part of the GDPR/PII initiative. |
| Secrets exposed in the repo or images | `gitleaks` scans history; Trivy scans for embedded secrets; demo credentials are allowlisted and intentional (see [SECURITY.md](../SECURITY.md)). **Gap:** k8s secrets live in plain env vars — a secrets-manager is a documented follow-up. |
| Cross-origin data theft (B4) | Demo CORS is wide open (`*`); acceptable with auth off, would be locked to known origins in production. |

### D — Denial of service (can you take it down?)

| Threat | Mitigation / status |
|--------|---------------------|
| A slow/hung upstream stalls the gateway | Every gateway → members/partners call carries a **2 s timeout**; the members Mongo lookup carries a **5 s cap**. No unbounded awaits. |
| Unbounded query/loop exhausts memory | Bounded reads throughout (e.g. the tier-window recompute is `Limit`-ed). Backend pods now run with **request = limit memory** (Guaranteed QoS), so one pod's spike can't starve neighbours. |
| Poison message loops forever on the queue | The quorum queue dead-letters after five delivery attempts ([ADR-0001](decisions/0001-queue-rabbitmq.md)) rather than retrying endlessly. |
| Request flood on public endpoints | **Gap:** no rate limiting / quotas at the ingress or gateway yet — a candidate hardening step (Traefik middleware). |

### E — Elevation of privilege (can you become someone more powerful?)

| Threat | Mitigation / status |
|--------|---------------------|
| A member calls an admin-only operation | Admin operations require the `admin` role, carried as a claim and checked per request; the `admin-portal` client alone holds the `admin` scope. **Gap:** enforced only with auth on. |
| Compute OSPREY from points to self-promote | By design, **no code path computes OSPREY from points** — it is an invitation flag only, and the invitation wins over any point total. The e2e suite asserts this. |
| Redemption race to overdraw a balance | The overdraw guard is a single **atomic conditional decrement** — two concurrent redemptions can never both pass it ([ADR-0003](decisions/0003-redemption-concurrency-conditional-update.md)). |
| Signing-key compromise mints arbitrary tokens | The RSA key is generated per boot and held in memory (demo). **Gap:** production would source it from a managed KMS/HSM with rotation — out of scope here. |

## Top residual risks (ranked)

1. **Auth off by default** — the single biggest exposure, but a conscious demo trade-off gated by a per-service kill-switch (ADR-0007). Flipping it on closes most Spoofing/IDOR/EoP rows above without a code change.
2. **No privileged-action audit trail** — addressed by the planned audit-log initiative (Repudiation).
3. **RabbitMQ earn hop** — the last async surface being brought fully under zero-trust (Spoofing, roadmap).
4. **No PII governance** — retention, tagging, and right-to-erasure are the GDPR/PII initiative (Information disclosure).
5. **Secrets in plain manifests** and **no rate limiting** — documented hardening follow-ups.

Each residual risk maps to a concrete, tracked next step rather than an unknown. That mapping — not the absence of risk — is what this document exists to provide.
