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

export type MapAirportRow = { iata: string; latitude: number; longitude: number };

export async function fetchMapAirports(): Promise<MapAirportRow[]> {
  const data = await gatewayClient.request(MapAirportsDocument);
  return data.mapAirports;
}

/** The island's JS boundary (ADR-0022): typed arrays in, airport indices as the shared currency. */
export type RouteMapHandle = {
  draw_base(): void;
  highlight_destinations(from: number, dests: Uint32Array): void;
  show_path(path: Uint32Array): void;
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
