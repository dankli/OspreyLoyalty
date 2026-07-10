import { render, screen, waitFor } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import ExplorePage from "../src/features/explore/ExplorePage.svelte";
import type { AirportHit, DestinationRow } from "../src/features/explore/exploreData";

const arlanda: AirportHit = { iata: "ARN", name: "Stockholm Arlanda Airport", city: "Stockholm", country: "Sweden" };

const destinations: DestinationRow[] = [
  {
    airport: { iata: "MHQ", name: "Mariehamn", city: "Mariehamn", country: "Aland" },
    km: 122,
    min: 40,
    carriers: [{ name: "PopulAir" }],
  },
  {
    airport: { iata: "VBY", name: "Visby", city: "Visby", country: "Sweden" },
    km: 222,
    min: 45,
    carriers: [],
  },
];

test("typing searches (debounced) and picking an airport lists its destinations", async () => {
  const search = vi.fn(async () => [arlanda]);
  const fetchDestinations = vi.fn(async () => destinations);
  render(ExplorePage, { props: { search, destinations: fetchDestinations } });

  await userEvent.type(screen.getByPlaceholderText(/search airports/i), "arlanda");
  const hit = await screen.findByRole("button", { name: /ARN.*Stockholm/i });
  expect(search).toHaveBeenCalledWith("arlanda");

  await userEvent.click(hit);
  await screen.findByText(/Direct destinations from Stockholm Arlanda/);
  expect(fetchDestinations).toHaveBeenCalledWith("ARN");

  const table = screen.getByRole("table");
  expect(table).toHaveTextContent("Mariehamn");
  expect(table).toHaveTextContent("122 km");
  expect(table).toHaveTextContent("PopulAir");
  expect(table).toHaveTextContent("—"); // the carrier-less Visby row degrades to a dash
});

test("long destination lists page at 25 with a show-more button", async () => {
  const manyDestinations: DestinationRow[] = Array.from({ length: 30 }, (_, i) => ({
    airport: { iata: `A${String(i).padStart(2, "0")}`, name: `Airport ${i}`, city: `City ${i}`, country: "Sweden" },
    km: 100 + i,
    min: 60,
    carriers: [],
  }));
  const search = vi.fn(async () => [arlanda]);
  render(ExplorePage, { props: { search, destinations: vi.fn(async () => manyDestinations) } });

  await userEvent.type(screen.getByPlaceholderText(/search airports/i), "arlanda");
  await userEvent.click(await screen.findByRole("button", { name: /ARN.*Stockholm/i }));
  await screen.findByText(/Direct destinations from/);

  // 25 data rows + 1 header row, and the button announces the remainder.
  expect(screen.getAllByRole("row")).toHaveLength(26);
  const more = screen.getByRole("button", { name: /show 5 more/i });

  await userEvent.click(more);
  expect(screen.getAllByRole("row")).toHaveLength(31);
  expect(screen.queryByRole("button", { name: /more/i })).not.toBeInTheDocument();
});

test("a failing gateway shows one visible error, not a blank page", async () => {
  const search = vi.fn(async () => {
    throw new Error("gateway down");
  });
  render(ExplorePage, { props: { search, destinations: vi.fn(async () => []) } });

  await userEvent.type(screen.getByPlaceholderText(/search airports/i), "arlanda");
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i));
});

test("short input does not hit the gateway at all", async () => {
  const search = vi.fn(async () => [arlanda]);
  render(ExplorePage, { props: { search, destinations: vi.fn(async () => []) } });

  await userEvent.type(screen.getByPlaceholderText(/search airports/i), "a");
  await new Promise((resolve) => setTimeout(resolve, 300)); // beyond the debounce window
  expect(search).not.toHaveBeenCalled();
});
