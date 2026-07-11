// Pure parsing of the Jonty airline-route-data shape into seedable rows — no I/O, no driver.
// The rules live here so they are unit-testable: airports need parseable coordinates, edges
// need a known destination and finite km/min weights, carriers flatten to parallel primitive
// arrays (Neo4j relationship properties cannot hold arrays of maps — ADR-0021).

export type AirportProps = {
  iata: string;
  icao: string | null;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  continent: string | null; // the source lacks one for ~45 airports
  latitude: number;
  longitude: number;
  timezone: string | null;
};

export type RouteEdge = {
  from: string;
  to: string;
  km: number;
  min: number;
  carrierIatas: string[];
  carrierNames: string[];
};

export type ParsedDataset = {
  airports: AirportProps[];
  edges: RouteEdge[];
  skippedAirports: number;
  skippedEdges: number;
};

type RawCarrier = { iata: string | null; name: string | null };
type RawRoute = { carriers: RawCarrier[]; iata: string; km: number | null; min: number | null };
type RawAirport = {
  city_name: string;
  continent: string | null;
  country: string;
  country_code: string;
  iata: string;
  icao: string | null;
  latitude: string;
  longitude: string;
  name: string;
  routes: RawRoute[];
  timezone: string | null;
};

export function parseDataset(json: string): ParsedDataset {
  const raw = JSON.parse(json) as Record<string, RawAirport>;

  const airports: AirportProps[] = [];
  let skippedAirports = 0;
  for (const airport of Object.values(raw)) {
    const latitude = Number.parseFloat(airport.latitude);
    const longitude = Number.parseFloat(airport.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      skippedAirports += 1; // a mappable graph needs coordinates; the source has a handful of stubs
      continue;
    }
    airports.push({
      iata: airport.iata,
      icao: airport.icao ?? null,
      name: airport.name,
      city: airport.city_name,
      country: airport.country,
      countryCode: airport.country_code,
      continent: airport.continent ?? null,
      latitude,
      longitude,
      timezone: airport.timezone ?? null,
    });
  }

  const known = new Set(airports.map((airport) => airport.iata));
  const edges: RouteEdge[] = [];
  let skippedEdges = 0;
  for (const airport of Object.values(raw)) {
    for (const route of airport.routes) {
      if (!known.has(airport.iata) || !known.has(route.iata)) {
        skippedEdges += 1; // dangling endpoint — the destination (or origin) was never a seedable airport
        continue;
      }
      if (typeof route.km !== "number" || typeof route.min !== "number") {
        skippedEdges += 1; // shortest-path weights must exist; an unweighted edge would poison reduce()
        continue;
      }
      edges.push({
        from: airport.iata,
        to: route.iata,
        km: route.km,
        min: route.min,
        carrierIatas: route.carriers.map((carrier) => carrier.iata ?? ""),
        carrierNames: route.carriers.map((carrier) => carrier.name ?? ""),
      });
    }
  }

  return { airports, edges, skippedAirports, skippedEdges };
}

/** Bounded batches for UNWIND writes — the whole dataset never enters one transaction. */
export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}
