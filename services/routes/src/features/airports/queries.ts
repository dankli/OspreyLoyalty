import type { Driver } from "neo4j-driver";
import neo4j from "neo4j-driver";
import { readQuery } from "../../neo4j.js";
import { luceneQuery } from "./luceneQuery.js";
import { zipCarriers, type Airport, type Destination, type MapAirport } from "./mapRecords.js";

const AIRPORT_PROJECTION = `{ .iata, .icao, .name, .city, .country, .countryCode, .continent, .latitude, .longitude, .timezone }`;

export const SEARCH_LIMIT_MAX = 25; // typeahead never needs more; clamps caller input

export async function searchAirports(driver: Driver, q: string, limit: number): Promise<Airport[]> {
  const query = luceneQuery(q);
  if (query === "") return [];
  // Relevance gates the candidates (top 50 by lucene score, bounded); hubs order
  // them — a typeahead for flight search should surface Heathrow before a field
  // strip that happens to score similarly. Name breaks degree ties.
  const rows = await readQuery(
    driver,
    `CALL db.index.fulltext.queryNodes('airport_search', $query) YIELD node, score
     WITH node, score
     ORDER BY score DESC
     LIMIT 50
     WITH node, COUNT { (node)-[:ROUTE]->() } AS degree
     RETURN node ${AIRPORT_PROJECTION} AS airport
     ORDER BY degree DESC, node.name ASC
     LIMIT $limit`,
    { query, limit: neo4j.int(Math.min(limit, SEARCH_LIMIT_MAX)) },
  );
  return rows.map((row) => row.airport as Airport);
}

export async function getAirport(driver: Driver, iata: string): Promise<Airport | null> {
  const rows = await readQuery(
    driver,
    `MATCH (a:Airport {iata: $iata}) RETURN a ${AIRPORT_PROJECTION} AS airport`,
    { iata },
  );
  return (rows[0]?.airport as Airport) ?? null;
}

export async function getDestinations(driver: Driver, iata: string): Promise<Destination[]> {
  const rows = await readQuery(
    driver,
    // LIMIT 300: the busiest hub in the dataset has an out-degree around 250, so 300
    // returns every real destination while bounding a corrupt or future-grown node.
    `MATCH (a:Airport {iata: $iata})-[r:ROUTE]->(b:Airport)
     RETURN b ${AIRPORT_PROJECTION} AS airport,
            r.km AS km, r.min AS min,
            r.carrierIatas AS carrierIatas, r.carrierNames AS carrierNames
     ORDER BY r.km
     LIMIT 300`,
    { iata },
  );
  return rows.map((row) => ({
    airport: row.airport as Airport,
    km: row.km as number,
    min: row.min as number,
    carriers: zipCarriers(row.carrierIatas as string[], row.carrierNames as string[]),
  }));
}

/**
 * The one-shot map payload: every airport's position plus its out-degree (the map
 * sizes hub dots by it). The graph is static after seeding, so the first read is
 * cached for the process lifetime.
 */
export function createAllAirports(driver: Driver): () => Promise<MapAirport[]> {
  let cached: MapAirport[] | undefined;
  return async () => {
    if (cached) return cached;
    const rows = await readQuery(
      driver,
      // LIMIT 5000: the dataset holds ~3.9k airports; the bound caps a future-grown graph.
      `MATCH (a:Airport)
       RETURN a.iata AS iata, a.latitude AS latitude, a.longitude AS longitude,
              COUNT { (a)-[:ROUTE]->() } AS degree
       ORDER BY a.iata
       LIMIT 5000`,
      {},
    );
    cached = rows.map((row) => ({
      iata: row.iata as string,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      degree: row.degree as number,
    }));
    return cached;
  };
}
