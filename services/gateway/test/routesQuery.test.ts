import { expect, test } from "vitest";
import { buildYoga } from "../src/server.js";
import { fakeDeps } from "./fakeDeps.js";

const arlanda = {
  iata: "ARN", icao: "ESSA", name: "Stockholm Arlanda Airport", city: "Stockholm",
  country: "Sweden", countryCode: "SE", continent: "EU",
  latitude: 59.649818, longitude: 17.930364, timezone: "Europe/Stockholm",
};

test("airports query resolves through the routes client with the default limit", async () => {
  let seenLimit: number | undefined;
  const yoga = buildYoga(fakeDeps({
    searchAirports: async (_baseUrl, _query, limit) => {
      seenLimit = limit;
      return [arlanda];
    },
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ airports(query: "arlanda") { iata name city } }' }),
  });
  const body = await response.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.airports).toEqual([{ iata: "ARN", name: "Stockholm Arlanda Airport", city: "Stockholm" }]);
  expect(seenLimit).toBe(10);
});

test("unknown airport resolves to null", async () => {
  const yoga = buildYoga(fakeDeps());
  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ airport(iata: "XXX") { iata } }' }),
  });
  expect((await response.json()).data.airport).toBeNull();
});

test("airportDestinations resolves destinations with carriers", async () => {
  const yoga = buildYoga(fakeDeps({
    fetchDestinations: async () => [
      { airport: arlanda, km: 400, min: 60, carriers: [{ iata: "SK", name: "SAS" }] },
    ],
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: '{ airportDestinations(iata: "OSL") { airport { iata } km min carriers { iata name } } }',
    }),
  });
  const body = await response.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.airportDestinations).toEqual([
    { airport: { iata: "ARN" }, km: 400, min: 60, carriers: [{ iata: "SK", name: "SAS" }] },
  ]);
});

test("mapAirports returns the bounded one-shot payload", async () => {
  const yoga = buildYoga(fakeDeps({
    fetchAllAirports: async () => [{ iata: "ARN", latitude: 59.65, longitude: 17.93 }],
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ mapAirports { iata latitude longitude } }" }),
  });
  const body = await response.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.mapAirports).toEqual([{ iata: "ARN", latitude: 59.65, longitude: 17.93 }]);
});

test("a routes outage surfaces as a GraphQL error, not a crash", async () => {
  const yoga = buildYoga(fakeDeps({
    searchAirports: async () => { throw new Error("routes service responded 500"); },
  }));
  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ airports(query: "arn") { iata } }' }),
  });
  expect((await response.json()).errors).toBeDefined();
});
