import { afterEach, expect, test, vi } from "vitest";
import { fetchAirport, fetchDestinations, searchAirports } from "../src/features/routes/routesClient.js";

afterEach(() => vi.unstubAllGlobals());

const arlanda = {
  iata: "ARN", icao: "ESSA", name: "Stockholm Arlanda Airport", city: "Stockholm",
  country: "Sweden", countryCode: "SE", continent: "EU",
  latitude: 59.649818, longitude: 17.930364, timezone: "Europe/Stockholm",
};

test("airport search encodes the query and forwards headers", async () => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify([arlanda]), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);

  const airports = await searchAirports("http://routes", "new york", 10, "corr-42", "Bearer x", "sv");
  expect(airports[0]?.iata).toBe("ARN");
  expect(fetchMock.mock.calls[0]?.[0]).toBe("http://routes/airports?q=new%20york&limit=10");
  const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
  expect(headers["x-correlation-id"]).toBe("corr-42");
  expect(headers.authorization).toBe("Bearer x");
  expect(headers["accept-language"]).toBe("sv");
});

test("404 from an airport lookup means null, not an error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  expect(await fetchAirport("http://routes", "XXX")).toBeNull();
});

test("5xx from the routes service throws", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
  await expect(fetchDestinations("http://routes", "ARN")).rejects.toThrow("routes service responded 500");
});

test("a drifted destinations shape is rejected, not passed through", async () => {
  // zod is the trust boundary: a 200 whose body is missing required fields must fail loudly here.
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify([{ airport: { iata: "ARN" }, km: 100 }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
  await expect(fetchDestinations("http://routes", "ARN")).rejects.toThrow();
});
