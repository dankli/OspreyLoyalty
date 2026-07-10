<script lang="ts">
  import { strings } from "../../strings";
  import { fetchDestinations as gatewayDestinations } from "../explore/exploreData";
  import {
    fetchMapAirports as gatewayMapAirports,
    loadWasmIsland,
    type IslandModule,
    type MapAirportRow,
    type RouteMapHandle,
  } from "./mapData";

  // Everything injectable: tests pass a fake island + fake data and never touch
  // wasm or transport. Airport indices are the currency across the WASM boundary;
  // all metadata (iata strings) stays here on the JS side (ADR-0022).
  let {
    loadIsland = loadWasmIsland,
    airports = gatewayMapAirports,
    destinations = gatewayDestinations,
    pathIatas = null,
  }: {
    loadIsland?: () => Promise<IslandModule>;
    airports?: () => Promise<MapAirportRow[]>;
    destinations?: (iata: string) => Promise<{ airport: { iata: string } }[]>;
    pathIatas?: string[] | null;
  } = $props();

  let host = $state<HTMLElement | null>(null);
  let failed = $state(false);
  let unavailable = $state(false);
  let selectedIata = $state<string | null>(null);

  let map: RouteMapHandle | null = null;
  let iatas: string[] = [];
  let indexByIata = new Map<string, number>();

  async function pickAirport(index: number) {
    const iata = iatas[index];
    if (!iata || !map) return;
    selectedIata = iata;
    failed = false;
    try {
      const rows = await destinations(iata);
      const destIndexes = rows
        .map((row) => indexByIata.get(row.airport.iata))
        .filter((i): i is number => i !== undefined);
      map.highlight_destinations(index, Uint32Array.from(destIndexes));
    } catch {
      failed = true;
    }
  }

  $effect(() => {
    if (!host) return;
    let cancelled = false;
    const target = host;

    void (async () => {
      let island: IslandModule;
      try {
        island = await loadIsland();
      } catch {
        if (!cancelled) unavailable = true; // no Rust toolchain / pkg not built — a hint, not a crash
        return;
      }
      try {
        const rows = await airports();
        if (cancelled) return;
        iatas = rows.map((row) => row.iata);
        indexByIata = new Map(iatas.map((iata, index) => [iata, index]));
        map = new island.RouteMap(
          target,
          Float32Array.from(rows.map((row) => row.latitude)),
          Float32Array.from(rows.map((row) => row.longitude)),
          (index) => void pickAirport(index),
        );
        map.draw_base();
        drawPath(pathIatas);
      } catch {
        if (!cancelled) failed = true;
      }
    })();

    return () => {
      cancelled = true;
      map?.free?.();
      map = null;
    };
  });

  function drawPath(path: string[] | null | undefined) {
    if (!map || !path || path.length < 2) return;
    const indexes = path
      .map((iata) => indexByIata.get(iata))
      .filter((i): i is number => i !== undefined);
    if (indexes.length >= 2) map.show_path(Uint32Array.from(indexes));
  }

  $effect(() => {
    drawPath(pathIatas);
  });
</script>

<section class="map-panel">
  {#if unavailable}
    <p class="empty">{strings.mapUnavailable}</p>
  {:else}
    {#if selectedIata}
      <p class="selected">{strings.mapSelected.replace("{iata}", selectedIata)}</p>
    {/if}
    {#if failed}
      <p role="alert" class="error">{strings.loadFailed}</p>
    {/if}
    <div class="map-host" bind:this={host}></div>
  {/if}
</section>

<style>
  .map-panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .map-host :global(.map-status) {
    color: #5b6770;
    font-size: 0.85rem;
    margin: 0.4rem 0 0;
  }

  .selected {
    margin: 0;
    font-weight: 600;
  }

  .error {
    color: #b3261e;
  }

  .empty {
    color: #5b6770;
  }
</style>
