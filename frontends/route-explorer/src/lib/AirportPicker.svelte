<script lang="ts">
  import { strings } from "../strings";
  import { searchAirports as gatewaySearch, type AirportHit } from "../features/explore/exploreData";

  // Reusable debounced typeahead. The search function is a prop with a real default so
  // tests inject fakes; picking an airport is reported upward, selection state lives here.
  let {
    label,
    search = gatewaySearch,
    onpick,
  }: {
    label: string;
    search?: (query: string) => Promise<AirportHit[]>;
    onpick: (hit: AirportHit) => void;
  } = $props();

  let query = $state("");
  let hits = $state.raw<AirportHit[]>([]);
  let searched = $state(false);
  let failed = $state(false);

  const DEBOUNCE_MS = 200; // one gateway call per pause, not per keystroke
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let generation = 0; // stale responses lose the race and are dropped

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
      if (mine === generation) failed = true;
    }
  }

  function pick(hit: AirportHit) {
    generation += 1; // cancel any in-flight search so its results don't reopen the list
    hits = [];
    searched = false;
    query = `${hit.name} (${hit.iata})`;
    onpick(hit);
  }
</script>

<div class="picker">
  <label>
    <span>{label}</span>
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
          <button type="button" onclick={() => pick(hit)}>
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
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-width: 28rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  label span {
    font-size: 0.85rem;
    font-weight: 600;
    color: #5b6770;
  }

  input[type="search"] {
    width: 100%;
    padding: 0.6rem 0.8rem;
    font-size: 1rem;
    border: 1px solid #c8d0d8;
    border-radius: 0.5rem;
  }

  .hits {
    list-style: none;
    margin: 0;
    padding: 0;
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
    margin: 0;
  }

  .empty {
    color: #5b6770;
    margin: 0;
  }
</style>
