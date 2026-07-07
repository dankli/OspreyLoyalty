# Admin portal

The back-office side of Osprey Loyalty: member lookup, manual point adjustments, partner earn rates, and the PANDION invitation toggle. Vue 3, because the repo exists to show more than one frontend stack — the member portal is React, this one is not, and the shell composes both ([ADR-0004](../../docs/decisions/0004-micro-frontend-tradeoff.md)).

It talks directly to the members service (`:5080`) and the partners service (`:8081`) over REST — admin operations are not member-facing, so they skip the GraphQL gateway on purpose. Base URLs come from `VITE_MEMBERS_URL` / `VITE_PARTNERS_URL`, defaulting to localhost.

There is no authentication, by design — see "What's deliberately missing" in the [root README](../../README.md). In production these surfaces would sit behind OIDC with role checks.

```bash
npm run dev     # standalone on :5174
npm test        # vitest
npm run build   # type-check + build, exposes ./mount via module federation
```
