// Pure query builders and path assembly for route search — no driver, unit-testable.
// Weighted search uses APOC's dijkstra (ADR-0021): the original L..L+1 enumeration
// heuristic blew past the 2 s bound on real data (a thin pair like AAA→AAD sits 4–5
// hops apart, and enumerating every 4..5-hop path through the hub belt explodes), so
// the ADR's documented escape hatch was taken. Hop-shortest keeps the built-in
// shortestPath — it needs no plugin and carries the 6-hop product bound.

import { zipCarriers, type Airport, type Carrier } from "../airports/mapRecords.js";

export const MAX_HOPS = 6; // no sane itinerary exceeds it; caps hop-shortest traversal

const AIRPORT_PROJECTION = `{ .iata, .icao, .name, .city, .country, .countryCode, .continent, .latitude, .longitude, .timezone }`;
const LEG_PROJECTION = `{ .km, .min, .carrierIatas, .carrierNames }`;

export const HOP_SHORTEST_QUERY = `
MATCH (a:Airport {iata: $from}), (b:Airport {iata: $to})
MATCH p = shortestPath((a)-[:ROUTE*..${MAX_HOPS}]->(b))
RETURN [n IN nodes(p) | n ${AIRPORT_PROJECTION}] AS airports,
       [r IN relationships(p) | r ${LEG_PROJECTION}] AS legs`;

export type Weight = "km" | "min";

// $weight is the relationship property dijkstra minimizes ("km" or "min"); 'ROUTE>'
// restricts traversal to outgoing ROUTE edges, matching the directed dataset.
export const DIJKSTRA_QUERY = `
MATCH (a:Airport {iata: $from}), (b:Airport {iata: $to})
CALL apoc.algo.dijkstra(a, b, 'ROUTE>', $weight) YIELD path
RETURN [n IN nodes(path) | n ${AIRPORT_PROJECTION}] AS airports,
       [r IN relationships(path) | r ${LEG_PROJECTION}] AS legs
LIMIT 1`;

export type LegProps = { km: number; min: number; carrierIatas: string[]; carrierNames: string[] };

export type RouteLeg = { from: Airport; to: Airport; km: number; min: number; carriers: Carrier[] };

export type RoutePath = { legs: RouteLeg[]; totalKm: number; totalMin: number; hops: number };

export function assemblePath(airports: Airport[], legProps: LegProps[]): RoutePath {
  const legs = legProps.map((leg, i) => ({
    from: airports[i]!,
    to: airports[i + 1]!,
    km: leg.km,
    min: leg.min,
    carriers: zipCarriers(leg.carrierIatas, leg.carrierNames),
  }));
  return {
    legs,
    totalKm: legs.reduce((sum, leg) => sum + leg.km, 0),
    totalMin: legs.reduce((sum, leg) => sum + leg.min, 0),
    hops: legs.length,
  };
}
