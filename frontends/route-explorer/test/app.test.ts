import { render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { expect, test } from "vitest";
import App from "../src/App.svelte";

// Tab panels are hidden, not destroyed, once visited — so what you typed or searched
// survives a round-trip through the other tabs. The single typed character stays
// under the typeahead's two-character threshold, so no gateway call ever fires.
test("switching tabs preserves each tab's state", async () => {
  render(App);

  const exploreInput = screen.getByPlaceholderText<HTMLInputElement>(/search airports/i);
  await userEvent.type(exploreInput, "a");

  await userEvent.click(screen.getByRole("button", { name: "Route search" }));
  expect(screen.getByRole("button", { name: /find route/i })).toBeInTheDocument();
  // The explore panel is still mounted, just hidden.
  expect(exploreInput).toBeInTheDocument();
  expect(exploreInput.closest("div[hidden]")).not.toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Explore" }));
  expect(exploreInput.closest("div[hidden]")).toBeNull();
  expect(exploreInput.value).toBe("a");
});
