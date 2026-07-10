import { createServer, type Server } from "node:http";
import { afterEach, expect, test, vi } from "vitest";
import { createApp, type AppDeps } from "../src/app.js";

const arlanda = {
  iata: "ARN",
  icao: "ESSA",
  name: "Stockholm Arlanda",
  city: "Stockholm",
  country: "Sweden",
  countryCode: "SE",
  continent: "EU",
  latitude: 59.651944,
  longitude: 17.918611,
  timezone: "Europe/Stockholm",
};

function fakeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    searchAirports: vi.fn(async () => [arlanda]),
    getAirport: vi.fn(async (iata: string) => (iata === "ARN" ? arlanda : null)),
    getDestinations: vi.fn(async () => [
      { airport: arlanda, km: 400, min: 60, carriers: [{ iata: "SK", name: "SAS" }] },
    ]),
    allAirports: vi.fn(async () => [{ iata: "ARN", latitude: 59.651944, longitude: 17.918611 }]),
    isReady: () => true,
    authorize: async () => true,
    ...overrides,
  };
}

let server: Server | undefined;

async function listen(deps: AppDeps): Promise<string> {
  server = createServer(createApp(deps));
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(() => {
  server?.close();
  server = undefined;
});

test("/health is 200 from process start", async () => {
  const base = await listen(fakeDeps({ isReady: () => false }));
  const res = await fetch(`${base}/health`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("/ready is 503 before seeding and 200 after", async () => {
  let ready = false;
  const base = await listen(fakeDeps({ isReady: () => ready }));
  expect((await fetch(`${base}/ready`)).status).toBe(503);
  ready = true;
  expect((await fetch(`${base}/ready`)).status).toBe(200);
});

test("/metrics exposes the request histogram", async () => {
  const base = await listen(fakeDeps());
  await fetch(`${base}/health`);
  const body = await (await fetch(`${base}/metrics`)).text();
  expect(body).toContain("http_request_duration_seconds");
});

test("airport search requires q and clamps limit to 25", async () => {
  const deps = fakeDeps();
  const base = await listen(deps);
  expect((await fetch(`${base}/airports`)).status).toBe(400);
  const res = await fetch(`${base}/airports?q=arn&limit=100`);
  expect(res.status).toBe(200);
  expect(deps.searchAirports).toHaveBeenCalledWith("arn", 25);
});

test("airport lookup normalizes the iata to uppercase; unknown is 404", async () => {
  const deps = fakeDeps();
  const base = await listen(deps);
  const res = await fetch(`${base}/airports/arn`);
  expect(res.status).toBe(200);
  expect(deps.getAirport).toHaveBeenCalledWith("ARN");
  expect((await fetch(`${base}/airports/XXX`)).status).toBe(404);
});

test("destinations of a known airport come back with carriers", async () => {
  const base = await listen(fakeDeps());
  const res = await fetch(`${base}/airports/ARN/destinations`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body[0].carriers).toEqual([{ iata: "SK", name: "SAS" }]);
});

test("/airports/all returns the map payload", async () => {
  const base = await listen(fakeDeps());
  const body = await (await fetch(`${base}/airports/all`)).json();
  expect(body).toEqual([{ iata: "ARN", latitude: 59.651944, longitude: 17.918611 }]);
});

test("unknown paths are 404", async () => {
  const base = await listen(fakeDeps());
  expect((await fetch(`${base}/nope`)).status).toBe(404);
});

test("a throwing dependency becomes a clean 500, not a crash", async () => {
  const base = await listen(fakeDeps({ getAirport: vi.fn(async () => { throw new Error("boom"); }) }));
  const res = await fetch(`${base}/airports/ARN`);
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "internal error" });
});

test("the correlation id is echoed back, minted when absent", async () => {
  const base = await listen(fakeDeps());
  const echoed = await fetch(`${base}/health`, { headers: { "x-correlation-id": "abc123" } });
  expect(echoed.headers.get("x-correlation-id")).toBe("abc123");
  const minted = await fetch(`${base}/health`);
  expect(minted.headers.get("x-correlation-id")).toMatch(/^[0-9a-f]{32}$/);
});

test("failing authorization is 401 on API routes but never on health, ready or metrics", async () => {
  const base = await listen(fakeDeps({ authorize: async () => false }));
  expect((await fetch(`${base}/airports?q=arn`)).status).toBe(401);
  expect((await fetch(`${base}/airports/ARN`)).status).toBe(401);
  expect((await fetch(`${base}/health`)).status).toBe(200);
  expect((await fetch(`${base}/ready`)).status).toBe(200);
  expect((await fetch(`${base}/metrics`)).status).toBe(200);
});
