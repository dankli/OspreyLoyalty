import { render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import RouteSearchPage from "../src/features/route-search/RouteSearchPage.svelte";
import type { AirportHit } from "../src/features/explore/exploreData";
import type { RoutePathResult } from "../src/features/route-search/routeSearchData";
import type { TripBooking } from "../src/features/route-search/bookTrip";

const arlanda: AirportHit = { iata: "ARN", name: "Stockholm Arlanda", city: "Stockholm", country: "Sweden" };
const kennedy: AirportHit = { iata: "JFK", name: "John F. Kennedy Intl", city: "New York", country: "United States" };

const path: RoutePathResult = {
  hops: 1,
  totalKm: 6300,
  totalMin: 500,
  estimatedPoints: 12600,
  legs: [{ from: arlanda, to: kennedy, km: 6300, min: 500, carriers: [{ name: "SAS" }] }],
};

function seededProps(book: (
  memberId: string, from: string, to: string, optimize: "KM" | "MIN" | "HOPS", key: string,
) => Promise<TripBooking>) {
  return {
    search: vi.fn(),
    routeSearch: vi.fn(async () => path),
    book,
    seed: { from: arlanda, to: kennedy, auto: true },
  };
}

test("booking the shown route spends points and shows the confirmation", async () => {
  const book = vi.fn(async (): Promise<TripBooking> => ({
    fromIata: "ARN", toIata: "JFK", pointsSpent: 12600, spendablePoints: 1900, alreadyApplied: false,
  }));
  render(RouteSearchPage, { props: seededProps(book) });

  await userEvent.click(await screen.findByRole("button", { name: /book with points/i }));

  await screen.findByText(/trip booked!/i);
  expect(screen.getByText(/points spent: 12,600/i)).toBeInTheDocument();
  expect(screen.getByText(/remaining balance: 1,900/i)).toBeInTheDocument();
  // demo identity, the searched route, the shown strategy, and a fresh idempotency key
  expect(book).toHaveBeenCalledWith("demo-ada", "ARN", "JFK", "KM", expect.any(String));
  // the button is gone — one booking per shown route
  expect(screen.queryByRole("button", { name: /book with points/i })).not.toBeInTheDocument();
});

test("a replayed booking shows the already-applied note instead of a spend", async () => {
  const book = vi.fn(async (): Promise<TripBooking> => ({
    fromIata: "ARN", toIata: "JFK", pointsSpent: 0, spendablePoints: 1900, alreadyApplied: true,
  }));
  render(RouteSearchPage, { props: seededProps(book) });

  await userEvent.click(await screen.findByRole("button", { name: /book with points/i }));

  await screen.findByText(/trip booked!/i);
  expect(screen.getByText(/already applied/i)).toBeInTheDocument();
  expect(screen.queryByText(/points spent/i)).not.toBeInTheDocument();
});

test("a refusal (insufficient points) renders the gateway's message", async () => {
  const book = vi.fn(async (): Promise<TripBooking> => {
    throw new Error("Insufficient spendable points.");
  });
  render(RouteSearchPage, { props: seededProps(book) });

  await userEvent.click(await screen.findByRole("button", { name: /book with points/i }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/booking failed/i);
  expect(alert).toHaveTextContent(/insufficient spendable points/i);
  // failure keeps the button so the member can retry after earning more
  expect(screen.getByRole("button", { name: /book with points/i })).toBeInTheDocument();
});
