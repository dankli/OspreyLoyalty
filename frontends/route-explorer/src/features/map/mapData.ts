import { graphql } from "../../gql";
import { gatewayClient } from "../../gatewayClient";

const MapAirportsDocument = graphql(`
  query MapAirports {
    mapAirports {
      iata
      latitude
      longitude
      degree
    }
  }
`);

// Full details are fetched per click via the existing airport query — the bulk map
// payload stays lean (iata + coordinates only), metadata arrives on demand.
const MapAirportDetailsDocument = graphql(`
  query MapAirportDetails($iata: ID!) {
    airport(iata: $iata) {
      iata
      name
      city
      country
    }
  }
`);

export type MapAirportRow = { iata: string; latitude: number; longitude: number; degree: number };
export type AirportDetails = { iata: string; name: string; city: string; country: string };

// Two islands can be on screen at once (Map tab + the route-search inline map);
// one gateway round-trip serves both. A failure clears the memo so a retry can succeed.
// Across visits, localStorage carries the ~4k-row payload for a day (the graph only
// changes on a dataset bump) — a GraphQL POST cannot be HTTP-cached, so the cache
// lives here. Bump the key version when the row shape changes.
const MAP_CACHE_KEY = "osprey.route-explorer.map-airports.v1";
const MAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readCachedAirports(): MapAirportRow[] | null {
  try {
    const raw = localStorage.getItem(MAP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; rows?: MapAirportRow[] };
    if (!Array.isArray(parsed.rows) || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > MAP_CACHE_TTL_MS) return null;
    return parsed.rows;
  } catch {
    return null;
  }
}

function writeCachedAirports(rows: MapAirportRow[]): void {
  try {
    localStorage.setItem(MAP_CACHE_KEY, JSON.stringify({ at: Date.now(), rows }));
  } catch {
    // quota or private mode — the cache is an optimization, never a requirement
  }
}

let mapAirportsPromise: Promise<MapAirportRow[]> | null = null;

export function fetchMapAirports(): Promise<MapAirportRow[]> {
  mapAirportsPromise ??= (async () => {
    const cached = readCachedAirports();
    if (cached) return cached;
    try {
      const data = await gatewayClient.request(MapAirportsDocument);
      writeCachedAirports(data.mapAirports);
      return data.mapAirports;
    } catch (error) {
      mapAirportsPromise = null;
      throw error;
    }
  })();
  return mapAirportsPromise;
}

export async function fetchAirportDetails(iata: string): Promise<AirportDetails | null> {
  const data = await gatewayClient.request(MapAirportDetailsDocument, { iata });
  return data.airport ?? null;
}

/** The island's JS boundary (ADR-0022): typed arrays in, airport indices as the shared currency. */
export type RouteMapHandle = {
  draw_base(): void;
  highlight_destinations(from: number, dests: Uint32Array): void;
  show_path(path: Uint32Array): void;
  zoom_in(): void;
  zoom_out(): void;
  reset_view(): void;
  free?(): void;
};

export type IslandModule = {
  RouteMap: new (
    host: HTMLElement,
    lats: Float32Array,
    lons: Float32Array,
    degrees: Uint32Array, // out-degree per airport — the island sizes hub dots by it
    labels: string[], // IATA code per airport — drawn on the canvas at deep zoom
    onPick: (index: number) => void,
    onHover: (index: number) => void, // hovered airport index, or -1 on leave
  ) => RouteMapHandle;
};

/**
 * Load the wasm-pack output. The pkg is a build artifact (gitignored) — when it is
 * absent, this import rejects and MapPanel degrades to a visible hint instead of a
 * broken page, so `npm run dev` and `npm test` never require a Rust toolchain.
 */
export async function loadWasmIsland(): Promise<IslandModule> {
  const mod = await import("../../wasm/pkg/wasm_map.js");
  await mod.default(); // fetch + instantiate the .wasm
  return { RouteMap: mod.RouteMap };
}
