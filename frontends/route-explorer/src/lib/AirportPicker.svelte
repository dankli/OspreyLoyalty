<script lang="ts">
  import { strings, formatNumber } from "../strings";
  import { searchAirports as gatewaySearch, type AirportHit } from "../features/explore/exploreData";

  // Reusable debounced typeahead. The search function is a prop with a real default so
  // tests inject fakes; picking an airport is reported upward, selection state lives here.
  let {
    label,
    search = gatewaySearch,
    onpick,
    preset = null,
  }: {
    label: string;
    search?: (query: string) => Promise<AirportHit[]>;
    onpick: (hit: AirportHit) => void;
    /** Externally chosen airport (deep link / explore hand-off) — fills the field. */
    preset?: AirportHit | null;
  } = $props();

  let query = $state("");
  let hits = $state.raw<AirportHit[]>([]);
  let searched = $state(false);
  let failed = $state(false);
  let active = $state(-1); // the keyboard-highlighted hit

  const DEBOUNCE_MS = 200; // one gateway call per pause, not per keystroke
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let generation = 0; // stale responses lose the race and are dropped

  function displayLabel(hit: AirportHit): string {
    return hit.name && hit.name !== hit.iata ? `${hit.name} (${hit.iata})` : hit.iata;
  }

  $effect(() => {
    if (preset) {
      query = displayLabel(preset);
      hits = [];
      searched = false;
      active = -1;
    }
  });

  function onInput() {
    clearTimeout(debounce);
    const q = query.trim();
    if (q.length < 2) {
      hits = [];
      searched = false;
      active = -1;
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
      active = -1;
    } catch {
      if (mine === generation) failed = true;
    }
  }

  function pick(hit: AirportHit) {
    generation += 1; // cancel any in-flight search so its results don't reopen the list
    hits = [];
    searched = false;
    active = -1;
    query = displayLabel(hit);
    onpick(hit);
  }

  function onKeydown(event: KeyboardEvent) {
    if (hits.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      active = (active + 1) % hits.length;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      active = active <= 0 ? hits.length - 1 : active - 1;
    } else if (event.key === "Enter") {
      const hit = hits[active];
      if (hit) {
        event.preventDefault();
        pick(hit);
      }
    } else if (event.key === "Escape") {
      hits = [];
      searched = false;
      active = -1;
    }
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
      onkeydown={onKeydown}
      aria-expanded={hits.length > 0}
    />
  </label>

  {#if hits.length > 0}
    <ul class="hits">
      {#each hits as hit, index (hit.iata)}
        <li>
          <button type="button" class={{ active: index === active }} onclick={() => pick(hit)}>
            <strong>{hit.iata}</strong>
            {hit.name} — {hit.city}, {hit.country}
            {#if hit.degree != null}
              <span class="degree">{strings.tooltipDestinations.replace("{count}", formatNumber(hit.degree))}</span>
            {/if}
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
    gap: 0.35rem;
  }

  /* Field-guide micro-label: small caps in tan, generously tracked. */
  label span {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--re-muted, #c1a274);
  }

  input[type="search"] {
    width: 100%;
    padding: 0.6rem 0.8rem;
    font: inherit;
    font-size: 1rem;
    border: 1px solid var(--re-line, rgba(227, 174, 54, 0.22));
    border-radius: 9px;
    background: var(--re-surface-2, #241a10);
    color: var(--re-heading, #f7f1e4);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  input[type="search"]::placeholder {
    color: var(--re-muted, #c1a274);
    opacity: 0.6;
  }

  input[type="search"]:focus-visible {
    outline: none;
    border-color: var(--re-accent, #e3ae36);
    box-shadow: var(--re-focus-ring, 0 0 0 3px rgba(227, 174, 54, 0.22));
  }

  .hits {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--re-line, rgba(227, 174, 54, 0.22));
    border-radius: 10px;
    overflow: hidden;
    background: var(--re-surface-2, #241a10);
    box-shadow: var(--re-shadow, 0 18px 40px -24px rgba(0, 0, 0, 0.85));
  }

  .hits button {
    display: block;
    width: 100%;
    padding: 0.55rem 0.85rem;
    text-align: left;
    font: inherit;
    font-size: 0.95rem;
    background: none;
    border: none;
    border-bottom: 1px solid var(--re-line-soft, rgba(255, 247, 232, 0.06));
    color: var(--re-text, #efe6d3);
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .hits li:last-child button {
    border-bottom: none;
  }

  .hits button:hover,
  .hits button.active {
    background: var(--re-raised, #382a17);
  }

  .hits button strong {
    color: var(--re-accent, #e3ae36);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    margin-right: 0.15rem;
  }

  .degree {
    float: right;
    margin-left: 0.6rem;
    padding: 0.05rem 0.5rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    background: var(--re-raised, #382a17);
    color: var(--re-muted, #c1a274);
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
    margin: 0;
  }
</style>
