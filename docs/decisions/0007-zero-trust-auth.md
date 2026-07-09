# ADR-0007: First-party OIDC and zero-trust JWT validation

**Status:** accepted

## Context

Through phase 5 the platform had no authentication — a deliberate spec non-goal that the README called out. Phase 6 introduces enterprise identity: users log in, every service trusts a token rather than the network, and admin surfaces (point adjustments, OSPREY invitations, partner rates) require a role. Three questions had to be answered: who issues tokens, how deeply they are validated, and how to add all this without breaking the running stack, the e2e smoke test, or the existing per-service test suites.

## Decision

**A first-party identity service (`services/security`) built on Spring Authorization Server.** It issues OIDC/OAuth2 JWTs, publishes `/.well-known/openid-configuration` and `/oauth2/jwks`, registers the two browser portals as public PKCE clients and `partners-service` as a client-credentials client, and authenticates in-memory demo users (`demo-ada/erik/yusra` mirror the seeded members so the JWT `sub` is the member id; `admin` carries the admin role). Access tokens carry a `roles` claim and an `aud` covering every resource server. The signing key is generated at startup. Choosing to *write* the server (vs. running Keycloak) matches this repo's "each service justifies its existence and shows a stack" ethos and keeps full control of the token shape.

**Full zero-trust: every backend validates the JWT itself** — members (.NET JwtBearer), partners (Spring resource server), points-engine (Rust `jsonwebtoken`). The gateway is deliberately **not** a trust boundary: it does not validate tokens, it just **forwards the caller's `Authorization` downstream** so each service re-checks independently (a compromised or bypassed gateway therefore grants nothing). RS256 tokens are validated against the identity service's JWKS fetched from a **direct** jwk-set endpoint (`security:8080/oauth2/jwks`), not via OIDC metadata discovery — the token's issuer is the browser-facing `localhost:9000`, so the discovery document's `jwks_uri` would be unreachable in-cluster. Admin endpoints require the `admin` role; member endpoints require a valid token.

**Every service's auth is gated by a kill-switch defaulting off** (`Auth:Enabled` / `AUTH_ENABLED`). This is the load-bearing decision that let auth land incrementally: the 33-check e2e and the existing unit/integration suites keep running unchanged, and compose/prod turn auth on via one env var. Auth tests enable the switch and validate tokens against a shared HS256 test key, so no live identity service is needed to prove 401/403/200 behaviour.

**Docker issuer/JWKS split.** Tokens carry the browser-facing issuer (`http://localhost:9000`), but in-container resource servers fetch JWKS from `http://security:8080` — issuer validation and key retrieval are configured separately so the same token is valid to a browser and to a service on the compose network.

## Alternatives considered

**Keycloak.** Battle-tested, less code, but a product we operate rather than a service we build; it would not demonstrate the OIDC mechanics or fit the repo's one-language-per-service story.

**Edge-only validation at the gateway.** Simpler, but the internal services would trust the network — the opposite of zero-trust. Forwarding the token and validating everywhere is the point.

**Auth on by default.** More "secure by default", but it would break the e2e and every existing test on the commit that introduced it, forcing a big-bang change. The kill-switch trades a config flip for a safe, incremental rollout.

## Consequences

- One new deployable (`services/security`) + CI (`security.yml`) + k8s manifest.
- The async **RabbitMQ earn hop is token-authenticated** too: partners mints a short-lived service token (HS256 in demo/test, mirroring the shared key members validates; production would fetch a client-credentials token from the IdP) and stamps it on each `EarnEvent` as an optional trailing `authToken` field (backward-compatible per the ADR-0002 additive-field convention). When auth is on, members validates the token (signature, `aud=osprey-members`, lifetime) **before** applying the earn and dead-letters an unauthenticated event rather than requeueing it forever. Off (the default), the field is ignored. This closes the last zero-trust surface — both the synchronous path (portals → gateway → members/partners) and the async path are now covered. In compose the two sides share a single `AUTH_SHARED_SECRET` (wired to members' `Auth__TestSigningKey` and partners' `AUTH_SERVICE_TOKEN_SECRET`) so enabling auth can't leave the minter and validator on mismatched keys; the rejection path logs a specific reason. Caveat: partners mints HS256, so it only validates against a members validator in the matching HS256 mode — a members validator in JWKS/RS256 mode would reject the HS256 mint, which is why the real production shape is partners fetching an RS256 client-credentials token from the IdP.
- points-engine validates either HS256 (shared secret) or RS256 against the identity service's JWKS (`AUTH_JWKS_URI`, keys cached), matching the other resource servers. It sits outside the earn path, so this auth is belt-and-braces (ADR-0006).
- The startup-generated signing key means tokens do not survive a security-service restart; production would persist the key (or use a KMS).
- Roles are matched leniently (any role-typed claim whose value is `admin`) to absorb differences in how each stack maps a JSON-array `roles` claim.
- **Browser login** is authorization-code + PKCE via `oidc-client-ts`, wired into the shell and both portals behind a frontend kill-switch (`VITE_AUTH_ENABLED`, off by default so the frontend suites and the e2e stay green). To get SSO across the module-federation boundary, the shell logs in once and shares the access token with both remotes through a single `sessionStorage` key (`osprey.auth.session`); the shell uses the admin-portal client so one token carries both member and admin scopes, and the user's roles still gate admin actions. With auth on, the member portal resolves its member id from the token `sub` (the dev `?as=` override is honoured only with auth off, so it cannot spoof identity).
