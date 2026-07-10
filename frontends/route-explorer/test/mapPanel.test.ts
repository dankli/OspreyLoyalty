import { render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import MapPanel from "../src/features/map/MapPanel.svelte";
import type { IslandModule, MapAirportRow } from "../src/features/map/mapData";

const airports: MapAirportRow[] = [
  { iata: "ARN", latitude: 59.65, longitude: 17.93 },
  { iata: "CPH", latitude: 55.62, longitude: 12.65 },
  { iata: "LHR", latitude: 51.47, longitude: -0.46 },
];

function fakeIsland() {
  const calls = {
    lats: undefined as Float32Array | undefined,
    lons: undefined as Float32Array | undefined,
    onPick: undefined as ((index: number) => void) | undefined,
    drawBase: vi.fn(),
    highlight: vi.fn(),
    showPath: vi.fn(),
  };
  class FakeRouteMap {
    constructor(
      _host: HTMLElement,
      lats: Float32Array,
      lons: Float32Array,
      onPick: (index: number) => void,
    ) {
      calls.lats = lats;
      calls.lons = lons;
      calls.onPick = onPick;
    }
    draw_base = calls.drawBase;
    highlight_destinations = calls.highlight;
    show_path = calls.showPath;
  }
  const loadIsland = async (): Promise<IslandModule> => ({ RouteMap: FakeRouteMap });
  return { calls, loadIsland };
}

test("mounts the island with typed arrays from the map payload and paints the base map", async () => {
  const { calls, loadIsland } = fakeIsland();
  render(MapPanel, { props: { loadIsland, airports: async () => airports } });

  await waitFor(() => expect(calls.drawBase).toHaveBeenCalledOnce());
  expect(Array.from(calls.lats!)).toHaveLength(3);
  expect(calls.lats![0]).toBeCloseTo(59.65);
  expect(calls.lons![2]).toBeCloseTo(-0.46);
});

test("a pick from the island fetches destinations by iata and highlights their indices", async () => {
  const { calls, loadIsland } = fakeIsland();
  const destinations = vi.fn(async () => [
    { airport: { iata: "LHR" } },
    { airport: { iata: "CPH" } },
    { airport: { iata: "XXX" } }, // not on the map — silently dropped
  ]);
  render(MapPanel, { props: { loadIsland, airports: async () => airports, destinations } });

  await waitFor(() => expect(calls.onPick).toBeDefined());
  calls.onPick!(0); // ARN

  await waitFor(() => expect(calls.highlight).toHaveBeenCalledOnce());
  expect(destinations).toHaveBeenCalledWith("ARN");
  const [from, dests] = calls.highlight.mock.calls[0]!;
  expect(from).toBe(0);
  expect(Array.from(dests as Uint32Array)).toEqual([2, 1]);
  expect(screen.getByText(/Routes from ARN/)).toBeInTheDocument();
});

test("a searched itinerary passed as pathIatas is drawn as a path of indices", async () => {
  const { calls, loadIsland } = fakeIsland();
  render(MapPanel, {
    props: { loadIsland, airports: async () => airports, pathIatas: ["ARN", "CPH", "LHR"] },
  });

  await waitFor(() => expect(calls.showPath).toHaveBeenCalled());
  expect(Array.from(calls.showPath.mock.calls[0]![0] as Uint32Array)).toEqual([0, 1, 2]);
});

test("a missing wasm pkg degrades to a visible hint, not a crash", async () => {
  render(MapPanel, {
    props: {
      loadIsland: async () => {
        throw new Error("module not found");
      },
      airports: async () => airports,
    },
  });

  await screen.findByText(/map unavailable/i);
});
