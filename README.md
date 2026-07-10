# Osprey Loyalty

Osprey Loyalty is a miniature airline-style loyalty platform — members earn points from
partner purchases, climb a tier ladder, and redeem rewards. It is built in public as a demo
of full-stack, polyglot engineering: six backend services across four languages
(C#, TypeScript, Java, Rust) behind a GraphQL gateway and four micro-frontends, with a
first-party OIDC identity service, opt-in zero-trust auth, distributed tracing, and a
Kubernetes deployment. The interesting bugs in this domain live in the business rules, so
that is where the tests live too.

[![members](https://github.com/dankli/OspreyLoyalty/actions/workflows/members.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/members.yml)
[![gateway](https://github.com/dankli/OspreyLoyalty/actions/workflows/gateway.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/gateway.yml)
[![member-portal](https://github.com/dankli/OspreyLoyalty/actions/workflows/member-portal.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/member-portal.yml)
[![partners](https://github.com/dankli/OspreyLoyalty/actions/workflows/partners.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/partners.yml)
[![admin-portal](https://github.com/dankli/OspreyLoyalty/actions/workflows/admin-portal.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/admin-portal.yml)
[![shell](https://github.com/dankli/OspreyLoyalty/actions/workflows/shell.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/shell.yml)
[![points-engine](https://github.com/dankli/OspreyLoyalty/actions/workflows/points-engine.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/points-engine.yml)
[![e2e](https://github.com/dankli/OspreyLoyalty/actions/workflows/e2e.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/e2e.yml)
[![infra](https://github.com/dankli/OspreyLoyalty/actions/workflows/infra.yml/badge.svg)](https://github.com/dankli/OspreyLoyalty/actions/workflows/infra.yml)

## Contents

- [Quick start](#quick-start)
- [URLs](#urls)
- [Demo data](#demo-data)
- [Try it](#try-it)
- [What's inside](#whats-inside)
- [Architecture and decisions](#architecture-and-decisions)
- [How I build](#how-i-build)
- [Roadmap](#roadmap)

## Quick start

Two ways to run it. Kubernetes is the full experience — ingress, TLS, zero-trust login, and the
observability stack. Docker Compose is the fastest path to the domain.

### Kubernetes

The helper script builds the images, applies the [`infra/k8s`](infra/k8s) manifests to a local
cluster (Docker Desktop's built-in Kubernetes or kind), waits for every rollout, and prints the URLs:

```powershell
./run-local-k8s.ps1          # Windows / PowerShell
```

```bash
./run-local-k8s.sh           # Linux / macOS / Git Bash
```

Flags (same on both): `-PortForward` / `--port-forward` (use `localhost:<port>` instead of the
ingress), `-NoAuth` / `--no-auth` (skip the zero-trust login), `-NoBuild` / `--no-build` (re-apply
without rebuilding), `-Delete` / `--delete` (tear it all down). Full walkthrough — Docker Desktop
vs. kind — in the [Kubernetes quickstart](infra/k8s/README.md).

### Docker Compose

```bash
docker compose -f infra/docker-compose.yml up --build   # or ./run-docker-compose.sh  (--no-build, --open)
```

Stop with `./stop-docker-compose.sh` / `./stop-docker-compose.ps1` (add `--volumes` / `-Volumes` to
also wipe the seeded Mongo data), or `docker compose -f infra/docker-compose.yml down`.

## URLs

### Kubernetes (Traefik ingress)

Everything answers behind Traefik at `*.osprey.localtest.me` — a public wildcard that resolves to
`127.0.0.1`, so no hosts-file edit — with TLS from a locally-trusted mkcert wildcard cert. Sign in
with a demo user (`demo-ada` / `demo-erik` / `demo-yusra`, or `admin`).

| URL | What |
|---|---|
| https://app.osprey.localtest.me | **Shell** — entry point; hosts both portals via module federation |
| https://member.osprey.localtest.me | Member portal |
| https://admin.osprey.localtest.me | Admin portal |
| https://api.osprey.localtest.me/graphql | Gateway — GraphQL BFF (GraphiQL in the browser) |
| https://id.osprey.localtest.me | Security — first-party OIDC identity service |
| https://members.osprey.localtest.me | Members API (REST) |
| https://partners.osprey.localtest.me | Partners API (REST) |
| https://points-engine.osprey.localtest.me | Points engine (REST) |
| https://grafana.osprey.localtest.me | Grafana — RED + cluster/node/pod dashboards |
| https://jaeger.osprey.localtest.me | Jaeger — distributed traces |
| https://traefik.osprey.localtest.me | Traefik dashboard |

Two demos are open and answer plain `curl` against the ingress (the mkcert cert is trusted in the
browser; add `-k` for curl):

```bash
# the Rust points calculator — off the request path, so no auth
curl -k -X POST https://points-engine.osprey.localtest.me/calculate \
  -H "Content-Type: application/json" \
  -d '{"amount":"40000","rate":"0.5","promotions":[{"multiplier":"2.0"}]}'

# any service's liveness endpoint
curl -k https://api.osprey.localtest.me/health
```

The member, partner and admin surfaces sit behind the **zero-trust layer**, which
`run-local-k8s` turns on by default — so an unauthenticated call returns `401` (and a GraphQL
mutation comes back with `"members service responded 401"`). To run the [Try it](#try-it) flows
from the terminal against the ingress, start the cluster with `--no-auth`; in the browser, the
portals sign you in and carry the token for you.

### Docker Compose / port-forward (localhost)

The Compose stack — and `run-local-k8s` with `--port-forward` — expose everything on `localhost`;
these are the endpoints the [Try it](#try-it) demos use.

| URL | What |
|---|---|
| http://localhost:5170 | Shell — entry point |
| http://localhost:5173 | Member portal |
| http://localhost:5174 | Admin portal |
| http://localhost:5175 | Route explorer |
| http://localhost:4000/graphql | Gateway GraphQL (GraphiQL in the browser) |
| http://localhost:5080 | Members API (REST) |
| http://localhost:8081 | Partners API (REST) |
| http://localhost:8082 | Points engine (REST) |
| http://localhost:8083 | Routes API (REST) |
| http://localhost:7474 | Neo4j browser (route graph) |
| http://localhost:9000/.well-known/openid-configuration | Security — OIDC identity service |
| http://localhost:9090 | Prometheus |
| http://localhost:3000 | Grafana (admin/admin) |
| http://localhost:16686 | Jaeger |

The UI speaks five languages (English, Svenska, Español, Deutsch, Italiano) — switch in each portal's
header — and every page has a "?" help dialog. Traces land in Jaeger, logs in Loki (queryable in
Grafana), and every service exposes Prometheus metrics.

## Demo data

The stack seeds three members:

| Member id | Tier | What it demonstrates |
|---|---|---|
| `demo-ada` | SILVER | 32 000 qualifying points, part-way to GOLD at 45 000; 14 500 spendable |
| `demo-erik` | MEMBER | A recent joiner at the bottom of the ladder |
| `demo-yusra` | OSPREY | The invitation-only top tier. Her 96 000 points would make her DIAMOND; the invitation flag wins, and no code anywhere computes OSPREY from points |

## Try it

The commands below use the Compose/localhost URLs. They run the same against the Kubernetes ingress
hosts (swap the host per the [URLs](#urls) table, add `-k`) — but the cluster runs zero-trust auth
**on** by default, so the earn, redeem and travel-agent calls (which touch members) return `401`
there unless you start it with `--no-auth` or pass a bearer token (see
[Against the Kubernetes ingress](#against-the-kubernetes-ingress-auth-on) below). `points-engine`
and `/health` answer either way.

### Earn

Post a purchase and watch `demo-erik` climb MEMBER → SILVER as the event travels through RabbitMQ
into the ledger (his profile at http://localhost:5080/api/members/demo-erik flips moments later):

```bash
curl -X POST http://localhost:8081/partners/cardco/purchases \
  -H "Content-Type: application/json" -d '{"memberId":"demo-erik","amount":40000}'
```

The duplicate-delivery demo publishes the same event twice; the ledger's unique idempotency key
absorbs it, so Erik still shows exactly one `stayinn` earn ([ADR-0002](docs/decisions/0002-idempotency-unique-ledger-key.md)):

```bash
curl -X POST http://localhost:8081/partners/stayinn/purchases/duplicate-demo \
  -H "Content-Type: application/json" -d '{"memberId":"demo-erik","amount":1000}'
```

### Redeem

Burn points through the gateway's `redeem` mutation. Run it twice and the balance stays put with
`"alreadyApplied": true` — a retried redemption is a success that changed nothing, never a double
spend. The overdraw guard is a single atomic conditional decrement, so two concurrent redemptions
can never both pass it ([ADR-0003](docs/decisions/0003-redemption-concurrency-conditional-update.md)):

```bash
curl -X POST http://localhost:4000/graphql -H "Content-Type: application/json" \
  -d '{"query":"mutation { redeem(memberId: \"demo-ada\", rewardId: \"cardco-giftcard\", idempotencyKey: \"my-first-redeem\") { rewardId pointsSpent spendablePoints alreadyApplied } }"}'
```

### Points engine

The Rust points engine computes promotion-aware points as a pure function behind HTTP (~36 ns
without promotions, ~202 ns with five). Members deliberately does not call it — the network hop would
cost far more than the three-line formula it already has — while the e2e suite asserts the two
implementations agree ([ADR-0006](docs/decisions/0006-rust-points-engine.md)):

```bash
curl -X POST http://localhost:8082/calculate -H "Content-Type: application/json" \
  -d '{"amount":"40000","rate":"0.5","promotions":[{"multiplier":"2.0"}]}'
```

### Travel agent

The member portal's **Travel Agent** page (http://localhost:5173/travel-agent) fakes an AI trip
planner over a member's points balance: a reply types out token by token, then destination cards
appear — some flagged as within reach, plus a cheapest one to save toward. There is no LLM: it is a
gateway feature slice streamed over Server-Sent Events, with a pure planning core and a five-language
phrasebook. The trip prices and the affordable / save-toward split are illustrative demo content, not
a verified view of the account balance. Watch the raw stream:

```bash
curl -N "http://localhost:4000/travel-agent/stream?memberId=demo-ada&lang=en"
```

### Explore the route network

Open the shell (http://localhost:5170), pick **Route explorer**, and type "arlanda" — the typeahead
finds ARN and lists its direct destinations with distance, flight time and carriers. On the **Route
search** tab, search ARN → SYD optimized by distance to get the legs plus a ≈points badge — the
estimate comes from the Rust points engine per ADR-0006's reuse-over-reimplement, and the badge
simply disappears if the engine is down rather than failing the search. The **Map** tab draws the itinerary on a world
map rendered by a Rust/WASM island. Under the hood it is a Neo4j graph queried with dijkstra
([ADR-0021](docs/decisions/0021-neo4j-route-graph.md)); the same search over GraphQL:

```bash
curl -X POST http://localhost:4000/graphql -H "Content-Type: application/json" \
  -d '{"query":"{ routeSearch(from: \"ARN\", to: \"SYD\", optimize: KM) { hops totalKm totalMin estimatedPoints legs { from { iata } to { iata } } } }"}'
```

### Watch it run

Every service logs one JSON line per request, tagged with a correlation id. Send your own and follow
it across the stack — it even rides the earn event through RabbitMQ:

```bash
curl -si -H "X-Correlation-Id: my-trace-1" http://localhost:4000/health
docker compose -f infra/docker-compose.yml logs | grep my-trace-1
```

Grafana ships pre-provisioned with a RED dashboard (request rate, error rate, p95 latency per
service) alongside cluster/node/pod dashboards, all fed by Prometheus.

### Right to be forgotten (GDPR)

Erase a member's PII on request. It pseudonymizes name and email and stamps an `ErasedAtUtc` marker while
keeping the numeric ledger intact — so accounting and the idempotency trail survive — and records the
erasure in the audit log ([ADR-0018](docs/decisions/0018-gdpr-erasure.md)). It is idempotent, so a retry is a
no-op:

```bash
curl -X DELETE http://localhost:5080/api/members/demo-erik/pii
# demo-erik's name -> "[erased]", email -> null; his points and transactions remain
```

### Against the Kubernetes ingress (auth on)

To run the flows above against the ingress while zero-trust auth is on, grab a token from the
identity service. The `partners-service` client uses the client-credentials grant, so no browser
login is needed:

```bash
TOKEN=$(curl -sk -X POST https://id.osprey.localtest.me/oauth2/token \
  -u partners-service:partners-secret \
  -d grant_type=client_credentials -d scope=member \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
```

Send it as a bearer and the protected flows work against the ingress — the earn call returns `202`,
and the same token unlocks the members reads and the gateway's GraphQL and travel-agent stream:

```bash
# earn — publishes the purchase event (HTTP 202); demo-erik climbs a moment later
curl -k -X POST https://partners.osprey.localtest.me/partners/cardco/purchases \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"memberId":"demo-erik","amount":40000}'

# and his updated profile
curl -k -H "Authorization: Bearer $TOKEN" https://members.osprey.localtest.me/api/members/demo-erik
```

`partners-service` / `partners-secret` is the demo service client ([`AuthorizationServerConfig`](services/security/src/main/java/com/ospreyloyalty/security/AuthorizationServerConfig.java));
if you just want to poke the endpoints without tokens, start the cluster with `--no-auth`.

## What's inside

| Path | Language | Role |
|---|---|---|
| [`services/members`](services/members) | C# / .NET 10 | Core domain: enrollment, profiles, the tier ladder, the points ledger, an audit log and GDPR erasure |
| [`services/gateway`](services/gateway) | TypeScript / Node 22 | GraphQL BFF for the frontends, plus a little REST |
| [`services/partners`](services/partners) | Java 21 / Spring Boot | Partner earn simulations and the duplicate-delivery demo; a transactional outbox durably publishes earns ([ADR-0016](docs/decisions/0016-transactional-outbox.md)) |
| [`services/points-engine`](services/points-engine) | Rust | Pure points calculation with promotions, property-tested; deliberately not wired into the earn path ([ADR-0006](docs/decisions/0006-rust-points-engine.md)) |
| [`services/security`](services/security) | Java 21 / Spring Boot | First-party OIDC/OAuth2 identity service — issues the JWTs the fleet validates ([ADR-0007](docs/decisions/0007-zero-trust-auth.md)) |
| [`services/routes`](services/routes) | TypeScript / Node 22 | The airline route graph in Neo4j: airport typeahead, direct destinations, and weighted shortest-itinerary search via APOC dijkstra ([ADR-0021](docs/decisions/0021-neo4j-route-graph.md)) |
| [`frontends/member-portal`](frontends/member-portal) | React 19 | Member dashboard: balance, tier progress, benefits, rewards, and a simulated Travel Agent streamed over SSE |
| [`frontends/admin-portal`](frontends/admin-portal) | Vue 3 | Admin tools: member lookup, point adjustments, partner rates, OSPREY invitations |
| [`frontends/route-explorer`](frontends/route-explorer) | Svelte 5 | Route explorer: airport search, A→B itinerary search with a points estimate, and a world map drawn by a Rust/Leptos WASM island ([ADR-0022](docs/decisions/0022-svelte-mfe-leptos-wasm-island.md)) |
| [`frontends/shell`](frontends/shell) | TypeScript | Micro-frontend host: one page composing the three remotes via module federation ([ADR-0004](docs/decisions/0004-micro-frontend-tradeoff.md)) |

That is the full fleet — each service had to justify its existence before it appeared. Tier benefits
are hardcoded in `services/members` for the demo; in production that content would live in a headless
CMS such as Contentful.

## Architecture and decisions

Design choices are recorded as numbered ADRs in [`docs/decisions`](docs/decisions), with the overview
in [`docs/architecture.md`](docs/architecture.md).

**Auth** ships as an opt-in zero-trust layer: the OIDC identity service issues JWTs that every backend
validates, with admin surfaces behind an `admin` role, gated per service by an `Auth:Enabled` /
`AUTH_ENABLED` flag that defaults **off** — so the demo flows and the e2e suite stay open, and
flipping it on secures the whole fleet without a code change ([ADR-0007](docs/decisions/0007-zero-trust-auth.md)).
Still deliberately public for the demo: CORS is wide open, and the gateway passes internal error
details straight through (`maskedErrors: false`).

**Kubernetes and IaC:** the Compose stack has a kubeconform-validated Kubernetes twin in
[`infra/k8s`](infra/k8s) — probes, resource limits, a Traefik HTTPS ingress ([ADR-0011](docs/decisions/0011-traefik-ingress.md)),
and the observability stack. [`infra/terraform`](infra/terraform) is a deliberately tiny IaC sample —
a namespace and its resource quota.

**Resilience and data.** A partner purchase is durable end to end: partners writes it to a transactional
**outbox** and a relay drains it to RabbitMQ, so an earn survives broker downtime instead of vanishing on
a fire-and-forget publish ([ADR-0016](docs/decisions/0016-transactional-outbox.md)). Privileged actions are
recorded in an append-only **audit log** with the actor from the JWT `sub` ([ADR-0017](docs/decisions/0017-audit-log.md)),
and **GDPR** right-to-erasure pseudonymizes a member's PII while keeping the numeric ledger
([ADR-0018](docs/decisions/0018-gdpr-erasure.md)).

**Operate it.** SLOs with symptom-based (RED) Prometheus alerting through Alertmanager, each alert backed
by a [runbook](docs/runbooks) ([ADR-0013](docs/decisions/0013-slo-and-alerting.md)); k6 load and soak tests
with FinOps cost reasoning ([ADR-0015](docs/decisions/0015-load-testing-and-finops.md)); and an ADR on why
the fleet runs on Kubernetes rather than scaling its stateless edges to serverless
([ADR-0012](docs/decisions/0012-compute-model-k8s-over-serverless.md)).

**Ship it safely.** GitOps with **ArgoCD** syncs [`infra/k8s`](infra/k8s) from git
([ADR-0019](docs/decisions/0019-gitops-argocd.md)), and **Argo Rollouts** runs canary deploys with Prometheus
analysis that auto-rolls-back on an SLO breach ([ADR-0020](docs/decisions/0020-progressive-delivery-argo-rollouts.md))
— both under [`infra/gitops`](infra/gitops) and [`infra/delivery`](infra/delivery). Contract tests guard the
GraphQL schema and the `EarnEvent` wire shape ([ADR-0014](docs/decisions/0014-contract-testing.md)), and a
DevSecOps pipeline scans every push (gitleaks, Trivy, SBOM, Dependabot) with the trust boundaries mapped in a
[threat model](docs/threat-model.md) and a [security policy](SECURITY.md).

## How I build

These are principles I claim on my CV. Here they are as code you can click:

- **Vertical Slice Architecture.** One folder per feature, everything it needs in one place:
  [`Features/EnrollMember`](services/members/Osprey.Members/Features/EnrollMember) holds contracts,
  validation, handler and endpoint. The domain core ([`Tiers.Core.cs`](services/members/Osprey.Members/Features/Tiers/Tiers.Core.cs))
  is pure and I/O-free, which makes it trivially testable.
- **TDD, visibly.** The commit history shows tests driving the implementation — integration tests
  against a real Mongo and RabbitMQ via Testcontainers, JWT auth tests (HS256 and RS256/JWKS, incl.
  the RabbitMQ hop), and per-language i18n tests.
- **Exceptions on the edges.** Validation throws with a human message; one middleware in
  [`Program.cs`](services/members/Osprey.Members/Program.cs) turns expected failures into clean 400s.
  The happy path reads top to bottom, no Result types threaded through every method.
- **Bounded everything.** Every query, loop, retry and integration call carries an explicit bound and
  a timeout with a reason — the Mongo lookup's 5-second cap, the gateway's 2-second call to members.
- **Standards over invention.** GraphQL Yoga, zod, TanStack Query, GraphQL codegen, Testcontainers,
  minimal APIs. Boring, current, well-documented choices; the creativity budget goes to the domain.
- **Microservices only when they pay for themselves.** Four languages because showing them is the
  point of this repo — but the Rust points engine ships with an ADR arguing why it deserves to be
  separate (and why it stays out of the earn path), and the security service earns its keep as the
  first-party IdP.

This repo is built with agentic coding tools under disciplined human review: I write the specs, direct
the work, and review every diff against the same bar I hold hand-written code to. The tooling artifacts
(agent configs, plan documents) are intentionally untracked; what is committed is the part I stand behind.

## Roadmap

All five original phases are done, and Phase 6 (enterprise) is largely in place:

- **Phases 1–3** — the walking skeleton (members domain, tier ladder, GraphQL gateway, React portal);
  earn and tiers (partner purchases through RabbitMQ, idempotent ledger, rolling 12-month window); and
  redemption with concurrency safety, point expiry, admin tools, and a micro-frontend shell hosting a
  Vue admin portal beside the React member portal.
- **Phases 4–5** — production polish (observability, correlation ids, Kubernetes manifests, IaC sample)
  and the Rust points engine, extracted from members with an ADR on why.
- **Phase 6 (enterprise)** — a first-party OIDC identity service with opt-in zero-trust JWT validation
  ([ADR-0007](docs/decisions/0007-zero-trust-auth.md)); OpenTelemetry tracing in Jaeger and logs in Loki
  ([ADR-0008](docs/decisions/0008-opentelemetry-observability.md)); a five-language UI with in-app help;
  a Traefik HTTPS ingress ([ADR-0011](docs/decisions/0011-traefik-ingress.md)); and cluster-metrics
  dashboards. Still to land: the RabbitMQ auth hop and localized backend messages.

- **Phase 7 (production hardening)** — resilience and data integrity (a transactional outbox for the earn
  publish, an append-only audit log, GDPR right-to-erasure); operability (SLOs with RED alerting and runbooks,
  k6 load/soak tests, FinOps cost reasoning); safe delivery (GitOps with ArgoCD, canary deploys with Argo
  Rollouts and automatic rollback on an SLO breach); and supply-chain security (a DevSecOps scanning pipeline,
  a STRIDE threat model, and every dependency modernized to its latest stable). See [ADR-0012 through 0020](docs/decisions).

- **Route Explorer** — a feature slice on top of the phases rather than a phase of its own: an airline
  route graph (~3,900 airports, 59k directed routes) in Neo4j with weighted shortest-path via APOC
  dijkstra, owned by a new TypeScript `routes` service behind the gateway
  ([ADR-0021](docs/decisions/0021-neo4j-route-graph.md)), and a third micro-frontend remote in Svelte 5
  whose world map is a Rust/Leptos WASM island ([ADR-0022](docs/decisions/0022-svelte-mfe-leptos-wasm-island.md)).
  The itinerary's points estimate reuses the Rust points engine and degrades to null when it is down.
  The remote itself is English-only in v1 — its strings are gathered for a later ADR-0009 retrofit.

A future phase would put promotions into the real earn path and run the stack highly available — each of
which would first have to pay for itself.

---

*The name comes from* Pandion haliaetus, *the osprey — the bird the platform is named for, and whose
name its summit shares: the top tier is OSPREY.*
