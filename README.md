# Osprey Loyalty

A miniature airline-style loyalty platform, built in public as a demo of full-stack, multi-language engineering. Members, tiers, points. The interesting bugs in this domain live in the business rules, so that is where the tests live too.

[![members](https://github.com/dankli/OspreyLoyalty/actions/workflows/members.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/members.yml)
[![gateway](https://github.com/dankli/OspreyLoyalty/actions/workflows/gateway.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/gateway.yml)
[![member-portal](https://github.com/dankli/OspreyLoyalty/actions/workflows/member-portal.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/member-portal.yml)
[![partners](https://github.com/dankli/OspreyLoyalty/actions/workflows/partners.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/partners.yml)
[![e2e](https://github.com/dankli/OspreyLoyalty/actions/workflows/e2e.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/e2e.yml)

## Run it

```bash
docker compose -f infra/docker-compose.yml up --build
```

| URL | What |
|---|---|
| http://localhost:5173 | Member portal |
| http://localhost:4000/graphql | Gateway GraphQL endpoint, with GraphiQL in the browser |
| http://localhost:5080 | Members API (REST) |

The stack seeds three demo members:

| Member id | Tier | What it demonstrates |
|---|---|---|
| `demo-ada` | SILVER | 32 000 qualifying points, part-way to GOLD at 45 000; 14 500 spendable |
| `demo-erik` | MEMBER | A recent joiner at the bottom of the ladder |
| `demo-yusra` | PANDION | The invitation-only top tier. Her 96 000 points would make her DIAMOND; the invitation flag wins, and no code anywhere computes PANDION from points |

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

## What's inside

| Path | Language | Role |
|---|---|---|
| [`services/members`](services/members) | C# / .NET 8 | Core domain: enrollment, profiles, the tier ladder |
| [`services/gateway`](services/gateway) | TypeScript / Node 22 | GraphQL BFF for the frontends, plus a little REST |
| [`services/partners`](services/partners) | Java 21 / Spring Boot | Partner earn simulations and the duplicate-delivery demo |
| [`frontends/member-portal`](frontends/member-portal) | React 19 | Member dashboard: balance, tier progress, benefits |

More services arrive in later phases (a Rust points engine). Each one has to justify its existence before it appears.

## How I build

These are principles I claim on my CV. Here they are as code you can click:

- **Vertical Slice Architecture.** One folder per feature, everything the feature needs in one place: [`Features/EnrollMember`](services/members/Osprey.Members/Features/EnrollMember) holds contracts, validation, handler and endpoint. The domain core ([`Tiers.Core.cs`](services/members/Osprey.Members/Features/Tiers/Tiers.Core.cs)) is pure and I/O-free, which makes it trivially testable.
- **TDD, visibly.** The commit history shows tests driving the implementation. 66 tests across four languages so far (members 42, gateway 8, portal 11, partners 5), including integration tests against a real Mongo and RabbitMQ via Testcontainers.
- **Exceptions on the edges.** Validation throws with a human message; one middleware in [`Program.cs`](services/members/Osprey.Members/Program.cs) turns expected failures into clean 400s. The happy path reads top to bottom, with no Result types threaded through every method.
- **Bounded everything.** The Mongo lookup carries a 5-second cap ([`GetMemberProfile.Handler.cs`](services/members/Osprey.Members/Features/GetMemberProfile/GetMemberProfile.Handler.cs)); the gateway calls members with a 2-second timeout ([`membersClient.ts`](services/gateway/src/features/member/membersClient.ts)). Small habit, cheap insurance.
- **Standards over invention.** GraphQL Yoga, zod, TanStack Query, GraphQL codegen, Testcontainers, minimal APIs. Boring, current, well-documented choices; the creativity budget goes to the domain.
- **Microservices only when they pay for themselves.** Three deployables today because showing three languages is the point of this repo. The future Rust points engine ships with an ADR arguing why it deserves to be separate.

## AI-assisted development

This repo is built with agentic coding tools under disciplined human review. I write the specs, direct the work, and review every diff against the same bar I hold hand-written code to. The tooling artifacts (agent configs, plan documents) are intentionally untracked; what is committed is the part I stand behind.

## Roadmap

- **Phase 2 (done):** earn and tiers — partner purchases through RabbitMQ, idempotent ledger, rolling 12-month tier engine.
- **Phase 3:** redemption with concurrency safety, plus a micro-frontend shell hosting an admin portal.
- **Phase 4:** production polish. Kubernetes manifests, Grafana dashboards, correlation ids, completed ADRs.
- **Phase 5:** a Rust points engine, extracted from members with an ADR on why.

---

*The name comes from* Pandion haliaetus, *the osprey — the bird behind the top tier's name.*
