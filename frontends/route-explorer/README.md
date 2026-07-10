# Route explorer

The airline network explorer, in three tabs: **Explore** (airport typeahead plus a direct-destinations
table), **Route search** (best itinerary A→B by distance, time, or hops, with an estimated-points
badge), and **Map** (the network and searched itineraries on a Canvas 2D world map). Svelte 5, because
the repo exists to show more than one frontend stack — this is the third module-federation remote
beside the React member portal and the Vue admin portal
([ADR-0022](../../docs/decisions/0022-svelte-mfe-leptos-wasm-island.md), building on
[ADR-0004](../../docs/decisions/0004-micro-frontend-tradeoff.md)).

It talks only to the gateway over GraphQL, with codegen against the checked-in schema — `npm run
codegen` regenerates `src/gql/` from `services/gateway/schema.graphql`, same as the member portal.
Unlike the member portal there is no TanStack Query equivalent: every view here is read-only, so
Svelte 5 runes cover fetch/loading/error state without another dependency.

The map is a **Rust/Leptos WASM island** ([`wasm-map/`](wasm-map)), compiled by wasm-pack into a pkg
the Svelte host imports lazily. The JS↔WASM boundary is typed arrays and airport indices — Svelte
keeps all the metadata. Neither `npm run dev` nor `npm test` needs a Rust toolchain: without the pkg
the Map tab shows a placeholder, and the Docker build compiles the crate in its own Rust stage. The
remote follows [ADR-0009](../../docs/decisions/0009-i18n-strategy.md): five JSON catalogs in
`src/locales/`, resolved by the tiny lookup in `src/strings.ts` off the fleet's shared
`localStorage("lang")` switch, English as fallback. The UI follows the fleet's "field-guide" design
system (see `frontends/member-portal/src/index.css` for the reference tokens): Fraunces display
headings, Hanken Grotesk UI, the bark/amber/cream palette via `--re-*` custom properties that
inherit the shell's tokens and fall back to the same values standalone. All user-facing text —
including the map's status line — renders on the Svelte side; the WASM island carries no copy.

```bash
npm run dev          # standalone on :5175, expects the gateway on :4000
npm test             # vitest
npm run build:wasm   # compile the map island into src/wasm/pkg (needs Rust + wasm-pack)
npm run codegen      # regenerate src/gql/ from the gateway schema
npm run build        # type-check + build, exposes ./mount via module federation
```

The island's pure geometry (projection, great-circle sampling, pick hit-testing, label
decluttering) and basemap decoding are tested natively — `cargo test` in `wasm-map/`. The
basemap (coastlines + zoom-ranked city labels) is Natural Earth public-domain data embedded
in the crate; regenerate the binaries with `node wasm-map/tools/build-basemap.mjs`.
