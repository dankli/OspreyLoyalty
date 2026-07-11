<script lang="ts">
  import { strings } from "./strings";
  import ExplorePage from "./features/explore/ExplorePage.svelte";
  import RouteSearchPage from "./features/route-search/RouteSearchPage.svelte";
  import MapPanel from "./features/map/MapPanel.svelte";
  import type { AirportHit } from "./features/explore/exploreData";
  import type { RouteOptimize } from "./features/route-search/routeSearchData";

  const TABS = [
    { id: "explore", label: strings.tabExplore },
    { id: "route-search", label: strings.tabRouteSearch },
    { id: "map", label: strings.tabMap },
  ] as const;
  type TabId = (typeof TABS)[number]["id"];
  let tab = $state<TabId>("explore");

  // Panels mount lazily on first visit and then stay mounted (hidden, not destroyed),
  // so each tab keeps its state — search results, itinerary, the WASM map — across switches.
  let visited = $state<Record<TabId, boolean>>({ explore: true, "route-search": false, map: false });

  function open(id: TabId) {
    tab = id;
    visited[id] = true;
  }

  // The latest searched itinerary, shared with the map so "find route" → "Map" draws it.
  let lastPathIatas = $state.raw<string[] | null>(null);

  type RouteSeed = { from: AirportHit | null; to: AirportHit | null; optimize?: RouteOptimize; auto?: boolean };
  let routeSeed = $state.raw<RouteSeed | null>(null);

  function openRoute(seed: RouteSeed) {
    routeSeed = seed;
    open("route-search");
  }

  // Deep link: #route?from=ARN&to=HND&optimize=KM opens the search prefilled and runs it.
  // Only the iatas travel in the URL, so the stub hits display as bare codes until picked over.
  const OPTIMIZE_VALUES = ["KM", "MIN", "HOPS"] as const;
  {
    const match = location.hash.match(/^#route\?(.*)$/);
    if (match) {
      const params = new URLSearchParams(match[1]);
      const stub = (iata: string | null): AirportHit | null =>
        iata ? { iata: iata.toUpperCase(), name: iata.toUpperCase(), city: "", country: "" } : null;
      const from = stub(params.get("from"));
      const to = stub(params.get("to"));
      if (from || to) {
        const rawOptimize = (params.get("optimize") ?? "").toUpperCase();
        routeSeed = {
          from,
          to,
          optimize: (OPTIMIZE_VALUES as readonly string[]).includes(rawOptimize)
            ? (rawOptimize as RouteOptimize)
            : undefined,
          auto: Boolean(from && to),
        };
        tab = "route-search";
        visited["route-search"] = true;
      }
    }
  }
</script>

<div class="route-explorer">
  <header>
    <h1>{strings.title}</h1>
    {#if TABS.length > 1}
      <nav>
        {#each TABS as t (t.id)}
          <button type="button" class={{ active: tab === t.id }} onclick={() => open(t.id)}>
            {t.label}
          </button>
        {/each}
      </nav>
    {/if}
  </header>

  {#if visited.explore}
    <div class="panel" hidden={tab !== "explore"}>
      <ExplorePage onroute={(pair) => openRoute({ ...pair, auto: true })} />
    </div>
  {/if}
  {#if visited["route-search"]}
    <div class="panel" hidden={tab !== "route-search"}>
      <RouteSearchPage seed={routeSeed} onresult={(iatas) => (lastPathIatas = iatas)} />
    </div>
  {/if}
  {#if visited.map}
    <div class="panel" hidden={tab !== "map"}>
      <MapPanel pathIatas={lastPathIatas} />
    </div>
  {/if}
</div>

<style>
  .route-explorer {
    /* Field-guide design system (kept in sync with shell + both portals): shell
       tokens where the host provides them, fleet values as standalone fallbacks. */
    --re-bg: var(--bark-900, #150e08);
    --re-surface: var(--feather-700, #2e2213);
    --re-surface-2: #241a10; /* feather-800 */
    --re-raised: #382a17; /* feather-650 */
    --re-text: var(--cream-100, #efe6d3);
    --re-heading: var(--cream-50, #f7f1e4);
    --re-muted: var(--tan-400, #c1a274);
    --re-accent: var(--amber-500, #e3ae36);
    --re-accent-deep: var(--amber-600, #c8901f);
    --re-on-accent: var(--talon-950, #140d06);
    --re-line: var(--line, rgba(227, 174, 54, 0.22));
    --re-line-soft: rgba(255, 247, 232, 0.06);
    --re-error: #d06a39; /* rust-500 */
    --re-success: #93a75c; /* olive-500 */
    --re-radius: 14px;
    --re-shadow: 0 18px 40px -24px rgba(0, 0, 0, 0.85);
    --re-focus-ring: 0 0 0 3px rgba(227, 174, 54, 0.22);
    --re-font-display: var(--font-display, "Fraunces", Georgia, "Times New Roman", serif);
    --re-font-ui: var(--font-ui, "Hanken Grotesk", system-ui, -apple-system, sans-serif);

    max-width: 60rem;
    margin: 0 auto;
    padding: 2.25rem 1.5rem 3.5rem;
    font-family: var(--re-font-ui);
    font-feature-settings: "tnum" 1;
    color: var(--re-text);
  }

  header {
    animation: rise 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }

  h1 {
    font-family: var(--re-font-display);
    font-weight: 540;
    font-size: 1.75rem;
    letter-spacing: 0.005em;
    color: var(--re-heading);
    margin: 0 0 1.1rem;
  }

  nav {
    display: flex;
    gap: 0.6rem;
    margin-bottom: 1.4rem;
  }

  /* Mirrors .shell-nav button so the remote's tabs read as one family with the host chrome. */
  nav button {
    font: inherit;
    font-weight: 600;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.45rem 1.1rem;
    border: 1px solid var(--re-line);
    border-radius: 9px;
    background: transparent;
    color: var(--re-muted);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }

  nav button:hover {
    background: rgba(227, 174, 54, 0.1);
    color: var(--re-heading);
  }

  nav button.active {
    background: linear-gradient(180deg, var(--re-accent), var(--re-accent-deep));
    color: var(--re-on-accent);
    border-color: transparent;
    font-weight: 700;
  }

  /* Each tab is a field-guide card: raised surface, soft hairline, amber top glow. */
  .panel {
    position: relative;
    background: linear-gradient(180deg, rgba(255, 247, 232, 0.04), transparent 120px), var(--re-surface);
    border: 1px solid var(--re-line-soft);
    border-radius: var(--re-radius);
    padding: 1.75rem;
    box-shadow: var(--re-shadow);
    animation: rise 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) 0.06s both;
  }

  .panel::before {
    content: "";
    position: absolute;
    top: 0;
    left: 1.75rem;
    right: 1.75rem;
    height: 2px;
    border-radius: 2px;
    background: linear-gradient(90deg, transparent, var(--re-accent-deep), transparent);
    opacity: 0.55;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    header,
    .panel {
      animation: none;
    }
  }

  @media (max-width: 640px) {
    .route-explorer {
      padding: 1.5rem 1rem 2.5rem;
    }
    .panel {
      padding: 1.25rem;
    }
    nav {
      gap: 0.4rem;
      overflow-x: auto;
    }
    nav button {
      padding: 0.4rem 0.75rem;
      font-size: 0.72rem;
    }
  }
</style>
