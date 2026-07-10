import pino from "pino";
import { afterEach, expect, test, vi } from "vitest";
import { createPointsEstimator } from "../src/features/points/pointsClient.js";

afterEach(() => vi.unstubAllGlobals());

const logger = pino({ level: "silent" });

test("passes totalKm and the configured rate to the points-engine contract", async () => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ points: 79000 }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);

  const estimate = createPointsEstimator("http://points-engine:8082", 5, logger);
  expect(await estimate(15800)).toBe(79000);

  expect(fetchMock.mock.calls[0]?.[0]).toBe("http://points-engine:8082/calculate");
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  expect(JSON.parse(init.body as string)).toEqual({ amount: 15800, rate: 5, promotions: [] });
});

test("a points-engine failure degrades to null, never an error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
  const estimate = createPointsEstimator("http://points-engine:8082", 5, logger);
  expect(await estimate(1000)).toBeNull();
});

test("a network fault or timeout degrades to null", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("connect ECONNREFUSED");
  }));
  const estimate = createPointsEstimator("http://points-engine:8082", 5, logger);
  expect(await estimate(1000)).toBeNull();
});

test("a drifted engine response degrades to null rather than passing junk through", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ score: 42 }), { status: 200, headers: { "content-type": "application/json" } })));
  const estimate = createPointsEstimator("http://points-engine:8082", 5, logger);
  expect(await estimate(1000)).toBeNull();
});
