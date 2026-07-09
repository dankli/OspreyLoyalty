# Osprey Loyalty

A miniature airline-style loyalty platform, built in public as a demo of full-stack, multi-language engineering. Members, tiers, points. The interesting bugs in this domain live in the business rules, so that is where the tests live too.

[![members](https://github.com/dankli/OspreyLoyalty/actions/workflows/members.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/members.yml)
[![gateway](https://github.com/dankli/OspreyLoyalty/actions/workflows/gateway.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/gateway.yml)
[![member-portal](https://github.com/dankli/OspreyLoyalty/actions/workflows/member-portal.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/member-portal.yml)
[![partners](https://github.com/dankli/OspreyLoyalty/actions/workflows/partners.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/partners.yml)
[![admin-portal](https://github.com/dankli/OspreyLoyalty/actions/workflows/admin-portal.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/admin-portal.yml)
[![shell](https://github.com/dankli/OspreyLoyalty/actions/workflows/shell.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/shell.yml)
[![points-engine](https://github.com/dankli/OspreyLoyalty/actions/workflows/points-engine.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/points-engine.yml)
[![e2e](https://github.com/dankli/OspreyLoyalty/actions/workflows/e2e.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/e2e.yml)
[![infra](https://github.com/dankli/OspreyLoyalty/actions/workflows/infra.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/infra.yml)

## Run it

```bash
docker compose -f infra/docker-compose.yml up --build
```

Or use the convenience scripts, which build and start the stack, wait until the
gateway and frontends answer, then print the relevant URLs:

```powershell
./run-docker-compose.ps1     # Windows          (-NoBuild, -Open)
```

```bash
./run-docker-compose.sh      # Linux / macOS / Git Bash   (--no-build, --open)
```

Stop it again with `./stop-docker-compose.ps1` / `./stop-docker-compose.sh` (add `-Volumes` / `--volumes` to
also wipe the seeded Mongo data), or `docker compose -f infra/docker-compose.yml down`.

> The `-docker-compose` scripts run the stack in Docker Compose; `run-local-k8s.*` deploys it to Kubernetes instead.

| URL | What |
|---|---|
| http://localhost:5170 | Shell — one page hosting both portals via module federation |
| http://localhost:5173 | Member portal |
| http://localhost:5174 | Admin portal |
| http://localhost:4000/graphql | Gateway GraphQL endpoint, with GraphiQL in the browser |
| http://localhost:5080 | Members API (REST) |
| http://localhost:8082 | Points engine (REST) |
| http://localhost:9090 | Prometheus |
| http://localhost:3000 | Grafana (admin/admin), with the RED dashboard pre-provisioned |
| http://localhost:16686 | Jaeger — distributed traces across the services |
| http://localhost:9000/.well-known/openid-configuration | Security — first-party OIDC identity service |

The UI speaks five languages (English, Svenska, Español, Deutsch, Italiano) — switch with the selector in each portal's header — and every page has a "?" help dialog. Distributed traces land in Jaeger, logs in Loki (queryable in Grafana), and every service still exposes Prometheus metrics.

The stack seeds three demo members:

| Member id | Tier | What it demonstrates |
|---|---|---|
| `demo-ada` | SILVER | 32 000 qualifying points, part-way to GOLD at 45 000; 14 500 spendable |
| `demo-erik` | MEMBER | A recent joiner at the bottom of the ladder |
| `demo-yusra` | OSPREY | The invitation-only top tier. Her 96 000 points would make her DIAMOND; the invitation flag wins, and no code anywhere computes OSPREY from points |

### Try the earn flow

Post a purchase to the partners service and watch `demo-erik` climb from MEMBER to SILVER:

```bash
curl -X POST http://localhost:8081/partners/cardco/purchases \
  -H "Content-Type: application/json" \
  -d '{"memberId":"demo-erik","amount":40000}'
```

The event travels through RabbitMQ into the members ledger; his profile at http://localhost:5080/api/members/demo-erik flips to SILVER moments later. Then try the duplicate-delivery demo on the same member, which deliberately publishes the same event twice:

```bash
curl -X POST http://localhost:8081/partners/stayinn/purchases/duplicate-demo \
  -H "Content-Type: application/json" \
  -d '{"memberId":"demo-erik","amount":1000}'
```

Erik's transaction list still shows exactly one stayinn earn: the ledger's unique idempotency key absorbs the duplicate, which is the whole point ([docs/decisions/0002](docs/decisions/0002-idempotency-unique-ledger-key.md)).

### Try the redeem flow

Burn points through the gateway's `redeem` mutation:

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { redeem(memberId: \"demo-ada\", rewardId: \"cardco-giftcard\", idempotencyKey: \"my-first-redeem\") { rewardId pointsSpent spendablePoints alreadyApplied } }"}'
```

Ada's spendable balance drops by 5 000. Run the exact same command again: the balance stays put and the response says `"alreadyApplied": true` — a retried redemption is a success that changed nothing, not a double spend. The overdraw guard is a single atomic conditional decrement, so two concurrent redemptions can never both pass it ([docs/decisions/0003](docs/decisions/0003-redemption-concurrency-conditional-update.md)).

### Try the points engine

The Rust points engine computes promotion-aware points as a pure function behind HTTP:

```bash
curl -X POST http://localhost:8082/calculate \
  -H "Content-Type: application/json" \
  -d '{"amount":"40000","rate":"0.5","promotions":[{"multiplier":"2.0"}]}'
```

The calculation itself takes ~36 ns without promotions and ~202 ns with five (criterion), which is why members deliberately does not call it — the network hop would cost far more than the three-line formula it already has — while the e2e suite asserts the two implementations agree ([docs/decisions/0006](docs/decisions/0006-rust-points-engine.md)).

### Try the travel agent

The member portal has a **Travel Agent** page (in the nav, or straight to http://localhost:5173/travel-agent) that fakes an AI trip planner over the member's own points. Press **Generate** and a reply types itself out token by token, then a row of destination cards appears: the trips the member can afford right now, plus the cheapest one just out of reach to save toward.

There is no LLM behind it — it is a gateway feature slice ([`services/gateway/src/features/travel-agent`](services/gateway/src/features/travel-agent)) streamed to the browser over **Server-Sent Events**. A pure planning core picks trips against the balance (points-first: what can this member actually book?), a five-language phrasebook narrates the pick, and one thin SSE edge writes `meta` / `token` / `suggestion` / `done` events down the wire — or a single `error` event if the member can't be resolved. The typewriter cadence is a deliberate per-token delay, not latency. Watch the raw stream:

```bash
curl -N "http://localhost:4000/travel-agent/stream?memberId=demo-ada&lang=en"
```

The catalogue is entirely made up, but the prices are not arbitrary: each cost is modelled on SAS EuroBonus economy Saver award levels for a round trip for two — roughly 11 000 points for a domestic hop, 25 000 within Europe, 90 000 to North America, 140 000 to Asia. So `demo-ada`'s 14 500 spendable points surface a believable handful of reachable trips and one to aim for, rather than a flat list. Same shape as the rest of the domain: pure total functions in the middle, an impure edge at the boundary, and exceptions handled only there.

### Watch it run

Every service logs one JSON line per request, tagged with a correlation id. Send your own and follow it across the stack:

```bash
curl -si -H "X-Correlation-Id: my-trace-1" http://localhost:4000/health
docker compose -f infra/docker-compose.yml logs | grep my-trace-1
```

The gateway accepts the id (or generates one), echoes it in the response, and forwards it downstream; on a partner purchase it even rides the earn event through RabbitMQ, so one grep traces a purchase from the initial POST to the ledger write. For the aggregate view, Grafana at http://localhost:3000 ships pre-provisioned with a RED dashboard — request rate, error rate, and p95 latency per service — fed by Prometheus scraping each service's metrics endpoint.

## What's deliberately missing

Authentication now ships as an **opt-in zero-trust layer** (Phase 6): a first-party OIDC identity service ([`services/security`](services/security)) issues JWTs that every backend validates, with admin surfaces behind an `admin` role. It is gated per service by an `Auth:Enabled` / `AUTH_ENABLED` flag that defaults **off** — so the demo flows and the e2e suite stay open, and flipping it on secures the whole fleet without a code change ([ADR-0007](docs/decisions/0007-zero-trust-auth.md)). Still deliberately public: CORS is wide open, and the gateway passes internal error details straight through (`maskedErrors: false`) — demo conveniences, not recommendations. The remaining zero-trust surface is the async RabbitMQ earn hop, tracked as follow-up.

## What's inside

| Path | Language | Role |
|---|---|---|
| [`services/members`](services/members) | C# / .NET 10 | Core domain: enrollment, profiles, the tier ladder |
| [`services/gateway`](services/gateway) | TypeScript / Node 22 | GraphQL BFF for the frontends, plus a little REST |
| [`services/partners`](services/partners) | Java 21 / Spring Boot | Partner earn simulations and the duplicate-delivery demo |
| [`services/points-engine`](services/points-engine) | Rust | Pure points calculation with promotions, property-tested; deliberately not wired into the earn path ([docs/decisions/0006](docs/decisions/0006-rust-points-engine.md)) |
| [`services/security`](services/security) | Java 21 / Spring Boot | First-party OIDC/OAuth2 identity service (Spring Authorization Server) — issues the JWTs the fleet validates ([docs/decisions/0007](docs/decisions/0007-zero-trust-auth.md)) |
| [`frontends/member-portal`](frontends/member-portal) | React 19 | Member dashboard: balance, tier progress, benefits, rewards, and a simulated Travel Agent streamed over SSE |
| [`frontends/admin-portal`](frontends/admin-portal) | Vue 3 | Admin tools: member lookup, point adjustments, partner rates, OSPREY invitations |
| [`frontends/shell`](frontends/shell) | TypeScript | Micro-frontend host: one page composing both portals via module federation ([docs/decisions/0004](docs/decisions/0004-micro-frontend-tradeoff.md)) |

That is the full fleet. Each service had to justify its existence before it appeared.
Tier benefits are hardcoded in `services/members` for the demo; in production that content would live in a headless CMS such as Contentful.

## Kubernetes and IaC

The compose stack has a Kubernetes twin in [`infra/k8s`](infra/k8s) — kubeconform-validated manifests with probes and resource limits, plus a [kind quickstart](infra/k8s/README.md) to run them locally. [`infra/terraform`](infra/terraform) is a deliberately tiny IaC sample — a namespace and its resource quota — with the reasoning in [its README](infra/terraform/README.md).

## How I build

These are principles I claim on my CV. Here they are as code you can click:

- **Vertical Slice Architecture.** One folder per feature, everything the feature needs in one place: [`Features/EnrollMember`](services/members/Osprey.Members/Features/EnrollMember) holds contracts, validation, handler and endpoint. The domain core ([`Tiers.Core.cs`](services/members/Osprey.Members/Features/Tiers/Tiers.Core.cs)) is pure and I/O-free, which makes it trivially testable.
- **TDD, visibly.** The commit history shows tests driving the implementation. 213 tests across eight components (members 106, points engine 25, partners 24, member portal 22, gateway 18, admin portal 13, security 3, shell 2), including integration tests against a real Mongo and RabbitMQ via Testcontainers, JWT auth tests (HS256 and RS256/JWKS, incl. the RabbitMQ hop), and per-language i18n tests.
- **Exceptions on the edges.** Validation throws with a human message; one middleware in [`Program.cs`](services/members/Osprey.Members/Program.cs) turns expected failures into clean 400s. The happy path reads top to bottom, with no Result types threaded through every method.
- **Bounded everything.** The Mongo lookup carries a 5-second cap ([`GetMemberProfile.Handler.cs`](services/members/Osprey.Members/Features/GetMemberProfile/GetMemberProfile.Handler.cs)); the gateway calls members with a 2-second timeout ([`membersClient.ts`](services/gateway/src/features/member/membersClient.ts)). Small habit, cheap insurance.
- **Standards over invention.** GraphQL Yoga, zod, TanStack Query, GraphQL codegen, Testcontainers, minimal APIs. Boring, current, well-documented choices; the creativity budget goes to the domain.
- **Microservices only when they pay for themselves.** Five backend services across four languages, because showing the languages is the point of this repo. The Rust points engine ships with an ADR arguing why it deserves to be separate — and why it deliberately stays out of the earn path ([docs/decisions/0006](docs/decisions/0006-rust-points-engine.md)); the security service earns its keep as the first-party IdP ([docs/decisions/0007](docs/decisions/0007-zero-trust-auth.md)).

## AI-assisted development

This repo is built with agentic coding tools under disciplined human review. I write the specs, direct the work, and review every diff against the same bar I hold hand-written code to. The tooling artifacts (agent configs, plan documents) are intentionally untracked; what is committed is the part I stand behind.

## Roadmap

Phases 1–5 are done; **Phase 6 (enterprise)** is largely in place:

- **Phase 1:** the walking skeleton — members domain with the tier ladder, GraphQL gateway, React member portal.
- **Phase 2:** earn and tiers — partner purchases through RabbitMQ, idempotent ledger, rolling 12-month tier engine.
- **Phase 3:** redemption with concurrency safety, point expiry, admin endpoints, plus a micro-frontend shell hosting a Vue admin portal next to the React member portal.
- **Phase 4:** production polish — observability, correlation ids, Kubernetes manifests, IaC sample.
- **Phase 5:** a Rust points engine, extracted from members with an ADR on why — and why it stays out of the earn path.
- **Phase 6 (enterprise, in progress):** a first-party OIDC identity service with opt-in zero-trust JWT validation across every backend ([ADR-0007](docs/decisions/0007-zero-trust-auth.md)); OpenTelemetry distributed tracing in Jaeger and logs in Loki alongside the existing Prometheus metrics ([ADR-0008](docs/decisions/0008-opentelemetry-observability.md)); a five-language UI (sv/en/es/de/it) with an in-app help dialog on every page; and mobile-responsive frontends. Still to land: the RabbitMQ auth hop, browser OIDC login, and localized backend messages.

A future phase would put promotions into the real earn path and run the stack highly available — each of which would first have to pay for itself.

---

*The name comes from* Pandion haliaetus, *the osprey — the bird the platform is named for, and whose name its summit shares: the top tier is OSPREY.*
