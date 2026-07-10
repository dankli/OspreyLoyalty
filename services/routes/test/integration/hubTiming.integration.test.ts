import { Neo4jContainer, type StartedNeo4jContainer } from "@testcontainers/neo4j";
import pino from "pino";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Driver } from "neo4j-driver";
import { createDriver } from "../../src/neo4j.js";
import { loadDataset, seedRoutes } from "../../src/features/seed/seedRoutes.js";
import { warmRouteGraph } from "../../src/features/route-search/warmup.js";
import { searchRoute } from "../../src/features/route-search/searchRoute.js";

// The tripwire for ADR-0021's weighted-path heuristic: a hub-to-hub search over the FULL
// dataset must finish inside the 2 s transaction bound. If this starts failing, the
// documented escape hatch is APOC dijkstra — do not quietly raise the timeout.
let container: StartedNeo4jContainer;
let driver: Driver;

beforeAll(async () => {
  container = await new Neo4jContainer("neo4j:5").withApoc().start();
  driver = createDriver(container.getBoltUri(), {
    username: container.getUsername(),
    password: container.getPassword(),
  });
  await seedRoutes(driver, loadDataset(), pino({ level: "silent" }));
  await warmRouteGraph(driver, pino({ level: "silent" })); // mirror the boot sequence: /ready implies warm
});

afterAll(async () => {
  await driver?.close();
  await container?.stop();
});

test("hub-to-hub weighted search completes within the 2 s transaction bound", async () => {
  const startedAt = performance.now();
  const path = await searchRoute(driver, "LHR", "SYD", "km");
  const elapsedMs = performance.now() - startedAt;

  expect(path).not.toBeNull();
  expect(path!.totalKm).toBeGreaterThan(15_000); // sanity: London–Sydney is a long way
  expect(elapsedMs).toBeLessThan(2000);
});

test("a long multi-hop itinerary still resolves (regional to regional)", async () => {
  // Anaa (French Polynesia) to Visby (Sweden) forces several hops through hubs.
  const path = await searchRoute(driver, "AAA", "VBY", "hops");
  expect(path).not.toBeNull();
  expect(path!.hops).toBeGreaterThanOrEqual(3);
  expect(path!.hops).toBeLessThanOrEqual(6);
});
