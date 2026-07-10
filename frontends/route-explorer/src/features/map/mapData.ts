import { graphql } from "../../gql";
import { gatewayClient } from "../../gatewayClient";

const MapAirportsDocument = graphql(`
  query MapAirports {
    mapAirports {
      iata
      latitude
      longitude
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

export type MapAirportRow = { iata: string; latitude: number; longitude: number };
export type AirportDetails = { iata: string; name: string; city: string; country: string };

// Two islands can be on screen at once (Map tab + the route-search inline map);
// one gateway round-trip serves both. A failure clears the memo so a retry can succeed.
let mapAirportsPromise: Promise<MapAirportRow[]> | null = null;

export function fetchMapAirports(): Promise<MapAirportRow[]> {
  mapAirportsPromise ??= gatewayClient.request(MapAirportsDocument).then(
    (data) => data.mapAirports,
    (error: unknown) => {
      mapAirportsPromise = null;
      throw error;
    },
  );
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
    onPick: (index: number) => void,
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
