<script lang="ts">
  import { strings } from "./strings";
  import ExplorePage from "./features/explore/ExplorePage.svelte";
  import RouteSearchPage from "./features/route-search/RouteSearchPage.svelte";
  import MapPanel from "./features/map/MapPanel.svelte";

  const TABS = [
    { id: "explore", label: strings.tabExplore },
    { id: "route-search", label: strings.tabRouteSearch },
    { id: "map", label: strings.tabMap },
  ] as const;
  type TabId = (typeof TABS)[number]["id"];
  let tab = $state<TabId>("explore");

  // The latest searched itinerary, shared with the map so "find route" → "Map" draws it.
  let lastPathIatas = $state.raw<string[] | null>(null);
</script>

<div class="route-explorer">
  <header>
    <h1>{strings.title}</h1>
    {#if TABS.length > 1}
      <nav>
        {#each TABS as t (t.id)}
          <button type="button" class={{ active: tab === t.id }} onclick={() => (tab = t.id)}>
            {t.label}
          </button>
        {/each}
      </nav>
    {/if}
  </header>

  {#if tab === "explore"}
    <ExplorePage />
  {:else if tab === "route-search"}
    <RouteSearchPage onresult={(iatas) => (lastPathIatas = iatas)} />
  {:else if tab === "map"}
    <MapPanel pathIatas={lastPathIatas} />
  {/if}
</div>

<style>
  .route-explorer {
    max-width: 60rem;
    margin: 0 auto;
    padding: 1.5rem 1rem;
    font-family:
      system-ui,
      -apple-system,
      "Segoe UI",
      sans-serif;
    color: #1c2429;
  }

  h1 {
    font-size: 1.4rem;
    margin: 0 0 1rem;
  }

  nav {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  nav button {
    padding: 0.4rem 0.9rem;
    border: 1px solid #c8d0d8;
    border-radius: 999px;
    background: none;
    cursor: pointer;
  }

  nav button.active {
    background: #12436d;
    color: #fff;
    border-color: #12436d;
  }
</style>
