import { z } from "zod";

const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

// The wire shapes the routes service returns. Parsing (not casting) makes this a trust
// boundary: a drifted or malformed upstream body fails loudly here instead of flowing on.
export const AirportSchema = z.object({
  iata: z.string(),
  icao: z.string().nullable(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  countryCode: z.string(),
  continent: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().nullable(),
});

export const DestinationSchema = z.object({
  airport: AirportSchema,
  km: z.number(),
  min: z.number(),
  carriers: z.array(z.object({ iata: z.string(), name: z.string() })),
});

export const MapAirportSchema = z.object({
  iata: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

export const RoutePathSchema = z.object({
  legs: z.array(
    z.object({
      from: AirportSchema,
      to: AirportSchema,
      km: z.number(),
      min: z.number(),
      carriers: z.array(z.object({ iata: z.string(), name: z.string() })),
    }),
  ),
  totalKm: z.number(),
  totalMin: z.number(),
  hops: z.number(),
  estimatedPoints: z.number().nullable(), // null whenever the points-engine is degraded
});

export type Airport = z.infer<typeof AirportSchema>;
export type Destination = z.infer<typeof DestinationSchema>;
export type MapAirport = z.infer<typeof MapAirportSchema>;
export type RoutePath = z.infer<typeof RoutePathSchema>;
export type RouteOptimize = "km" | "min" | "hops";

function headers(correlationId?: string, authorization?: string, acceptLanguage?: string): Record<string, string> {
  return {
    ...(correlationId ? { "x-correlation-id": correlationId } : {}),
    ...(authorization ? { authorization } : {}),
    ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}),
  };
}

export async function searchAirports(baseUrl: string, query: string, limit: number, correlationId?: string, authorization?: string, acceptLanguage?: string): Promise<Airport[]> {
  const response = await fetch(`${baseUrl}/airports?q=${encodeURIComponent(query)}&limit=${limit}`, {
    headers: headers(correlationId, authorization, acceptLanguage),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`routes service responded ${response.status}`);
  return z.array(AirportSchema).parse(await response.json());
}

export async function fetchAirport(baseUrl: string, iata: string, correlationId?: string, authorization?: string, acceptLanguage?: string): Promise<Airport | null> {
  const response = await fetch(`${baseUrl}/airports/${encodeURIComponent(iata)}`, {
    headers: headers(correlationId, authorization, acceptLanguage),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) return null; // not found is a value on the happy rail, not an error
  if (!response.ok) throw new Error(`routes service responded ${response.status}`);
  return AirportSchema.parse(await response.json());
}

export async function fetchDestinations(baseUrl: string, iata: string, correlationId?: string, authorization?: string, acceptLanguage?: string): Promise<Destination[]> {
  const response = await fetch(`${baseUrl}/airports/${encodeURIComponent(iata)}/destinations`, {
    headers: headers(correlationId, authorization, acceptLanguage),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`routes service responded ${response.status}`);
  return z.array(DestinationSchema).parse(await response.json());
}

export async function searchRoute(baseUrl: string, from: string, to: string, optimize: RouteOptimize, correlationId?: string, authorization?: string, acceptLanguage?: string): Promise<RoutePath | null> {
  const response = await fetch(
    `${baseUrl}/routes/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&optimize=${optimize}`,
    {
      headers: headers(correlationId, authorization, acceptLanguage),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (response.status === 404) return null; // no route within bounds is a value, not an error
  if (!response.ok) throw new Error(`routes service responded ${response.status}`);
  return RoutePathSchema.parse(await response.json());
}

export async function fetchAllAirports(baseUrl: string, correlationId?: string, authorization?: string, acceptLanguage?: string): Promise<MapAirport[]> {
  const response = await fetch(`${baseUrl}/airports/all`, {
    headers: headers(correlationId, authorization, acceptLanguage),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`routes service responded ${response.status}`);
  return z.array(MapAirportSchema).parse(await response.json());
}
