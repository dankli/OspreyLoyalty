# routes

The airline route graph service: 3,900 airports and 59k directed routes in Neo4j
([ADR-0021](../../docs/decisions/0021-neo4j-route-graph.md)), seeded idempotently at
startup from the gzipped snapshot in [`data/`](data/). Consumed only by the gateway's
GraphQL BFF — the Route Explorer frontend never calls it directly.

## API (internal)

| Endpoint | Returns |
|---|---|
| `GET /airports?q=arlanda&limit=10` | full-text typeahead over iata/name/city (limit clamped to 25) |
| `GET /airports/:iata` | one airport profile, or 404 |
| `GET /airports/:iata/destinations` | direct destinations with km/min/carriers, ordered by km (bounded to 300) |
| `GET /airports/all` | every airport's iata + coordinates — the one-shot map payload, cached in-process |
| `GET /health` / `GET /ready` / `GET /metrics` | liveness / readiness (200 only after seeding) / Prometheus |

Every read runs with a 2 s server-side transaction timeout — the gateway aborts its
call at 2 s, so longer answers help nobody.

## Auth

Opt-in like the rest of the fleet ([ADR-0007](../../docs/decisions/0007-zero-trust-auth.md)):
`AUTH_ENABLED=true` guards the API routes (never health/ready/metrics) with a bearer
validated by the HS256 `AUTH_SECRET` when set, otherwise RS256 against `AUTH_JWKS_URI`.

## Tests

```bash
npm test                  # unit: pure parsing/query helpers + handler-level API with fakes
npm run test:integration  # Testcontainers Neo4j: seed idempotence, cypher, full-text (needs Docker)
```
