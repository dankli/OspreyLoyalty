import { render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import AirportPicker from "../src/lib/AirportPicker.svelte";
import type { AirportHit } from "../src/features/explore/exploreData";

const hits: AirportHit[] = [
  { iata: "LHR", name: "Heathrow", city: "London", country: "United Kingdom", degree: 250 },
  { iata: "LGW", name: "Gatwick", city: "London", country: "United Kingdom", degree: 190 },
];

test("arrow keys walk the hits and Enter picks the highlighted one", async () => {
  const search = vi.fn(async () => hits);
  const onpick = vi.fn();
  render(AirportPicker, { props: { label: "From", search, onpick } });

  const input = screen.getByPlaceholderText(/search airports/i);
  await userEvent.type(input, "london");
  await screen.findByRole("button", { name: /LHR/ });

  await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(onpick).toHaveBeenCalledWith(expect.objectContaining({ iata: "LGW" }));
});

test("hits badge their destination count when the search provides it", async () => {
  const search = vi.fn(async () => hits);
  render(AirportPicker, { props: { label: "From", search, onpick: vi.fn() } });

  await userEvent.type(screen.getByPlaceholderText(/search airports/i), "london");
  await screen.findByText(/250 destinations/);
});

test("Escape closes the list without picking", async () => {
  const search = vi.fn(async () => hits);
  const onpick = vi.fn();
  render(AirportPicker, { props: { label: "From", search, onpick } });

  await userEvent.type(screen.getByPlaceholderText(/search airports/i), "london");
  await screen.findByRole("button", { name: /LHR/ });
  await userEvent.keyboard("{Escape}");

  expect(screen.queryByRole("button", { name: /LHR/ })).not.toBeInTheDocument();
  expect(onpick).not.toHaveBeenCalled();
});
