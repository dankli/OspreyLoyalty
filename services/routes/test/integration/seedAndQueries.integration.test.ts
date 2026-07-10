import { Neo4jContainer, type StartedNeo4jContainer } from "@testcontainers/neo4j";
import pino from "pino";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Driver } from "neo4j-driver";
import { createDriver, readQuery } from "../../src/neo4j.js";
import { parseDataset } from "../../src/features/seed/parseDataset.js";
import { seedRoutes } from "../../src/features/seed/seedRoutes.js";
import {
  createAllAirports,
  getAirport,
  getDestinations,
  searchAirports,
} from "../../src/features/airports/queries.js";
import { sampleDataset } from "../fixtures/sampleDataset.js";

// One container, seeded once from the fixture graph (AAA↔BBB, AAA→CCC) — every test
// here exercises the real driver + real Cypher against it.
let container: StartedNeo4jContainer;
let driver: Driver;
const logger = pino({ level: "silent" });

beforeAll(async () => {
  container = await new Neo4jContainer("neo4j:5").start();
  driver = createDriver(container.getBoltUri(), {
    username: container.getUsername(),
    password: container.getPassword(),
  });
  await seedRoutes(driver, parseDataset(sampleDataset), logger);
});

afterAll(async () => {
  await driver?.close();
  await container?.stop();
});

test("seeding twice is a no-op: the marker short-circuits and counts are unchanged", async () => {
  const second = await seedRoutes(driver, parseDataset(sampleDataset), logger);
  expect(second.skipped).toBe(true);

  const airports = await readQuery(driver, `MATCH (a:Airport) RETURN count(a) AS c`, {});
  const edges = await readQuery(driver, `MATCH ()-[r:ROUTE]->() RETURN count(r) AS c`, {});
  expect(airports[0]?.c).toBe(3);
  expect(edges[0]?.c).toBe(3);
});

test("destinations come back ordered by km with carriers zipped into objects", async () => {
  const destinations = await getDestinations(driver, "AAA");
  expect(destinations.map((d) => d.airport.iata)).toEqual(["BBB", "CCC"]);
  expect(destinations[0]).toMatchObject({
    km: 76,
    min: 20,
    carriers: [{ iata: "VT", name: "Air Tahiti" }],
  });
  expect(destinations[1]?.carriers).toEqual([]);
});

test("search orders matches by destination count, then name", async () => {
  // "airport" matches every seeded name; degrees are AAA=2, BBB=1, CCC=0.
  const hits = await searchAirports(driver, "airport", 10);
  expect(hits.map((a) => a.iata)).toEqual(["AAA", "BBB", "CCC"]);
});

test("full-text search finds airports by partial name and survives lucene syntax", async () => {
  const byName = await searchAirports(driver, "bet", 10);
  expect(byName.map((a) => a.iata)).toContain("BBB");

  const byCity = await searchAirports(driver, "gamma tow", 10);
  expect(byCity.map((a) => a.iata)).toContain("CCC");

  // Hostile/odd input must be escaped into a plain search, not a lucene parse error.
  await expect(searchAirports(driver, 'x AND ) OR ("', 10)).resolves.toBeDefined();
});

test("airport lookup returns the full profile or null", async () => {
  const aaa = await getAirport(driver, "AAA");
  expect(aaa).toMatchObject({ iata: "AAA", city: "Anaa", countryCode: "PF" });
  expect(aaa?.latitude).toBeCloseTo(-17.355648);
  expect(await getAirport(driver, "XXX")).toBeNull();
});

test("the map payload holds every seeded airport with coordinates and degree", async () => {
  const all = await createAllAirports(driver)();
  expect(all).toHaveLength(3);
  expect(all.map((a) => a.iata)).toEqual(["AAA", "BBB", "CCC"]);
  expect(all[0]).toEqual({ iata: "AAA", latitude: expect.any(Number), longitude: expect.any(Number), degree: expect.any(Number) });
});
