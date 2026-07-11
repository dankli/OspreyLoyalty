<script lang="ts">
  import { untrack, type ComponentProps } from "svelte";
  import { strings, formatNumber } from "../../strings";
  import AirportPicker from "../../lib/AirportPicker.svelte";
  import MapPanel from "../map/MapPanel.svelte";
  import type { AirportHit } from "../explore/exploreData";
  import { searchAirports as gatewaySearch } from "../explore/exploreData";
  import {
    searchRoute as gatewayRouteSearch,
    type RouteOptimize,
    type RoutePathResult,
  } from "./routeSearchData";

  let {
    search = gatewaySearch,
    routeSearch = gatewayRouteSearch,
    onresult,
    mapProps = {},
    seed = null,
  }: {
    search?: (query: string) => Promise<AirportHit[]>;
    routeSearch?: (from: string, to: string, optimize: RouteOptimize) => Promise<RoutePathResult | null>;
    /** Reports the found itinerary's iata sequence upward (the map tab draws it). */
    onresult?: (iatas: string[]) => void;
    /** Overrides forwarded to the inline result map (tests inject a fake island). */
    mapProps?: Partial<ComponentProps<typeof MapPanel>>;
    /** Prefill from a deep link or the explore tab; auto runs the search when both ends are set. */
    seed?: { from: AirportHit | null; to: AirportHit | null; optimize?: RouteOptimize; auto?: boolean } | null;
  } = $props();

  const OPTIMIZE_OPTIONS: { value: RouteOptimize; label: string }[] = [
    { value: "KM", label: strings.optimizeKm },
    { value: "MIN", label: strings.optimizeMin },
    { value: "HOPS", label: strings.optimizeHops },
  ];

  let from = $state.raw<AirportHit | null>(null);
  let to = $state.raw<AirportHit | null>(null);
  let optimize = $state<RouteOptimize>("KM");
  let result = $state.raw<RoutePathResult | null>(null);
  let noRoute = $state(false);
  let loading = $state(false);
  let failed = $state(false);

  function pathToIatas(path: RoutePathResult): string[] {
    return [...path.legs.map((leg) => leg.from.iata), path.legs.at(-1)?.to.iata ?? ""].filter(Boolean);
  }

  async function run(fromHit: AirportHit | null, toHit: AirportHit | null, opt: RouteOptimize) {
    if (!fromHit || !toHit) return;
    loading = true;
    failed = false;
    noRoute = false;
    result = null;
    // A shareable deep link for this exact search (replace: no history spam).
    try {
      history.replaceState(null, "", `#route?from=${fromHit.iata}&to=${toHit.iata}&optimize=${opt}`);
    } catch {
      // sandboxed contexts may refuse; the search itself is unaffected
    }
    try {
      const path = await routeSearch(fromHit.iata, toHit.iata, opt);
      if (path) {
        result = path;
        onresult?.(pathToIatas(path));
      } else {
        noRoute = true; // unreachable is a value on the happy rail, not an error
      }
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!seed) return;
    const incoming = seed;
    untrack(() => {
      if (incoming.from) from = incoming.from;
      if (incoming.to) to = incoming.to;
      if (incoming.optimize) optimize = incoming.optimize;
      if (incoming.auto && incoming.from && incoming.to) {
        void run(incoming.from, incoming.to, incoming.optimize ?? optimize);
      }
    });
  });

  function formatDuration(min: number): string {
    const hours = Math.floor(min / 60);
    const minutes = min % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  let summary = $derived(
    result
      ? strings.totalSummary
          .replace("{hops}", String(result.hops))
          .replace("{km}", formatNumber(result.totalKm))
          .replace("{duration}", formatDuration(result.totalMin))
      : "",
  );

  let resultIatas = $derived(result ? pathToIatas(result) : null);
</script>

<section class="route-search">
  <div class="pickers">
    <AirportPicker label={strings.fromLabel} {search} preset={from} onpick={(hit) => (from = hit)} />
    <AirportPicker label={strings.toLabel} {search} preset={to} onpick={(hit) => (to = hit)} />
  </div>

  <fieldset>
    <legend>{strings.optimizeLabel}</legend>
    {#each OPTIMIZE_OPTIONS as option (option.value)}
      <label>
        <input type="radio" name="optimize" value={option.value} bind:group={optimize} />
        {option.label}
      </label>
    {/each}
  </fieldset>

  <button type="button" class="go" disabled={!from || !to || loading} onclick={() => void run(from, to, optimize)}>
    {strings.searchButton}
  </button>

  {#if failed}
    <p role="alert" class="error">{strings.loadFailed}</p>
  {:else if noRoute}
    <p class="empty">{strings.noRouteFound}</p>
  {:else if loading}
    <p class="loading">{strings.loading}</p>
  {:else if result}
    <h2>{strings.legsHeading}</h2>
    <p class="summary">
      {summary}
      {#if result.estimatedPoints !== null}
        <span class="points-badge">{strings.pointsBadge.replace("{points}", formatNumber(result.estimatedPoints))}</span>
      {/if}
    </p>
    <table>
      <thead>
        <tr>
          <th>{strings.fromLabel}</th>
          <th>{strings.toLabel}</th>
          <th>{strings.colDistance}</th>
          <th>{strings.colDuration}</th>
          <th>{strings.colCarriers}</th>
        </tr>
      </thead>
      <tbody>
        {#each result.legs as leg (leg.from.iata + leg.to.iata)}
          <tr>
            <td><strong>{leg.from.iata}</strong> {leg.from.city}</td>
            <td><strong>{leg.to.iata}</strong> {leg.to.city}</td>
            <td>{formatNumber(leg.km)} km</td>
            <td>{formatDuration(leg.min)}</td>
            <td>{leg.carriers.length > 0 ? leg.carriers.map((c) => c.name).join(", ") : strings.noCarriers}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <!-- The found itinerary on a world map, right where the search happened. -->
    <MapPanel pathIatas={resultIatas} {...mapProps} />
  {/if}
</section>

<style>
  .route-search {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  h2 {
    font-family: var(--re-font-display, "Fraunces", Georgia, serif);
    font-weight: 540;
    font-size: 1.25rem;
    letter-spacing: 0.005em;
    color: var(--re-heading, #f7f1e4);
    margin: 0.5rem 0 0;
  }

  .pickers {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .pickers > :global(*) {
    flex: 1 1 18rem;
  }

  fieldset {
    display: flex;
    gap: 1.25rem;
    border: 1px solid var(--re-line-soft, rgba(255, 247, 232, 0.06));
    border-radius: 12px;
    background: var(--re-surface-2, #241a10);
    padding: 0.7rem 1rem 0.8rem;
    max-width: 28rem;
    margin: 0;
  }

  legend {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--re-muted, #c1a274);
    padding: 0 0.35rem;
  }

  fieldset label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.95rem;
    color: var(--re-text, #efe6d3);
    cursor: pointer;
  }

  fieldset input[type="radio"] {
    accent-color: var(--re-accent, #e3ae36);
    cursor: pointer;
  }

  /* Primary action: the fleet's amber gradient pill with the soft glow. */
  .go {
    align-self: flex-start;
    font: inherit;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 0.7rem 1.6rem;
    border: none;
    border-radius: 999px;
    background: linear-gradient(180deg, var(--re-accent, #e3ae36), var(--re-accent-deep, #c8901f));
    color: var(--re-on-accent, #140d06);
    cursor: pointer;
    box-shadow: 0 6px 16px -8px rgba(227, 174, 54, 0.6);
    transition: transform 0.12s ease, filter 0.15s ease;
  }

  .go:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }

  .go:disabled {
    opacity: 0.32;
    cursor: not-allowed;
    box-shadow: none;
  }

  .summary {
    color: var(--re-heading, #f7f1e4);
    font-variant-numeric: tabular-nums;
    margin: 0;
  }

  .points-badge {
    display: inline-block;
    margin-left: 0.6rem;
    padding: 0.18rem 0.7rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    background: rgba(227, 174, 54, 0.16);
    color: var(--re-accent, #e3ae36);
    box-shadow: 0 0 18px -6px rgba(227, 174, 54, 0.35);
  }

  .error {
    margin: 0;
    padding: 0.6rem 0.85rem;
    border-radius: 10px;
    background: rgba(208, 106, 57, 0.14);
    border: 1px solid rgba(208, 106, 57, 0.4);
    color: var(--re-error, #d06a39);
  }

  .empty,
  .loading {
    color: var(--re-muted, #c1a274);
  }

  /* Mirrors the member portal's .transactions table. */
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.9rem;
  }

  th,
  td {
    text-align: left;
    padding: 0.55rem 0.75rem;
  }

  th {
    color: var(--re-muted, #c1a274);
    font-weight: 600;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    border-bottom: 1px solid var(--re-line, rgba(227, 174, 54, 0.22));
  }

  td {
    border-bottom: 1px solid var(--re-line-soft, rgba(255, 247, 232, 0.06));
    font-variant-numeric: tabular-nums;
  }

  tbody tr {
    transition: background 0.12s ease;
  }

  tbody tr:hover {
    background: rgba(255, 247, 232, 0.03);
  }

  td strong {
    color: var(--re-accent, #e3ae36);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
