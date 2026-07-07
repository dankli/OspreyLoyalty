# gateway

The BFF: a GraphQL API (Yoga) that the frontends query, plus a REST `GET /health`. It shapes the members service's REST responses into the schema the portal actually wants.

**Why TypeScript/Node:** the aggregation edge is mostly receiving, validating and reshaping JSON, and that is exactly what the TypeScript ecosystem is good at. The environment is validated with zod at startup (fail fast on bad config), and the members client calls out with a 2-second timeout: a BFF should answer quickly or not at all.

## Run

```bash
npm install
npm run dev
```

Listens on http://localhost:4000 (GraphQL at `/graphql`). Expects the members service on http://localhost:5080; override with `MEMBERS_URL`.

Every request logs one JSON line with a correlation id (`X-Correlation-Id` is accepted or generated, and forwarded on downstream calls); Prometheus metrics are at `/metrics`.

## Test

```bash
npm test
```

14 vitest tests covering the GraphQL member query and the members client (response mapping, 404 handling, and 5xx error translation). The members client enforces a 2-second timeout at the call site.
