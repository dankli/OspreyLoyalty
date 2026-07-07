# members

The core domain service: enrollment, member profiles, and the tier ladder (MEMBER → SILVER at 20 000 → GOLD at 45 000 → DIAMOND at 90 000 qualifying points, plus PANDION, which is invitation-only and never computed from points).

**Why C#:** this is the service with the deepest quality bar, and .NET is where I go for domain depth. Vertical Slice Architecture keeps each feature in one folder (`Features/EnrollMember`, `Features/GetMemberProfile`), and the pure domain core (`Features/Tiers/Tiers.Core.cs`) has no I/O at all, so the business rules test without any setup. Storage is MongoDB, standing in for Cosmos DB's Mongo API.

## Run

```bash
dotnet run --project Osprey.Members
```

Expects Mongo on `localhost:27017`. Or run the whole stack from the repo root: `docker compose -f infra/docker-compose.yml up --build` (members lands on http://localhost:5080).

Every request logs one JSON line with a correlation id (`X-Correlation-Id` is accepted or generated, and echoed back); Prometheus metrics are at `/metrics`.

## Test

```bash
dotnet test
```

74 tests: pure domain and validation tests, plus end-to-end API and queue tests against real Mongo and RabbitMQ via Testcontainers (needs Docker).
