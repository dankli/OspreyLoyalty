<script lang="ts">
  import { strings, formatNumber } from "../../strings";
  import { logClient } from "../../telemetry";
  import { fetchDestinations as gatewayDestinations } from "../explore/exploreData";
  import {
    fetchAirportDetails as gatewayAirportDetails,
    fetchMapAirports as gatewayMapAirports,
    loadWasmIsland,
    type AirportDetails,
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
    airportDetails = gatewayAirportDetails,
    pathIatas = null,
  }: {
    loadIsland?: () => Promise<IslandModule>;
    airports?: () => Promise<MapAirportRow[]>;
    destinations?: (iata: string) => Promise<{ airport: { iata: string } }[]>;
    airportDetails?: (iata: string) => Promise<AirportDetails | null>;
    pathIatas?: string[] | null;
  } = $props();

  let host = $state<HTMLElement | null>(null);
  let failed = $state(false);
  let hovered = $state.raw<{ iata: string; degree: number } | null>(null);
  let pointer = $state({ x: 0, y: 0 });
  let unavailable = $state(false);
  let airportCount = $state(0);

  type Selection = { iata: string; details: AirportDetails | null; destinationCount: number | null };
  let selected = $state.raw<Selection | null>(null);
  let pathDrawn = $state(false);

  let map: RouteMapHandle | null = null;
  let mapRows: MapAirportRow[] = [];
  let iatas: string[] = [];
  let indexByIata = new Map<string, number>();
  let pickGeneration = 0; // stale pick responses must not repaint a newer scene

  // The island draws; this line says what it drew. All user-facing text lives on the
  // Svelte side so the catalogs (ADR-0009) cover it: selection > itinerary > base hint.
  let status = $derived.by(() => {
    if (selected) {
      const { details, destinationCount } = selected;
      if (details && destinationCount !== null) {
        return strings.mapSelectedDetails
          .replace("{name}", details.name)
          .replace("{iata}", details.iata)
          .replace("{city}", details.city)
          .replace("{country}", details.country)
          .replace("{count}", formatNumber(destinationCount));
      }
      return strings.mapSelected.replace("{iata}", selected.iata);
    }
    if (pathDrawn && pathIatas && pathIatas.length >= 2) {
      return strings.mapStatusPath.replace("{count}", String(pathIatas.length - 1));
    }
    if (airportCount > 0) {
      return strings.mapStatusBase.replace("{count}", formatNumber(airportCount));
    }
    return "";
  });

  async function pickAirport(index: number) {
    const iata = iatas[index];
    if (!iata || !map) return;
    const mine = ++pickGeneration;
    selected = { iata, details: null, destinationCount: null };
    failed = false;
    try {
      const [details, rows] = await Promise.all([
        airportDetails(iata).catch(() => null), // details are garnish — a miss degrades the label, not the pick
        destinations(iata),
      ]);
      if (mine !== pickGeneration || !map) return;
      const destIndexes = rows
        .map((row) => indexByIata.get(row.airport.iata))
        .filter((i): i is number => i !== undefined);
      map.highlight_destinations(index, Uint32Array.from(destIndexes));
      selected = { iata, details, destinationCount: rows.length };
      pathDrawn = false;
    } catch {
      if (mine === pickGeneration) failed = true;
    }
  }

  $effect(() => {
    if (!host) return;
    let cancelled = false;
    const target = host;

    void (async () => {
      const startedAt = performance.now();
      let island: IslandModule;
      try {
        island = await loadIsland();
      } catch {
        if (!cancelled) unavailable = true; // no Rust toolchain / pkg not built — a hint, not a crash
        return;
      }
      const islandMs = Math.round(performance.now() - startedAt);
      try {
        const rows = await airports();
        if (cancelled) return;
        const airportsMs = Math.round(performance.now() - startedAt) - islandMs;
        mapRows = rows;
        iatas = rows.map((row) => row.iata);
        indexByIata = new Map(iatas.map((iata, index) => [iata, index]));
        map = new island.RouteMap(
          target,
          Float32Array.from(rows.map((row) => row.latitude)),
          Float32Array.from(rows.map((row) => row.longitude)),
          Uint32Array.from(rows.map((row) => row.degree)),
          rows.map((row) => row.iata),
          (index) => void pickAirport(index),
          (index) => {
            const row = index >= 0 ? mapRows[index] : undefined;
            hovered = row ? { iata: row.iata, degree: row.degree } : null;
          },
        );
        map.draw_base();
        airportCount = rows.length;
        drawPath(pathIatas);
        // How long the WASM island took to become interactive — visible in Loki
        // alongside the backend spans, since the browser is otherwise a blind spot.
        logClient("info", "map-island-ready", {
          islandMs,
          airportsMs,
          totalMs: Math.round(performance.now() - startedAt),
          airports: rows.length,
        });
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
    if (indexes.length >= 2) {
      map.show_path(Uint32Array.from(indexes));
      pickGeneration += 1; // a late pick response must not repaint over the fresh path
      selected = null;
      pathDrawn = true;
    }
  }

  $effect(() => {
    drawPath(pathIatas);
  });
</script>

<section class="map-panel">
  {#if unavailable}
    <p class="empty">{strings.mapUnavailable}</p>
  {:else}
    <div class="map-bar">
      {#if status}
        <p class="status">{status}</p>
      {/if}
      <div class="zoom" role="group" aria-label={strings.zoomIn}>
        <button type="button" onclick={() => map?.zoom_in()} title={strings.zoomIn} aria-label={strings.zoomIn}>+</button>
        <button type="button" onclick={() => map?.zoom_out()} title={strings.zoomOut} aria-label={strings.zoomOut}>−</button>
        <button type="button" onclick={() => map?.reset_view()} title={strings.zoomReset} aria-label={strings.zoomReset}>⌂</button>
      </div>
    </div>
    {#if failed}
      <p role="alert" class="error">{strings.loadFailed}</p>
    {/if}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="map-host"
      role="img"
      aria-label={strings.mapAriaLabel}
      bind:this={host}
      onmousemove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      }}
    ></div>
    {#if hovered}
      <div class="tooltip" style:left="{pointer.x}px" style:top="{pointer.y}px" aria-hidden="true">
        <strong>{hovered.iata}</strong>
        {strings.tooltipDestinations.replace("{count}", formatNumber(hovered.degree))}
      </div>
    {/if}
  {/if}
</section>

<style>
  .map-panel {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .map-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    min-height: 2rem;
  }

  .status {
    margin: 0;
    color: var(--re-heading, #f7f1e4);
    font-variant-numeric: tabular-nums;
  }

  .zoom {
    display: flex;
    gap: 0.3rem;
    margin-left: auto;
  }

  /* The member portal's pager buttons, sized square for the toolbar. */
  .zoom button {
    width: 2rem;
    height: 2rem;
    font: inherit;
    font-size: 1rem;
    line-height: 1;
    border: 1px solid var(--re-line, rgba(227, 174, 54, 0.22));
    border-radius: 9px;
    background: var(--re-surface-2, #241a10);
    color: var(--re-text, #efe6d3);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .zoom button:hover {
    border-color: var(--re-accent, #e3ae36);
    background: var(--re-raised, #382a17);
  }

  /* The canvas island sits framed like every other field-guide card. */
  .map-host {
    border: 1px solid var(--re-line-soft, rgba(255, 247, 232, 0.06));
    border-radius: var(--re-radius, 14px);
    overflow: hidden;
    box-shadow: var(--re-shadow, 0 18px 40px -24px rgba(0, 0, 0, 0.85));
  }

  .map-panel {
    position: relative; /* anchors the hover tooltip */
  }

  .tooltip {
    position: absolute;
    transform: translate(14px, 6px);
    padding: 0.25rem 0.6rem;
    border-radius: 8px;
    background: var(--re-surface-2, #241a10);
    border: 1px solid var(--re-line, rgba(227, 174, 54, 0.22));
    color: var(--re-text, #efe6d3);
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    white-space: nowrap;
    box-shadow: var(--re-shadow, 0 18px 40px -24px rgba(0, 0, 0, 0.85));
    z-index: 2;
  }

  .tooltip strong {
    color: var(--re-accent, #e3ae36);
  }

  .error {
    margin: 0;
    padding: 0.6rem 0.85rem;
    border-radius: 10px;
    background: rgba(208, 106, 57, 0.14);
    border: 1px solid rgba(208, 106, 57, 0.4);
    color: var(--re-error, #d06a39);
  }

  .empty {
    color: var(--re-muted, #c1a274);
  }
</style>
