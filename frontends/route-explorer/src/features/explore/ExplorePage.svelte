<script lang="ts">
  import { strings, formatNumber } from "../../strings";
  import AirportPicker from "../../lib/AirportPicker.svelte";
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
    onroute,
  }: {
    search?: (query: string) => Promise<AirportHit[]>;
    destinations?: (iata: string) => Promise<DestinationRow[]>;
    /** Hands a from→to pair to the route search tab. */
    onroute?: (seed: { from: AirportHit; to: AirportHit }) => void;
  } = $props();

  const PAGE_SIZE = 25; // big airports list hundreds of destinations — page, don't dump

  type SortKey = "name" | "country" | "km" | "min";

  let selected = $state.raw<AirportHit | null>(null);
  let rows = $state.raw<DestinationRow[]>([]);
  let loading = $state(false);
  let failed = $state(false);
  let visibleCount = $state(PAGE_SIZE);
  let countryFilter = $state("");
  let sortKey = $state<SortKey>("km");
  let sortAsc = $state(true);

  let countries = $derived([...new Set(rows.map((row) => row.airport.country))].sort());

  let filteredRows = $derived.by(() => {
    const filtered = countryFilter
      ? rows.filter((row) => row.airport.country === countryFilter)
      : rows;
    const value = (row: DestinationRow) =>
      sortKey === "km" ? row.km : sortKey === "min" ? row.min : sortKey === "name" ? row.airport.name : row.airport.country;
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === "number" ? va - (vb as number) : String(va).localeCompare(String(vb));
      return sortAsc ? cmp : -cmp;
    });
  });
  let visibleRows = $derived(filteredRows.slice(0, visibleCount));
  let remaining = $derived(filteredRows.length - visibleCount);

  async function pick(hit: AirportHit) {
    selected = hit;
    loading = true;
    failed = false;
    visibleCount = PAGE_SIZE; // a new airport starts back at the first page
    countryFilter = "";
    try {
      rows = await destinations(hit.iata);
    } catch {
      failed = true; // the error edge: one flag, one visible message
    } finally {
      loading = false;
    }
  }

  function sortBy(key: SortKey) {
    if (sortKey === key) {
      sortAsc = !sortAsc;
    } else {
      sortKey = key;
      sortAsc = true;
    }
    visibleCount = PAGE_SIZE;
  }

  function indicator(key: SortKey): string {
    return sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";
  }

  function formatDuration(min: number): string {
    const hours = Math.floor(min / 60);
    const minutes = min % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
</script>

<section class="explore">
  <AirportPicker label={strings.searchPlaceholder} {search} onpick={(hit) => void pick(hit)} />

  {#if failed}
    <p role="alert" class="error">{strings.loadFailed}</p>
  {/if}

  {#if loading}
    <p class="loading">{strings.loading}</p>
  {:else if selected && !failed}
    <h2>{strings.destinationsHeading} {selected.name} ({selected.iata})</h2>
    {#if countries.length > 1}
      <label class="filter">
        <span>{strings.colCountry}</span>
        <select
          bind:value={countryFilter}
          onchange={() => (visibleCount = PAGE_SIZE)}
        >
          <option value="">{strings.allCountries}</option>
          {#each countries as country (country)}
            <option value={country}>{country}</option>
          {/each}
        </select>
      </label>
    {/if}
    <table>
      <thead>
        <tr>
          <th><button type="button" class="sort" onclick={() => sortBy("name")} title={strings.sortBy.replace("{column}", strings.colDestination)}>{strings.colDestination}{indicator("name")}</button></th>
          <th><button type="button" class="sort" onclick={() => sortBy("country")} title={strings.sortBy.replace("{column}", strings.colCountry)}>{strings.colCountry}{indicator("country")}</button></th>
          <th><button type="button" class="sort" onclick={() => sortBy("km")} title={strings.sortBy.replace("{column}", strings.colDistance)}>{strings.colDistance}{indicator("km")}</button></th>
          <th><button type="button" class="sort" onclick={() => sortBy("min")} title={strings.sortBy.replace("{column}", strings.colDuration)}>{strings.colDuration}{indicator("min")}</button></th>
          <th>{strings.colCarriers}</th>
          {#if onroute}<th></th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each visibleRows as row (row.airport.iata)}
          <tr>
            <td><strong>{row.airport.iata}</strong> {row.airport.name}</td>
            <td>{row.airport.country}</td>
            <td>{formatNumber(row.km)} km</td>
            <td>{formatDuration(row.min)}</td>
            <td>{row.carriers.length > 0 ? row.carriers.map((c) => c.name).join(", ") : strings.noCarriers}</td>
            {#if onroute}
              <td class="row-action">
                <button
                  type="button"
                  class="route"
                  title={strings.searchThisRoute}
                  aria-label={strings.searchThisRoute}
                  onclick={() => selected && onroute?.({ from: selected, to: row.airport })}
                >→</button>
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if remaining > 0}
      <button type="button" class="more" onclick={() => (visibleCount += PAGE_SIZE)}>
        {strings.showMore.replace("{count}", String(Math.min(PAGE_SIZE, remaining)))}
      </button>
    {/if}
  {/if}
</section>

<style>
  .explore {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  h2 {
    font-family: var(--re-font-display, "Fraunces", Georgia, serif);
    font-weight: 540;
    font-size: 1.25rem;
    letter-spacing: 0.005em;
    color: var(--re-heading, #f7f1e4);
    margin: 0.5rem 0 0;
  }

  .error {
    margin: 0;
    padding: 0.6rem 0.85rem;
    border-radius: 10px;
    background: rgba(208, 106, 57, 0.14);
    border: 1px solid rgba(208, 106, 57, 0.4);
    color: var(--re-error, #d06a39);
  }

  .loading {
    color: var(--re-muted, #c1a274);
  }

  .filter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    align-self: flex-start;
  }

  .filter span {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--re-muted, #c1a274);
  }

  .filter select {
    font: inherit;
    font-size: 0.9rem;
    background: var(--re-surface-2, #241a10);
    color: var(--re-text, #efe6d3);
    border: 1px solid var(--re-line, rgba(227, 174, 54, 0.22));
    border-radius: 8px;
    padding: 0.3rem 0.5rem;
  }

  .filter select:focus-visible {
    outline: none;
    border-color: var(--re-accent, #e3ae36);
    box-shadow: var(--re-focus-ring, 0 0 0 3px rgba(227, 174, 54, 0.22));
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

  th .sort {
    font: inherit;
    color: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  th .sort:hover {
    color: var(--re-accent, #e3ae36);
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

  .row-action {
    text-align: right;
  }

  .route {
    font: inherit;
    width: 1.7rem;
    height: 1.7rem;
    line-height: 1;
    border: 1px solid var(--re-line, rgba(227, 174, 54, 0.22));
    border-radius: 999px;
    background: none;
    color: var(--re-muted, #c1a274);
    cursor: pointer;
    transition: border-color 0.15s ease, color 0.15s ease;
  }

  .route:hover {
    border-color: var(--re-accent, #e3ae36);
    color: var(--re-accent, #e3ae36);
  }

  .more {
    align-self: flex-start;
    font: inherit;
    padding: 0.4rem 1rem;
    border: 1px solid var(--re-line, rgba(227, 174, 54, 0.22));
    border-radius: 9px;
    background: var(--re-surface-2, #241a10);
    color: var(--re-text, #efe6d3);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .more:hover {
    border-color: var(--re-accent, #e3ae36);
    background: var(--re-raised, #382a17);
  }
</style>
