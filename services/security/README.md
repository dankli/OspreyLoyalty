# security

The fleet's first-party identity provider: a Spring Authorization Server that issues the OIDC/OAuth2 JWTs every backend validates under zero-trust ([docs/decisions/0007](../../docs/decisions/0007-zero-trust-auth.md)). Standard endpoints — `/.well-known/openid-configuration`, `/oauth2/authorize`, `/oauth2/token`, `/oauth2/jwks` — plus a custom, themed `/login`.

**Why Java:** an OIDC provider is a solved problem, and Spring Authorization Server is a mature, spec-complete implementation of it — exactly the "standards over invention" call. The service owns *configuration* (clients, scopes, the token shape), not crypto or protocol code.

## What it issues

- **Two public browser clients** — `member-portal` and `admin-portal`: authorization code + PKCE, no secret. `admin-portal` additionally carries the `admin` scope.
- **One confidential service client** — `partners-service`: the client-credentials grant for the partners → members RabbitMQ hop.
- **Token shape:** access tokens carry a lower-cased `roles` claim (derived from the user's `ROLE_*` authorities) and a fleet-wide `aud` (`osprey-members`, `osprey-partners`, `osprey-gateway`, `osprey-points-engine`), so one token is accepted everywhere. `roles` also rides the id token so the SPA can gate the admin UI; the resource-server audience stays on the access token only.
- **Demo users (in-memory):** `demo-ada` / `demo-erik` / `demo-yusra` (password `password`, role `MEMBER`) mirror the seeded members, so the JWT `sub` is the member id; `admin` (password `admin`, roles `ADMIN` + `MEMBER`). The RSA signing key is generated per boot and kept in memory — restart and the keys rotate.

## Run

```bash
./mvnw spring-boot:run
```

Listens on http://localhost:8080; in the compose stack it lands on http://localhost:9000, which is also the configured issuer (`OIDC_ISSUER`). Every request logs one JSON line with a correlation id (`X-Correlation-Id` accepted or generated); health is at `/actuator/health` and Prometheus metrics at `/actuator/prometheus`.

Auth is **off by default across the fleet**, so the demo and e2e flows need no tokens. This service is what a flipped `AUTH_ENABLED` / `Auth__Enabled` kill-switch points the other services at ([docs/decisions/0007](../../docs/decisions/0007-zero-trust-auth.md)).

## Test

```bash
./mvnw test
```

22 tests: the `client_credentials` grant end-to-end through `/oauth2/token`, decoded against the live JWKS (audience, issuer, wrong/missing-secret rejection); the registered-client configuration (public PKCE clients vs. the confidential service client); the custom login page (CSRF field, error/logout notices); the security wiring (`/error` and actuator reachable, an unauthenticated HTML request redirected to `/login`); the JWKS and discovery documents; and the correlation-id filter.
</content>
