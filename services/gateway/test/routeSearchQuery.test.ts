import { afterEach, expect, test, vi } from "vitest";
import { buildYoga } from "../src/server.js";
import { fakeDeps } from "./fakeDeps.js";
import { searchRoute } from "../src/features/routes/routesClient.js";

afterEach(() => vi.unstubAllGlobals());

const arlanda = {
  iata: "ARN", icao: "ESSA", name: "Stockholm Arlanda Airport", city: "Stockholm",
  country: "Sweden", countryCode: "SE", continent: "EU",
  latitude: 59.649818, longitude: 17.930364, timezone: "Europe/Stockholm",
};
const sydney = { ...arlanda, iata: "SYD", name: "Sydney Kingsford Smith", city: "Sydney", country: "Australia", countryCode: "AU", continent: "OC" };

const path = {
  legs: [{ from: arlanda, to: sydney, km: 15500, min: 1290, carriers: [{ iata: "QF", name: "Qantas" }] }],
  totalKm: 15500,
  totalMin: 1290,
  hops: 1,
};

test("routeSearch resolves a path and lowercases the optimize enum for the service", async () => {
  let seen: { from?: string; to?: string; optimize?: string } = {};
  const yoga = buildYoga(fakeDeps({
    searchRoute: async (_baseUrl, from, to, optimize) => {
      seen = { from, to, optimize };
      return path;
    },
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: '{ routeSearch(from: "ARN", to: "SYD", optimize: MIN) { hops totalKm totalMin legs { to { iata } carriers { name } } } }',
    }),
  });
  const body = await response.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.routeSearch).toEqual({
    hops: 1,
    totalKm: 15500,
    totalMin: 1290,
    legs: [{ to: { iata: "SYD" }, carriers: [{ name: "Qantas" }] }],
  });
  expect(seen).toEqual({ from: "ARN", to: "SYD", optimize: "min" });
});

test("routeSearch defaults to KM", async () => {
  let seenOptimize: string | undefined;
  const yoga = buildYoga(fakeDeps({
    searchRoute: async (_baseUrl, _from, _to, optimize) => {
      seenOptimize = optimize;
      return path;
    },
  }));
  await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ routeSearch(from: "ARN", to: "SYD") { hops } }' }),
  });
  expect(seenOptimize).toBe("km");
});

test("an unreachable pair resolves to null, not an error", async () => {
  const yoga = buildYoga(fakeDeps());
  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ routeSearch(from: "AAA", to: "ZZZ") { hops } }' }),
  });
  const body = await response.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.routeSearch).toBeNull();
});

test("the client maps 404 to null and other failures to errors", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  expect(await searchRoute("http://routes", "AAA", "ZZZ", "km")).toBeNull();

  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
  await expect(searchRoute("http://routes", "ARN", "SYD", "km")).rejects.toThrow("routes service responded 500");
});
