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
  }: {
    search?: (query: string) => Promise<AirportHit[]>;
    destinations?: (iata: string) => Promise<DestinationRow[]>;
  } = $props();

  const PAGE_SIZE = 25; // big airports list hundreds of destinations — page, don't dump

  let selected = $state.raw<AirportHit | null>(null);
  let rows = $state.raw<DestinationRow[]>([]);
  let loading = $state(false);
  let failed = $state(false);
  let visibleCount = $state(PAGE_SIZE);

  let visibleRows = $derived(rows.slice(0, visibleCount));
  let remaining = $derived(rows.length - visibleCount);

  async function pick(hit: AirportHit) {
    selected = hit;
    loading = true;
    failed = false;
    visibleCount = PAGE_SIZE; // a new airport starts back at the first page
    try {
      rows = await destinations(hit.iata);
    } catch {
      failed = true; // the error edge: one flag, one visible message
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
  <AirportPicker label={strings.searchPlaceholder} {search} onpick={(hit) => void pick(hit)} />

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
        {#each visibleRows as row (row.airport.iata)}
          <tr>
            <td><strong>{row.airport.iata}</strong> {row.airport.name}</td>
            <td>{row.airport.country}</td>
            <td>{formatNumber(row.km)} km</td>
            <td>{formatDuration(row.min)}</td>
            <td>{row.carriers.length > 0 ? row.carriers.map((c) => c.name).join(", ") : strings.noCarriers}</td>
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
