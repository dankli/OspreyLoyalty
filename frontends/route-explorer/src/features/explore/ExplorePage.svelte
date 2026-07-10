<script lang="ts">
  import { strings } from "../../strings";
  import {
    searchAirports as gatewaySearch,
    fetchDestinations as gatewayDestinations,
    type AirportHit,
    type DestinationRow,
  } from "./exploreData";

  // The data functions are props with real defaults, so tests inject fakes and the
  // component itself stays free of transport concerns (the A-Frame edge).
  let {
    search = gatewaySearch,
    destinations = gatewayDestinations,
  }: {
    search?: (query: string) => Promise<AirportHit[]>;
    destinations?: (iata: string) => Promise<DestinationRow[]>;
  } = $props();

  let query = $state("");
  let hits = $state.raw<AirportHit[]>([]);
  let selected = $state.raw<AirportHit | null>(null);
  let rows = $state.raw<DestinationRow[]>([]);
  let loading = $state(false);
  let failed = $state(false);
  let searched = $state(false);

  const DEBOUNCE_MS = 200; // one gateway call per pause, not per keystroke
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let generation = 0; // a later search or pick wins the race; stale responses are dropped

  function onInput() {
    clearTimeout(debounce);
    const q = query.trim();
    if (q.length < 2) {
      hits = [];
      searched = false;
      return;
    }
    debounce = setTimeout(() => void runSearch(q), DEBOUNCE_MS);
  }

  async function runSearch(q: string) {
    const mine = ++generation;
    failed = false;
    try {
      const result = await search(q);
      if (mine !== generation) return;
      hits = result;
      searched = true;
    } catch {
      if (mine === generation) failed = true; // the error edge: one flag, one visible message
    }
  }

  async function pick(hit: AirportHit) {
    generation += 1; // cancel any in-flight search so its results don't reopen the list
    selected = hit;
    hits = [];
    searched = false;
    query = `${hit.name} (${hit.iata})`;
    loading = true;
    failed = false;
    try {
      rows = await destinations(hit.iata);
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
</script>

<section class="explore">
  <label>
    <span class="visually-hidden">{strings.searchPlaceholder}</span>
    <input
      type="search"
      placeholder={strings.searchPlaceholder}
      bind:value={query}
      oninput={onInput}
    />
  </label>

  {#if hits.length > 0}
    <ul class="hits">
      {#each hits as hit (hit.iata)}
        <li>
          <button type="button" onclick={() => void pick(hit)}>
            <strong>{hit.iata}</strong>
            {hit.name} — {hit.city}, {hit.country}
          </button>
        </li>
      {/each}
    </ul>
  {:else if searched}
    <p class="empty">{strings.searchEmpty}</p>
  {/if}

  {#if failed}
    <p role="alert" class="error">{strings.loadFailed}</p>
  {/if}

  {#if loading}
    <p class="loading">{strings.loading}</p>
  {:else if selected && !failed}
    <h2>{strings.destinationsHeading} {selected.name} ({selected.iata})</h2>
    <table>
      <thead>
        <tr>
          <th>{strings.colDestination}</th>
          <th>{strings.colCountry}</th>
          <th>{strings.colDistance}</th>
          <th>{strings.colDuration}</th>
          <th>{strings.colCarriers}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.airport.iata)}
          <tr>
            <td><strong>{row.airport.iata}</strong> {row.airport.name}</td>
            <td>{row.airport.country}</td>
            <td>{row.km.toLocaleString()} km</td>
            <td>{formatDuration(row.min)}</td>
            <td>{row.carriers.length > 0 ? row.carriers.map((c) => c.name).join(", ") : strings.noCarriers}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .explore {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  input[type="search"] {
    width: 100%;
    max-width: 28rem;
    padding: 0.6rem 0.8rem;
    font-size: 1rem;
    border: 1px solid #c8d0d8;
    border-radius: 0.5rem;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .hits {
    list-style: none;
    margin: 0;
    padding: 0;
    max-width: 28rem;
    border: 1px solid #c8d0d8;
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .hits button {
    display: block;
    width: 100%;
    padding: 0.5rem 0.8rem;
    text-align: left;
    background: none;
    border: none;
    border-bottom: 1px solid #eef1f4;
    cursor: pointer;
    font-size: 0.95rem;
  }

  .hits button:hover {
    background: #f2f6fa;
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
