<script lang="ts">
  import { strings } from "../../strings";
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

  let selected = $state.raw<AirportHit | null>(null);
  let rows = $state.raw<DestinationRow[]>([]);
  let loading = $state(false);
  let failed = $state(false);

  async function pick(hit: AirportHit) {
    selected = hit;
    loading = true;
    failed = false;
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

  .error {
    color: #b3261e;
  }

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
