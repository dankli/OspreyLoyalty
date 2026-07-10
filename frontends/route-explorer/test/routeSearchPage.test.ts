import { render, screen, waitFor } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import RouteSearchPage from "../src/features/route-search/RouteSearchPage.svelte";
import type { AirportHit } from "../src/features/explore/exploreData";
import type { RoutePathResult } from "../src/features/route-search/routeSearchData";

const arlanda: AirportHit = { iata: "ARN", name: "Stockholm Arlanda", city: "Stockholm", country: "Sweden" };
const sydney: AirportHit = { iata: "SYD", name: "Sydney Kingsford Smith", city: "Sydney", country: "Australia" };

const path: RoutePathResult = {
  hops: 2,
  totalKm: 15800,
  totalMin: 1350,
  estimatedPoints: 79000,
  legs: [
    { from: arlanda, to: { iata: "DOH", name: "Hamad", city: "Doha", country: "Qatar" }, km: 4800, min: 370, carriers: [{ name: "Qatar Airways" }] },
    { from: { iata: "DOH", name: "Hamad", city: "Doha", country: "Qatar" }, to: sydney, km: 11000, min: 980, carriers: [{ name: "Qatar Airways" }] },
  ],
};

async function pickAirports(search: ReturnType<typeof vi.fn>) {
  const [fromInput, toInput] = screen.getAllByPlaceholderText(/search airports/i);
  search.mockResolvedValueOnce([arlanda]);
  await userEvent.type(fromInput!, "arlanda");
  await userEvent.click(await screen.findByRole("button", { name: /ARN.*Stockholm/i }));

  search.mockResolvedValueOnce([sydney]);
  await userEvent.type(toInput!, "sydney");
  await userEvent.click(await screen.findByRole("button", { name: /SYD.*Sydney/i }));
}

test("picking both airports enables search; the result renders legs and totals", async () => {
  const search = vi.fn();
  const routeSearch = vi.fn(async () => path);
  render(RouteSearchPage, { props: { search, routeSearch } });

  const go = screen.getByRole("button", { name: /find route/i });
  expect(go).toBeDisabled();

  await pickAirports(search);
  expect(go).toBeEnabled();

  await userEvent.click(go);
  await screen.findByText(/Itinerary/);
  expect(routeSearch).toHaveBeenCalledWith("ARN", "SYD", "KM");
  expect(screen.getByText(/2 hop\(s\)/)).toBeInTheDocument();
  expect(screen.getByText(/79,000 Osprey points/)).toBeInTheDocument();
  const table = screen.getByRole("table");
  expect(table).toHaveTextContent("DOH");
  expect(table).toHaveTextContent("Qatar Airways");
});

test("a found route is drawn on the inline world map below the itinerary", async () => {
  const search = vi.fn();
  const routeSearch = vi.fn(async () => path);
  const showPath = vi.fn();
  class FakeRouteMap {
    draw_base = vi.fn();
    highlight_destinations = vi.fn();
    show_path = showPath;
    zoom_in = vi.fn();
    zoom_out = vi.fn();
    reset_view = vi.fn();
  }
  render(RouteSearchPage, {
    props: {
      search,
      routeSearch,
      mapProps: {
        loadIsland: async () => ({ RouteMap: FakeRouteMap }),
        airports: async () => [
          { iata: "ARN", latitude: 59.65, longitude: 17.93 },
          { iata: "DOH", latitude: 25.27, longitude: 51.61 },
          { iata: "SYD", latitude: -33.95, longitude: 151.18 },
        ],
      },
    },
  });

  await pickAirports(search);
  await userEvent.click(screen.getByRole("button", { name: /find route/i }));
  await screen.findByRole("heading", { name: "Itinerary" });

  // ARN → DOH → SYD as indices into the map payload.
  await waitFor(() => expect(showPath).toHaveBeenCalled());
  expect(Array.from(showPath.mock.calls[0]![0] as Uint32Array)).toEqual([0, 1, 2]);
});

test("a degraded points estimate hides the badge but keeps the itinerary", async () => {
  const search = vi.fn();
  const routeSearch = vi.fn(async () => ({ ...path, estimatedPoints: null }));
  render(RouteSearchPage, { props: { search, routeSearch } });

  await pickAirports(search);
  await userEvent.click(screen.getByRole("button", { name: /find route/i }));

  await screen.findByText(/Itinerary/);
  expect(screen.queryByText(/Osprey points/)).not.toBeInTheDocument();
});

test("the optimize toggle changes what is sent to the gateway", async () => {
  const search = vi.fn();
  const routeSearch = vi.fn(async () => path);
  render(RouteSearchPage, { props: { search, routeSearch } });

  await pickAirports(search);
  await userEvent.click(screen.getByLabelText(/fewest stops/i));
  await userEvent.click(screen.getByRole("button", { name: /find route/i }));

  await screen.findByText(/Itinerary/);
  expect(routeSearch).toHaveBeenCalledWith("ARN", "SYD", "HOPS");
});

test("an unreachable pair shows the no-route message, not an error", async () => {
  const search = vi.fn();
  const routeSearch = vi.fn(async () => null);
  render(RouteSearchPage, { props: { search, routeSearch } });

  await pickAirports(search);
  await userEvent.click(screen.getByRole("button", { name: /find route/i }));

  await screen.findByText(/no route found/i);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a gateway failure shows one visible error", async () => {
  const search = vi.fn();
  const routeSearch = vi.fn(async () => {
    throw new Error("boom");
  });
  render(RouteSearchPage, { props: { search, routeSearch } });

  await pickAirports(search);
  await userEvent.click(screen.getByRole("button", { name: /find route/i }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/something went wrong/i);
});
