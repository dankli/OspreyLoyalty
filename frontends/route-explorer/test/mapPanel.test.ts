import { render, screen, waitFor } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import MapPanel from "../src/features/map/MapPanel.svelte";
import type { AirportDetails, IslandModule, MapAirportRow } from "../src/features/map/mapData";

const airports: MapAirportRow[] = [
  { iata: "ARN", latitude: 59.65, longitude: 17.93, degree: 120 },
  { iata: "CPH", latitude: 55.62, longitude: 12.65, degree: 45 },
  { iata: "LHR", latitude: 51.47, longitude: -0.46, degree: 250 },
];

const details: Record<string, AirportDetails> = {
  ARN: { iata: "ARN", name: "Stockholm Arlanda", city: "Stockholm", country: "Sweden" },
};

const airportDetails = async (iata: string) => details[iata] ?? null;

function fakeIsland() {
  const calls = {
    lats: undefined as Float32Array | undefined,
    lons: undefined as Float32Array | undefined,
    degrees: undefined as Uint32Array | undefined,
    labels: undefined as string[] | undefined,
    onPick: undefined as ((index: number) => void) | undefined,
    onHover: undefined as ((index: number) => void) | undefined,
    drawBase: vi.fn(),
    highlight: vi.fn(),
    showPath: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetView: vi.fn(),
  };
  class FakeRouteMap {
    constructor(
      _host: HTMLElement,
      lats: Float32Array,
      lons: Float32Array,
      degrees: Uint32Array,
      labels: string[],
      onPick: (index: number) => void,
      onHover: (index: number) => void,
    ) {
      calls.lats = lats;
      calls.lons = lons;
      calls.degrees = degrees;
      calls.labels = labels;
      calls.onPick = onPick;
      calls.onHover = onHover;
    }
    draw_base = calls.drawBase;
    highlight_destinations = calls.highlight;
    show_path = calls.showPath;
    zoom_in = calls.zoomIn;
    zoom_out = calls.zoomOut;
    reset_view = calls.resetView;
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
  expect(Array.from(calls.degrees!)).toEqual([120, 45, 250]);
  expect(calls.labels).toEqual(["ARN", "CPH", "LHR"]);
  // The base status line is owned by Svelte now (i18n), not the island.
  await screen.findByText(/3 airports — click one/);
});

test("a pick from the island fetches destinations by iata and highlights their indices", async () => {
  const { calls, loadIsland } = fakeIsland();
  const destinations = vi.fn(async () => [
    { airport: { iata: "LHR" } },
    { airport: { iata: "CPH" } },
    { airport: { iata: "XXX" } }, // not on the map — silently dropped
  ]);
  render(MapPanel, { props: { loadIsland, airports: async () => airports, destinations, airportDetails } });

  await waitFor(() => expect(calls.onPick).toBeDefined());
  calls.onPick!(0); // ARN

  await waitFor(() => expect(calls.highlight).toHaveBeenCalledOnce());
  expect(destinations).toHaveBeenCalledWith("ARN");
  const [from, dests] = calls.highlight.mock.calls[0]!;
  expect(from).toBe(0);
  expect(Array.from(dests as Uint32Array)).toEqual([2, 1]);
  // What was clicked, spelled out: name, city, country and the destination count.
  await screen.findByText(/Stockholm Arlanda \(ARN\) · Stockholm, Sweden — 3 direct destinations/);
});

test("missing airport details degrade the label to the iata, not the pick", async () => {
  const { calls, loadIsland } = fakeIsland();
  const destinations = vi.fn(async () => [{ airport: { iata: "LHR" } }]);
  render(MapPanel, {
    props: {
      loadIsland,
      airports: async () => airports,
      destinations,
      airportDetails: async () => {
        throw new Error("details endpoint down");
      },
    },
  });

  await waitFor(() => expect(calls.onPick).toBeDefined());
  calls.onPick!(0); // ARN

  await waitFor(() => expect(calls.highlight).toHaveBeenCalledOnce());
  await screen.findByText(/Routes from ARN/);
});

test("a searched itinerary passed as pathIatas is drawn as a path of indices", async () => {
  const { calls, loadIsland } = fakeIsland();
  render(MapPanel, {
    props: { loadIsland, airports: async () => airports, pathIatas: ["ARN", "CPH", "LHR"] },
  });

  await waitFor(() => expect(calls.showPath).toHaveBeenCalled());
  expect(Array.from(calls.showPath.mock.calls[0]![0] as Uint32Array)).toEqual([0, 1, 2]);
  await screen.findByText(/Itinerary with 2 leg\(s\)/);
});

test("hovering a dot shows a tooltip with the iata and destination count", async () => {
  const { calls, loadIsland } = fakeIsland();
  render(MapPanel, { props: { loadIsland, airports: async () => airports } });
  await waitFor(() => expect(calls.onHover).toBeDefined());

  calls.onHover!(2); // LHR, degree 250
  await screen.findByText(/250 destinations/);
  expect(screen.getByText("LHR")).toBeInTheDocument();

  calls.onHover!(-1); // pointer left the dot
  await waitFor(() => expect(screen.queryByText(/250 destinations/)).not.toBeInTheDocument());
});

test("the toolbar buttons drive the island's zoom", async () => {
  const { calls, loadIsland } = fakeIsland();
  render(MapPanel, { props: { loadIsland, airports: async () => airports } });
  await waitFor(() => expect(calls.drawBase).toHaveBeenCalledOnce());

  await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
  await userEvent.click(screen.getByRole("button", { name: "Reset view" }));

  expect(calls.zoomIn).toHaveBeenCalledOnce();
  expect(calls.zoomOut).toHaveBeenCalledOnce();
  expect(calls.resetView).toHaveBeenCalledOnce();
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
