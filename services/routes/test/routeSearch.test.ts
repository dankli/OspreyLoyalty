import { expect, test } from "vitest";
import {
  DIJKSTRA_QUERY,
  HOP_SHORTEST_QUERY,
  MAX_HOPS,
  assemblePath,
} from "../src/features/route-search/cypher.js";

const arlanda = {
  iata: "ARN", icao: "ESSA", name: "Stockholm Arlanda", city: "Stockholm",
  country: "Sweden", countryCode: "SE", continent: "EU",
  latitude: 59.65, longitude: 17.93, timezone: "Europe/Stockholm",
};
const kastrup = { ...arlanda, iata: "CPH", name: "Copenhagen Kastrup", city: "Copenhagen", country: "Denmark", countryCode: "DK" };
const heathrow = { ...arlanda, iata: "LHR", name: "Heathrow", city: "London", country: "United Kingdom", countryCode: "GB" };

test("a transaction-timeout error is recognized by its Neo4j code", async () => {
  const { isTransactionTimeout } = await import("../src/neo4j.js");
  expect(isTransactionTimeout({ code: "Neo.ClientError.Transaction.TransactionTimedOutClientConfiguration" })).toBe(true);
  expect(isTransactionTimeout({ code: "Neo.ClientError.Transaction.TransactionTimedOut" })).toBe(true);
  expect(isTransactionTimeout({ code: "Neo.ClientError.Statement.SyntaxError" })).toBe(false);
  expect(isTransactionTimeout(new Error("plain"))).toBe(false);
  expect(isTransactionTimeout(undefined)).toBe(false);
});

test("the hop query is bounded to the maximum sane itinerary length", () => {
  expect(MAX_HOPS).toBe(6);
  expect(HOP_SHORTEST_QUERY).toContain(`*..${MAX_HOPS}`);
});

test("weighted search delegates to dijkstra over directed ROUTE edges with a parameterized weight", () => {
  expect(DIJKSTRA_QUERY).toContain("apoc.algo.dijkstra");
  expect(DIJKSTRA_QUERY).toContain("'ROUTE>'");
  expect(DIJKSTRA_QUERY).toContain("$weight");
  expect(DIJKSTRA_QUERY).toContain("LIMIT 1");
});

test("assemblePath zips airports and relationship rows into legs with totals", () => {
  const path = assemblePath(
    [arlanda, kastrup, heathrow],
    [
      { km: 522, min: 75, carrierIatas: ["SK"], carrierNames: ["SAS"] },
      { km: 956, min: 115, carrierIatas: ["BA", "SK"], carrierNames: ["British Airways", "SAS"] },
    ],
  );
  expect(path.hops).toBe(2);
  expect(path.totalKm).toBe(1478);
  expect(path.totalMin).toBe(190);
  expect(path.legs[0]).toEqual({
    from: arlanda,
    to: kastrup,
    km: 522,
    min: 75,
    carriers: [{ iata: "SK", name: "SAS" }],
  });
  expect(path.legs[1]?.carriers).toHaveLength(2);
});

test("assemblePath on a direct connection is a single leg", () => {
  const path = assemblePath([arlanda, kastrup], [{ km: 522, min: 75, carrierIatas: [], carrierNames: [] }]);
  expect(path.hops).toBe(1);
  expect(path.legs).toHaveLength(1);
  expect(path.legs[0]?.carriers).toEqual([]);
});
