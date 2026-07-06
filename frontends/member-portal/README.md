# member-portal

The member-facing dashboard: spendable balance, current tier with progress toward the next one, and tier benefits, in a dark-blue airline-lounge look.

**Stack choices:** React 19 on Vite for fast feedback; TanStack Query for server state (caching, loading and error states without hand-rolled effects); GraphQL codegen against the gateway's checked-in schema, so every query is typed end to end and a schema change breaks the build instead of the runtime.

## Run

```bash
npm install
npm run dev
```

Opens on http://localhost:5173. Expects the gateway on http://localhost:4000. `npm run codegen` regenerates `src/gql/` from `services/gateway/schema.graphql`.

## Test

```bash
npm test
```

6 vitest tests: pure tier-progress math plus Testing Library component tests.
