<script lang="ts">
  import { strings } from "../../strings";
  import AirportPicker from "../../lib/AirportPicker.svelte";
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
  }: {
    search?: (query: string) => Promise<AirportHit[]>;
    routeSearch?: (from: string, to: string, optimize: RouteOptimize) => Promise<RoutePathResult | null>;
    /** Reports the found itinerary's iata sequence upward (the map tab draws it). */
    onresult?: (iatas: string[]) => void;
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

  async function run() {
    if (!from || !to) return;
    loading = true;
    failed = false;
    noRoute = false;
    result = null;
    try {
      const path = await routeSearch(from.iata, to.iata, optimize);
      if (path) {
        result = path;
        onresult?.([...path.legs.map((leg) => leg.from.iata), path.legs.at(-1)?.to.iata ?? ""].filter(Boolean));
      } else {
        noRoute = true; // unreachable is a value on the happy rail, not an error
      }
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  function formatDuration(min: number): string {
    const hours = Math.floor(min / 60);
    const minutes = min % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  let summary = $derived(
    result
      ? strings.totalSummary
          .replace("{hops}", String(result.hops))
          .replace("{km}", result.totalKm.toLocaleString("en-US"))
          .replace("{duration}", formatDuration(result.totalMin))
      : "",
  );
</script>

<section class="route-search">
  <div class="pickers">
    <AirportPicker label={strings.fromLabel} {search} onpick={(hit) => (from = hit)} />
    <AirportPicker label={strings.toLabel} {search} onpick={(hit) => (to = hit)} />
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

  <button type="button" class="go" disabled={!from || !to || loading} onclick={() => void run()}>
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
        <span class="points-badge">{strings.pointsBadge.replace("{points}", result.estimatedPoints.toLocaleString("en-US"))}</span>
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
            <td>{leg.km.toLocaleString("en-US")} km</td>
            <td>{formatDuration(leg.min)}</td>
            <td>{leg.carriers.length > 0 ? leg.carriers.map((c) => c.name).join(", ") : strings.noCarriers}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .route-search {
    display: flex;
    flex-direction: column;
    gap: 1rem;
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
    gap: 1rem;
    border: 1px solid #c8d0d8;
    border-radius: 0.5rem;
    padding: 0.6rem 0.9rem;
    max-width: 28rem;
  }

  legend {
    font-size: 0.85rem;
    font-weight: 600;
    color: #5b6770;
    padding: 0 0.3rem;
  }

  fieldset label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.95rem;
  }

  .go {
    align-self: flex-start;
    padding: 0.55rem 1.4rem;
    font-size: 1rem;
    border: none;
    border-radius: 0.5rem;
    background: #12436d;
    color: #fff;
    cursor: pointer;
  }

  .go:disabled {
    background: #9db2c2;
    cursor: not-allowed;
  }

  .summary {
    color: #5b6770;
    margin: 0;
  }

  .points-badge {
    display: inline-block;
    margin-left: 0.6rem;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: #eef6ee;
    color: #1d6b2f;
    font-weight: 600;
  }

  .error {
    color: #b3261e;
  }

  .empty,
  .loading {
    color: #5b6770;
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    text-align: left;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid #eef1f4;
  }

  th {
    color: #5b6770;
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
  }
</style>
