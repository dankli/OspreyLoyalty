import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { chunk, parseDataset } from "../src/features/seed/parseDataset.js";
import { sampleDataset } from "./fixtures/sampleDataset.js";

test("parses airports with coordinates as floats and null icao preserved", () => {
  const { airports } = parseDataset(sampleDataset);
  const aaa = airports.find((a) => a.iata === "AAA");
  expect(aaa).toMatchObject({
    iata: "AAA",
    icao: "NTGA",
    name: "Anaa Airport",
    city: "Anaa",
    country: "French Polynesia",
    countryCode: "PF",
    continent: "OC",
    timezone: "Pacific/Tahiti",
  });
  expect(aaa?.latitude).toBeCloseTo(-17.355648);
  expect(aaa?.longitude).toBeCloseTo(-145.50913);
  expect(airports.find((a) => a.iata === "BBB")?.icao).toBeNull();
});

test("skips airports with unparseable coordinates and counts them", () => {
  const { airports, skippedAirports } = parseDataset(sampleDataset);
  expect(airports.map((a) => a.iata).sort()).toEqual(["AAA", "BBB", "CCC"]);
  expect(skippedAirports).toBe(1); // DDD has latitude "not-a-number"
});

test("keeps edges between known airports, with carriers as parallel arrays", () => {
  const { edges } = parseDataset(sampleDataset);
  const aaaToBbb = edges.find((e) => e.from === "AAA" && e.to === "BBB");
  expect(aaaToBbb).toEqual({
    from: "AAA",
    to: "BBB",
    km: 76,
    min: 20,
    carrierIatas: ["VT"],
    carrierNames: ["Air Tahiti"],
  });
});

test("an edge with no carriers becomes empty arrays, not a skip", () => {
  const { edges } = parseDataset(sampleDataset);
  const aaaToCcc = edges.find((e) => e.from === "AAA" && e.to === "CCC");
  expect(aaaToCcc?.carrierIatas).toEqual([]);
  expect(aaaToCcc?.carrierNames).toEqual([]);
});

test("skips dangling destinations, edges without km, and edges from skipped airports", () => {
  const { edges, skippedEdges } = parseDataset(sampleDataset);
  // AAA→ZZZ dangles, AAA→BBB(km:null) lacks a weight, DDD→AAA departs a skipped airport.
  expect(skippedEdges).toBe(3);
  expect(edges).toHaveLength(3); // AAA→BBB, AAA→CCC, BBB→AAA
});

test("chunk splits into bounded batches with the remainder last", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  expect(chunk([], 2)).toEqual([]);
});

test("the committed dataset parses to the documented counts", () => {
  // Guards the data/README.md numbers against a silently swapped snapshot.
  const gz = readFileSync(fileURLToPath(new URL("../data/airline_routes.json.gz", import.meta.url)));
  const { airports, edges, skippedAirports, skippedEdges } = parseDataset(gunzipSync(gz).toString("utf8"));
  expect(airports.length + skippedAirports).toBe(3908);
  expect(edges.length + skippedEdges).toBe(58669);
  expect(edges.filter((e) => e.carrierIatas.length === 0).length).toBeLessThanOrEqual(524);
});
