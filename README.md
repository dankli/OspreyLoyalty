# Osprey Loyalty

A miniature airline-style loyalty platform, built in public as a demo of full-stack, multi-language engineering. Members, tiers, points. The interesting bugs in this domain live in the business rules, so that is where the tests live too.

[![members](https://github.com/dankli/OspreyLoyalty/actions/workflows/members.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/members.yml)
[![gateway](https://github.com/dankli/OspreyLoyalty/actions/workflows/gateway.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/gateway.yml)
[![member-portal](https://github.com/dankli/OspreyLoyalty/actions/workflows/member-portal.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/member-portal.yml)

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

## What's inside

| Path | Language | Role |
|---|---|---|
| [`services/members`](services/members) | C# / .NET 8 | Core domain: enrollment, profiles, the tier ladder |
| [`services/gateway`](services/gateway) | TypeScript / Node 22 | GraphQL BFF for the frontends, plus a little REST |
| [`frontends/member-portal`](frontends/member-portal) | React 19 | Member dashboard: balance, tier progress, benefits |

More services arrive in later phases (partner integrations in Spring Boot, a Rust points engine). Each one has to justify its existence before it appears.

## How I build

These are principles I claim on my CV. Here they are as code you can click:

- **Vertical Slice Architecture.** One folder per feature, everything the feature needs in one place: [`Features/EnrollMember`](services/members/Osprey.Members/Features/EnrollMember) holds contracts, validation, handler and endpoint. The domain core ([`Tiers.Core.cs`](services/members/Osprey.Members/Features/Tiers/Tiers.Core.cs)) is pure and I/O-free, which makes it trivially testable.
- **TDD, visibly.** The commit history shows tests driving the implementation. 31 tests across three languages so far, including an integration test against a real Mongo via Testcontainers.
- **Exceptions on the edges.** Validation throws with a human message; one middleware in [`Program.cs`](services/members/Osprey.Members/Program.cs) turns expected failures into clean 400s. The happy path reads top to bottom, with no Result types threaded through every method.
- **Bounded everything.** The Mongo lookup carries a 5-second cap ([`GetMemberProfile.Handler.cs`](services/members/Osprey.Members/Features/GetMemberProfile/GetMemberProfile.Handler.cs)); the gateway calls members with a 2-second timeout ([`membersClient.ts`](services/gateway/src/features/member/membersClient.ts)). Small habit, cheap insurance.
- **Standards over invention.** GraphQL Yoga, zod, TanStack Query, GraphQL codegen, Testcontainers, minimal APIs. Boring, current, well-documented choices; the creativity budget goes to the domain.
- **Microservices only when they pay for themselves.** Three deployables today because showing three languages is the point of this repo. The future Rust points engine ships with an ADR arguing why it deserves to be separate.

## AI-assisted development

This repo is built with agentic coding tools under disciplined human review. I write the specs, direct the work, and review every diff against the same bar I hold hand-written code to. The tooling artifacts (agent configs, plan documents) are intentionally untracked; what is committed is the part I stand behind.

## Roadmap

- **Phase 2:** earn and tiers. Partner purchase events through a queue, idempotent earn processing, the rolling 12-month tier engine.
- **Phase 3:** redemption with concurrency safety, plus a micro-frontend shell hosting an admin portal.
- **Phase 4:** production polish. Kubernetes manifests, Grafana dashboards, correlation ids, completed ADRs.
- **Phase 5:** a Rust points engine, extracted from members with an ADR on why.

---

*The name comes from* Pandion haliaetus, *the osprey — the bird behind the top tier's name.*
