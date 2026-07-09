# 0011 — Traefik ingress with host-based routing (local Kubernetes)

Status: accepted

## Context

The local Kubernetes deployment (Docker Desktop, kind-based) originally exposed every service
through its own `kubectl port-forward` — eight of them, on assorted `localhost:<port>` ports. That
works but is unlike production, clutters the terminal, and couples the OIDC configuration to a spread
of ports. We wanted a single, production-shaped entry point, and explicitly a *modern* alternative to
ingress-nginx.

## Decision

Front the stack with **Traefik v3** as the ingress controller, using standard Kubernetes `Ingress`
objects (no vendor CRDs) with **host-based routing** under `*.osprey.localtest.me` — a public
wildcard domain that resolves to `127.0.0.1`, so there is no `/etc/hosts` editing. On Docker Desktop
the Traefik `LoadBalancer` Service is published on `localhost:80`, and Traefik routes by `Host`:

| Host | Backend |
|------|---------|
| `app.osprey.localtest.me` | shell (module-federation host, the entry point) |
| `member.` / `admin.` | member-portal / admin-portal remotes |
| `id.` | security (OIDC issuer) |
| `api.` | gateway (GraphQL BFF) |
| `members.` / `partners.` | resource servers the admin portal calls directly |
| `grafana.` / `jaeger.` / `traefik.` | ops dashboards |

Host-based (one origin per app) rather than path-based keeps the SPA, module-federation and CORS
model intact — each frontend keeps a distinct origin, just under a new name.

This is the **default** for `run-local-k8s`; the old localhost port-forward setup remains available
behind `--port-forward` / `-PortForward`.

### Auth re-wiring

Because origins move from `localhost:<port>` to hostnames, the identity service is reconfigured per
mode via env (issuer decoupled from JWKS made this clean — resource servers always fetch JWKS from
the in-cluster `security:8080`, only the issuer *string* changes):

- `OIDC_ISSUER=http://id.osprey.localtest.me`; the browser reaches discovery, `/oauth2/authorize`,
  `/oauth2/token` and `/oauth2/jwks` at that host through Traefik, and the id/access token `iss`
  matches.
- Registered redirect / post-logout URIs and CORS origins are set to the `app./member./admin.` hosts.
- `members` `Auth:Issuer` is set to the same hostname so it validates hostname-issued tokens.
- The frontends are rebuilt with matching Vite build args (issuer, redirect, gateway/members/partners
  URLs, and — new — the shell's module-federation remote URLs).

## Consequences

- One entry point (`http://app.osprey.localtest.me`) instead of eight port-forwards; more
  production-like and easier to demo.
- Switching modes re-issues tokens under a different issuer/signing key, so a cached service token or
  JWKS entry from the previous mode is briefly rejected — `run-local-k8s` restarts the token minter
  (partners) and validator (members) on every auth run to force a fresh mint/validate.
- Traefik needs a small ClusterRole (services, endpoints, endpointslices, secrets, **nodes**,
  ingresses/ingressclasses). Missing `nodes` silently stalls ingress sync.
- The ingress manifests live in `infra/k8s/ingress/` so the non-recursive `kubectl apply -f
  infra/k8s` does not pull them in; `run-local-k8s` applies them only in ingress mode.
- TLS is not configured (plain HTTP on `localtest.me`); OIDC over `http` is acceptable for a local
  demo. A production deployment would terminate TLS at the gateway and use real hostnames.
