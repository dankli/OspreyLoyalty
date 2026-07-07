# ADR-0004: Micro-frontend composition via Vite module federation

**Status:** accepted

## Context

The repo must host two frontend applications built with different frameworks: a React member portal (`frontends/member-portal`) and a Vue 3 admin portal (`frontends/admin-portal`). Spec §5.3 asks for a shell that mounts both under a single nav, and spec §5.3 explicitly asks for an honest account of when not to use this pattern.

The composition itself is a demonstrated skill — it is listed in the job ad and it is the reason the admin portal uses Vue rather than React. Both apps must remain independently buildable, runnable on their own dev servers, and deployable without rebuilding the other.

## Decision

A **thin shell** using **Vite module federation** (`@originjs/vite-plugin-federation`).

Each remote app exposes a single `./mount` entry point:

```ts
export function mount(el: HTMLElement): () => void
```

The shell calls `mount(el)` to render the app into a container element and stores the returned function to call on unmount. The shell owns navigation only; it has no knowledge of the internals of either app.

Both apps keep their existing Vite configs intact. The federation `exposes` block is additive — standalone dev servers and standalone Docker builds continue to work without change.

## When not to use micro-frontends

Micro-frontends carry real costs that are easy to underestimate:

- **Runtime coupling.** The shell and remotes must agree on the mount contract at runtime. A breaking change in a remote's mount signature is invisible at build time until the shell loads it.
- **Shared-dependency drift.** Each federated app ships its own copy of its framework and dependencies unless shared modules are pinned. Version skew between copies of React or Vue across shell and remotes is silent and can produce subtle bugs.
- **Operational surface.** Three separate build artifacts, three Dockerfiles, three CI pipelines, three Nginx configs. Each is straightforward in isolation but the total surface is larger.
- **Developer experience.** Local development requires running multiple dev servers and managing cross-origin configuration that vanishes in production but exists locally.

For a single team working on a single framework, a standard monorepo SPA is the right call. The indirection of module federation solves a coordination problem between independent teams; without that problem, it adds complexity for no gain.

Here the composition is the demonstrated skill and the two frameworks are a genuine constraint, so the trade-off is worth making. The decision would be different in a production codebase with one team.

## Consequences

- Shell and remotes share nothing except the `mount`/`unmount` contract. Shared dependencies are not deduplicated; each remote ships its own copy. This is accepted — the apps are small and the correctness risk from a misconfigured shared scope outweighs the bundle-size saving at demo scale.
- Version skew between shell and remotes is possible and accepted. A remote can be redeployed independently; the shell loads whatever version the remote exposes at runtime.
- Standalone dev servers for member-portal and admin-portal keep working. Federation exposes are additive and do not break existing entry points.
- If module federation build fails on a target environment, the fallback is shell-rendered iframes with the same nav. That path would require an addendum to this ADR.
