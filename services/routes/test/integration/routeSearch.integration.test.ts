import { Neo4jContainer, type StartedNeo4jContainer } from "@testcontainers/neo4j";
import pino from "pino";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Driver } from "neo4j-driver";
import { createDriver } from "../../src/neo4j.js";
import { parseDataset } from "../../src/features/seed/parseDataset.js";
import { seedRoutes } from "../../src/features/seed/seedRoutes.js";
import { searchRoute } from "../../src/features/route-search/searchRoute.js";
import { routeFixture } from "../fixtures/routeFixture.js";

let container: StartedNeo4jContainer;
let driver: Driver;

beforeAll(async () => {
  container = await new Neo4jContainer("neo4j:5").withApoc().start();
  driver = createDriver(container.getBoltUri(), {
    username: container.getUsername(),
    password: container.getPassword(),
  });
  await seedRoutes(driver, parseDataset(routeFixture), pino({ level: "silent" }));
});

afterAll(async () => {
  await driver?.close();
  await container?.stop();
});

test("hops-optimal takes the direct flight even when it is long", async () => {
  const path = await searchRoute(driver, "PPP", "QQQ", "hops");
  expect(path?.hops).toBe(1);
  expect(path?.totalKm).toBe(1000);
  expect(path?.legs[0]?.carriers).toEqual([{ iata: "T1", name: "Test Direct" }]);
});

test("km-optimal takes one extra hop when it is shorter in kilometres", async () => {
  const path = await searchRoute(driver, "PPP", "QQQ", "km");
  expect(path?.hops).toBe(2);
  expect(path?.totalKm).toBe(200);
  expect(path?.legs.map((leg) => leg.to.iata)).toEqual(["RRR", "QQQ"]);
});

test("min-optimal stays on the direct flight when it is faster", async () => {
  const path = await searchRoute(driver, "PPP", "QQQ", "min");
  expect(path?.hops).toBe(1);
  expect(path?.totalMin).toBe(50);
});

test("an unreachable pair is null, not an error", async () => {
  expect(await searchRoute(driver, "QQQ", "RRR", "km")).toBeNull();
});
