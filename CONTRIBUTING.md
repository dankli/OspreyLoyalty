# Contributing to Osprey Loyalty

Thanks for taking a look. Osprey Loyalty is a build-in-public demo, so the bar is
the same one the [README](README.md) describes: clear domain code, tests where the
business rules live, and each service justifying its existence. This guide covers
how to run it, how to test it, and the conventions a change is expected to follow.

## Prerequisites

You need the toolchains for the parts you touch (all pinned in CI):

| Area | Toolchain |
|---|---|
| `services/members` | .NET 10 SDK |
| `services/gateway`, `frontends/*` | Node 22 |
| `services/partners`, `services/security` | JDK 21 (use the committed `./mvnw` — there is no global Maven) |
| `services/points-engine` | Rust (stable, edition 2024) |
| Running the stack | Docker (Compose), or Docker Desktop / kind for Kubernetes |

## Run it locally

The fastest loop is Docker Compose; the full experience is Kubernetes. Both are
documented in the [README](README.md#run-it):

```bash
docker compose -f infra/docker-compose.yml up --build   # or ./run-docker-compose.sh
./run-local-k8s.sh                                       # Kubernetes twin
```

## Run the tests

Every service owns its tests; run the ones for what you changed. The full matrix
runs in CI (one workflow per service), so a green PR is a fast PR.

```bash
# members (C#) — integration tests use Testcontainers, so Docker must be running
dotnet test services/members/Osprey.Members.sln

# gateway and the three frontends (TypeScript)
cd services/gateway      && npm test        # then frontends/member-portal, admin-portal, shell

# partners and security (Java)
cd services/partners     && ./mvnw test     # then services/security

# points-engine (Rust)
cd services/points-engine && cargo test
```

## Conventions

These are the habits the codebase is built on — please keep to them:

- **Vertical Slice Architecture.** One folder per feature under `Features/`, holding
  its contracts, validation, handler, and endpoint. `*.Core.cs` stays pure and I/O-free.
- **Test-first for anything where behavior could regress.** Tests are named as
  behavior sentences (`Qualifying_points_map_to_tier`), not implementation details.
- **Conventional Commits.** e.g. `feat(members): ...`, `fix(partners): ...`,
  `refactor(...)`, `docs: ...`, `chore(k8s): ...`. Keep commits logical and focused.
- **Bounded everything.** Every query, loop, retry, and integration call gets an
  explicit bound and a timeout with a reason. Small habit, cheap insurance.
- **Architecture decisions get an ADR.** Non-trivial or structural changes should
  add a numbered record under [`docs/decisions/`](docs/decisions) explaining the
  trade-off, in the style of the existing ones.

## Pull requests

1. Branch from `main` and keep the change scoped to one concern.
2. Make sure the relevant test suites pass locally (see above) and add tests for
   new behavior.
3. Fill in the [pull request template](.github/PULL_REQUEST_TEMPLATE.md) — it is a
   short checklist, not busywork.
4. If you changed a service's public surface (REST/GraphQL/events), say so in the
   PR and update the affected clients and docs.

## Reporting bugs and proposing features

Use the [issue templates](.github/ISSUE_TEMPLATE) — a good repro or a clear
motivation makes triage fast. Security issues follow a different path: see
[SECURITY.md](SECURITY.md), and please do not open a public issue for them.

By contributing, you agree that your contributions are licensed under the same
terms as the project (see [LICENSE](LICENSE)) and that you will uphold the
[Code of Conduct](CODE_OF_CONDUCT.md).
