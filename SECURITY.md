# Security policy

Osprey Loyalty is a **public demo repository** built to showcase engineering practice. It is not a production system and holds no real user data. This document says what that means for security, how the repo scans itself, and how to report a genuine issue.

## Reporting a vulnerability

If you find a real vulnerability — something beyond the intentional demo simplifications listed below — please report it privately:

- Open a [GitHub private security advisory](https://github.com/dankli/OspreyLoyalty/security/advisories/new), **or**
- email the maintainer (see the GitHub profile).

Please do not open a public issue for an exploitable finding. Expect an acknowledgement within a few days; there is no bug-bounty program.

## Intentional demo simplifications (not vulnerabilities)

These are deliberate, documented trade-offs for a runnable demo — please don't report them:

- **Auth is off by default.** Zero-trust JWT validation ships behind a per-service `AUTH_ENABLED` / `Auth__Enabled` kill-switch that defaults **off**, so the demo and e2e flows run without tokens ([ADR-0007](docs/decisions/0007-zero-trust-auth.md)).
- **Visible demo credentials.** The identity service uses in-memory demo users whose passwords are shown on the login page on purpose. They are allowlisted in `.gitleaks.toml`.
- **Wide-open CORS and unmasked errors.** The gateway runs `cors: "*"` and `maskedErrors: false` so responses are easy to inspect.
- **Secrets in plain manifests.** The k8s manifests embed config in env vars rather than a secrets manager — called out in [`infra/k8s/README.md`](infra/k8s/README.md).

The full analysis of what is and isn't defended, with the reasoning, lives in the **[threat model](docs/threat-model.md)**.

## How the repo scans itself

Every push and pull request runs the [`devsecops`](.github/workflows/devsecops.yml) workflow:

- **Secret scanning** — `gitleaks` over the full git history (demo credentials allowlisted in `.gitleaks.toml`).
- **Dependency, IaC and secret scanning** — `Trivy` (`HIGH`/`CRITICAL`), results uploaded to the repository **Security → Code scanning** tab as SARIF.
- **SBOM** — a CycloneDX software bill of materials, published as a build artifact.
- **Dependency updates** — [Dependabot](.github/dependabot.yml) opens weekly, grouped update PRs across every ecosystem (nuget, maven, cargo, npm, docker, github-actions).

### Visibility before enforcement

The scanners currently **report but do not gate** the build — findings are visible in the Security tab, but a finding won't turn `main` red yet. This is a deliberate first-stage rollout: establish a clean baseline, triage what the tools surface, *then* flip the scanners to blocking (drop `continue-on-error` / raise Trivy's `--exit-code`). Treating "add a scanner" and "enforce a scanner" as two steps avoids a wall of day-one failures that teams learn to ignore. Making enforcement the default is tracked as the follow-up to this rollout.

## Supported versions

Only the tip of `main` is maintained. There are no released versions or backports.
