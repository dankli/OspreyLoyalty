// Pure record→DTO mapping shared by the airport features — the seam that keeps the
// Neo4j driver out of the unit-testable middle.

export type Carrier = { iata: string; name: string };

export type Airport = {
  iata: string;
  icao: string | null;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  continent: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
};

export type Destination = { airport: Airport; km: number; min: number; carriers: Carrier[] };

export type MapAirport = { iata: string; latitude: number; longitude: number; degree: number };

/** Zip the ROUTE relationship's parallel primitive arrays back into carrier objects (ADR-0021). */
export function zipCarriers(iatas: string[], names: string[]): Carrier[] {
  const length = Math.min(iatas.length, names.length);
  return Array.from({ length }, (_, i) => ({ iata: iatas[i]!, name: names[i]! }));
}
