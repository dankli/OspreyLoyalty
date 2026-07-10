# ADR-0022: Svelte micro-frontend with a Rust/Leptos WASM map island

**Status:** accepted

## Context

The Route Explorer needs a third remote in the shell: airport search, destination lists, itinerary search, and an interactive world map rendering ~3,900 airports with great-circle route arcs. ADR-0004 already established framework-per-remote module federation (React member portal, Vue admin portal, framework-less shell) with no shared dependencies — each remote bundles its own stack.

The map is the interesting part: projecting and drawing thousands of points, sampling great-circle arcs, and hit-testing clicks is compute-and-canvas work, not DOM work.

## Decision

**One Svelte 5 remote (`frontends/route-explorer`) with an embedded Rust WASM island for the map.**

- The remote follows the ADR-0004 contract exactly: `@originjs/vite-plugin-federation`, exposes `./mount` with signature `(el: HTMLElement) => () => void`, no `shared` config, its own Vite 8 + TypeScript build, nginx image with CORS on `/assets/`. Svelte extends the polyglot-frontend story the same way Vue did. The `federationCssMarkerFix()` workaround from the portals applies here too — it patches a Vite 8 minifier interaction inside the federation plugin, not anything React-specific.
- The map is a **WASM island** built from a Rust crate (`frontends/route-explorer/wasm-map/`, Leptos internally) compiled with **wasm-pack** (`--target web`) into an npm-consumable pkg that Vite imports lazily. The crate is a build artifact of this frontend, not a service — it lives inside the MFE folder and joins no Rust workspace (points-engine is likewise standalone).
- **The JS↔WASM boundary is typed arrays and indices, not JSON.** The exported surface is a single `RouteMap` handle: `new(canvas, lats: &[f32], lons: &[f32])`, `draw_base()`, `highlight_destinations(from: u32, dests: &[u32])`, `show_path(path: &[u32])`, `pick(x, y) -> i32`, `resize(w, h)`. Svelte fetches the airport list once, builds `Float32Array`s, and keeps all metadata (IATA codes, names, tooltips) on the JS side; airport *indices* are the shared currency. Svelte never sees Leptos.
- **Canvas 2D, not WebGL.** v1 draws all ~3.9k airports as dots and arcs only for the selected airport (≤300 destinations) or a searched itinerary — hundreds of paths, comfortably within Canvas 2D. Rendering all 59k edges simultaneously is the explicit WebGL trigger and is out of scope.
- **Graceful degradation:** the Svelte host dynamic-imports the wasm pkg and renders a "map unavailable — run `npm run build:wasm`" placeholder if the import fails. `npm test` and `npm run dev` never require a Rust toolchain; the Docker build compiles the crate in a dedicated `rust:1-slim` stage.

## Alternatives considered

**Two separate remotes (one Svelte, one Leptos).** Shows both stacks standalone, but Leptos-as-federation-remote needs a hand-rolled JS shim around the WASM bundle to satisfy the mount contract, doubling integration surface for no user-facing gain. The island gives each technology an honest job instead of a parallel showcase.

**Svelte only, map in JS (d3/deck.gl).** Fewer moving parts and deck.gl would trivially handle the rendering. But the repo's purpose includes demonstrating WASM interop done properly (narrow typed-array API, graceful fallback, multi-stage build), and the compute-heavy canvas work is the one place a WASM island pays rather than poses.

**Whole remote in Leptos (trunk build).** Maximal Rust, but trunk produces a whole-app bundle that fights the federation plugin, and DOM-heavy views (forms, tables, typeahead) are where Rust/WASM is weakest — string-heavy DOM interop erases the performance argument.

## Consequences

- A fourth frontend stack to maintain — accepted; it is the point of the repo (ADR-0004's trade-off table already covers the cost).
- The Rust toolchain enters the frontend CI path, but only for the `wasm-map` crate: `cargo test` runs the pure geometry natively; wasm-pack runs in Docker/CI, not on every contributor machine.
- Pure geometry (equirectangular projection, great-circle slerp sampling, pick hit-testing) lives in `geometry.rs` and is tested with plain `cargo test` — the A-Frame shape: logic in the middle, canvas at the edge.
- If the map ever needs all 59k edges at once, the island's API stays; only the drawing backend inside the crate moves to WebGL.
