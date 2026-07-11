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
    type UiOptimize,
  } from "./routeSearchData";
  import { bookTrip as gatewayBookTrip, type TripBooking } from "./bookTrip";
  import { getMemberId } from "../../auth";

  let {
    search = gatewaySearch,
    routeSearch = gatewayRouteSearch,
    book = gatewayBookTrip,
    onresult,
    mapProps = {},
    seed = null,
  }: {
    search?: (query: string) => Promise<AirportHit[]>;
    routeSearch?: (from: string, to: string, optimize: RouteOptimize) => Promise<RoutePathResult | null>;
    /** Books the shown route with points (tests inject a fake). */
    book?: (memberId: string, from: string, to: string, optimize: RouteOptimize, idempotencyKey: string) => Promise<TripBooking>;
    /** Reports the found itinerary's iata sequence upward (the map tab draws it). */
    onresult?: (iatas: string[]) => void;
    /** Overrides forwarded to the inline result map (tests inject a fake island). */
    mapProps?: Partial<ComponentProps<typeof MapPanel>>;
    /** Prefill from a deep link or the explore tab; auto runs the search when both ends are set. */
    seed?: { from: AirportHit | null; to: AirportHit | null; optimize?: UiOptimize; auto?: boolean } | null;
  } = $props();

  const STRATEGIES: RouteOptimize[] = ["KM", "MIN", "HOPS"];
  const OPTIMIZE_OPTIONS: { value: UiOptimize; label: string }[] = [
    { value: "KM", label: strings.optimizeKm },
    { value: "MIN", label: strings.optimizeMin },
    { value: "HOPS", label: strings.optimizeHops },
    { value: "PTS", label: strings.optimizePoints },
  ];

  let from = $state.raw<AirportHit | null>(null);
  let to = $state.raw<AirportHit | null>(null);
  let optimize = $state<UiOptimize>("KM");
  let result = $state.raw<RoutePathResult | null>(null);
  // Every search fetches all three strategies: the requested one answers, the rest
  // become the comparison chips (and "Most points" picks the best earner among them).
  let alternatives = $state.raw<Partial<Record<RouteOptimize, RoutePathResult | null>>>({});
  let shown = $state<RouteOptimize>("KM");
  let noRoute = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  // The booking rail: idle → pending → done | failed. Reset by every new search AND
  // every chip click — a booking belongs to the exact route that was shown.
  let bookingState = $state<"idle" | "pending" | "done" | "failed">("idle");
  let bookingResult = $state.raw<TripBooking | null>(null);
  let bookingError = $state("");

  function pathToIatas(path: RoutePathResult): string[] {
    return [...path.legs.map((leg) => leg.from.iata), path.legs.at(-1)?.to.iata ?? ""].filter(Boolean);
  }

  function writeHash(fromIata: string, toIata: string, opt: UiOptimize) {
    // A shareable deep link for this exact search (replace: no history spam).
    try {
      history.replaceState(null, "", `#route?from=${fromIata}&to=${toIata}&optimize=${opt}`);
    } catch {
      // sandboxed contexts may refuse; the search itself is unaffected
    }
  }

  function display(strategy: RouteOptimize, path: RoutePathResult, updateHash = true) {
    shown = strategy;
    result = path;
    bookingState = "idle";
    bookingResult = null;
    bookingError = "";
    onresult?.(pathToIatas(path));
    // Chip clicks share the displayed strategy; the initial display keeps the
    // searched mode (a PTS deep link should re-run the comparison, not pin a winner).
    if (updateHash && from && to) writeHash(from.iata, to.iata, strategy);
  }

  function bestByPoints(
    byStrategy: Partial<Record<RouteOptimize, RoutePathResult | null>>,
  ): { strategy: RouteOptimize; path: RoutePathResult } | null | undefined {
    const loaded = STRATEGIES.filter((strategy) => byStrategy[strategy] !== undefined);
    if (loaded.length === 0) return undefined; // every strategy errored
    let best: { strategy: RouteOptimize; path: RoutePathResult } | null = null;
    for (const strategy of loaded) {
      const path = byStrategy[strategy];
      if (!path) continue;
      if (!best || (path.estimatedPoints ?? -1) > (best.path.estimatedPoints ?? -1)) {
        best = { strategy, path };
      }
    }
    return best; // null → reachable nowhere
  }

  async function run(fromHit: AirportHit | null, toHit: AirportHit | null, opt: UiOptimize) {
    if (!fromHit || !toHit) return;
    loading = true;
    failed = false;
    noRoute = false;
    result = null;
    alternatives = {};
    writeHash(fromHit.iata, toHit.iata, opt);
    let byStrategy: Partial<Record<RouteOptimize, RoutePathResult | null>> = {};
    try {
      const settled = await Promise.all(
        STRATEGIES.map((strategy) =>
          routeSearch(fromHit.iata, toHit.iata, strategy).then(
            (path) => ({ strategy, path: path as RoutePathResult | null | undefined }),
            () => ({ strategy, path: undefined }),
          ),
        ),
      );
      for (const { strategy, path } of settled) {
        if (path !== undefined) byStrategy[strategy] = path;
      }
    } finally {
      loading = false;
    }
    alternatives = byStrategy;

    let chosen: { strategy: RouteOptimize; path: RoutePathResult } | null;
    if (opt === "PTS") {
      const best = bestByPoints(byStrategy);
      if (best === undefined) {
        failed = true;
        return;
      }
      chosen = best;
    } else {
      const path = byStrategy[opt];
      if (path === undefined) {
        failed = true; // the requested strategy errored
        return;
      }
      chosen = path ? { strategy: opt, path } : null;
    }
    if (!chosen) {
      noRoute = true; // unreachable is a value on the happy rail, not an error
      return;
    }
    display(chosen.strategy, chosen.path, false);
  }

  async function bookShownRoute() {
    if (!from || !to || bookingState === "pending") return;
    bookingState = "pending";
    bookingError = "";
    try {
      // A fresh UUID per click; the gateway/members idempotency key means a retried
      // REQUEST (not a re-click) can never double-spend.
      bookingResult = await book(getMemberId(), from.iata, to.iata, shown, crypto.randomUUID());
      bookingState = "done";
    } catch (error) {
      bookingError = error instanceof Error ? error.message : String(error);
      bookingState = "failed";
    }
  }

  function openTravelAgent() {
    // The member portal routes on real paths, so the URL carries the target page;
    // the shell listens for this event and swaps the mounted remote (no-op standalone).
    try {
      history.replaceState(null, "", "/travel-agent");
    } catch {
      // sandboxed contexts may refuse; the navigation event still fires
    }
    window.dispatchEvent(new CustomEvent("osprey:navigate", { detail: { remote: "memberPortal" } }));
  }

  function strategyLabel(strategy: RouteOptimize): string {
    return strategy === "KM"
      ? strings.optimizeKm
      : strategy === "MIN"
        ? strings.optimizeMin
        : strings.optimizeHops;
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
    {#if Object.values(alternatives).filter(Boolean).length > 1}
      <div class="alternatives">
        {#each STRATEGIES as strategy (strategy)}
          {@const alt = alternatives[strategy]}
          {#if alt}
            <button
              type="button"
              class={{ chip: true, active: shown === strategy }}
              onclick={() => display(strategy, alt)}
            >
              <span class="chip-label">{strategyLabel(strategy)}</span>
              <span class="chip-facts">
                {formatNumber(alt.totalKm)} km · {formatDuration(alt.totalMin)}{alt.estimatedPoints !== null
                  ? ` · ≈ ${formatNumber(alt.estimatedPoints)}`
                  : ""}
              </span>
            </button>
          {/if}
        {/each}
      </div>
    {/if}
    <p class="summary">
      {summary}
      {#if result.estimatedPoints !== null}
        <span class="points-badge" title={strings.baseEarnNote}>{strings.pointsBadge.replace("{points}", formatNumber(result.estimatedPoints))}</span>
      {/if}
      <button type="button" class="agent" onclick={openTravelAgent}>{strings.planWithAgent}</button>
      {#if result.estimatedPoints !== null && bookingState !== "done"}
        <button type="button" class="book" disabled={bookingState === "pending"} onclick={() => void bookShownRoute()}>
          {strings.bookWithPoints}
        </button>
      {/if}
    </p>
    {#if bookingState === "done" && bookingResult}
      <div class="booking-confirmed" role="status">
        <strong>{strings.bookingConfirmed}</strong>
        {#if bookingResult.alreadyApplied}
          <span>{strings.bookingAlready}</span>
        {:else}
          <span>{strings.bookingSpent.replace("{points}", formatNumber(bookingResult.pointsSpent))}</span>
        {/if}
        <span>{strings.bookingBalance.replace("{points}", formatNumber(bookingResult.spendablePoints))}</span>
      </div>
    {:else if bookingState === "failed"}
      <p role="alert" class="error">{strings.bookingFailed.replace("{message}", bookingError)}</p>
    {/if}
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

  .alternatives {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .agent {
    font: inherit;
    font-size: 0.85rem;
    margin-left: 0.6rem;
    padding: 0.2rem 0.75rem;
    border: 1px solid var(--re-line, rgba(227, 174, 54, 0.22));
    border-radius: 999px;
    background: none;
    color: var(--re-muted, #c1a274);
    cursor: pointer;
    transition: border-color 0.15s ease, color 0.15s ease;
  }

  .agent:hover {
    border-color: var(--re-accent, #e3ae36);
    color: var(--re-accent, #e3ae36);
  }

  /* Booking is the money action on this page — same amber pill family as .go, scaled down. */
  .book {
    font: inherit;
    font-size: 0.85rem;
    font-weight: 700;
    margin-left: 0.6rem;
    padding: 0.25rem 0.9rem;
    border: none;
    border-radius: 999px;
    background: linear-gradient(180deg, var(--re-accent, #e3ae36), var(--re-accent-deep, #c8901f));
    color: var(--re-on-accent, #140d06);
    cursor: pointer;
    box-shadow: 0 4px 12px -6px rgba(227, 174, 54, 0.6);
    transition: transform 0.12s ease, filter 0.15s ease;
  }

  .book:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }

  .book:disabled {
    opacity: 0.32;
    cursor: wait;
    box-shadow: none;
  }

  .booking-confirmed {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1rem;
    align-items: baseline;
    margin: 0;
    padding: 0.6rem 0.85rem;
    border-radius: 10px;
    background: rgba(227, 174, 54, 0.12);
    border: 1px solid var(--re-line, rgba(227, 174, 54, 0.22));
    color: var(--re-text, #efe6d3);
    font-variant-numeric: tabular-nums;
  }

  .booking-confirmed strong {
    color: var(--re-accent, #e3ae36);
  }

  .chip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    font: inherit;
    padding: 0.45rem 0.85rem;
    border: 1px solid var(--re-line, rgba(227, 174, 54, 0.22));
    border-radius: 10px;
    background: var(--re-surface-2, #241a10);
    color: var(--re-text, #efe6d3);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .chip:hover {
    border-color: var(--re-accent, #e3ae36);
  }

  .chip.active {
    border-color: var(--re-accent, #e3ae36);
    background: var(--re-raised, #382a17);
  }

  .chip-label {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--re-accent, #e3ae36);
  }

  .chip-facts {
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    color: var(--re-muted, #c1a274);
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
