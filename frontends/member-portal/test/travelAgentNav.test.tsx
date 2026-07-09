import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Nav } from "../src/Nav";

test("the nav shows a Travel Agent link pointing at /travel-agent", () => {
  render(
    <MemoryRouter>
      <Nav />
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: /travel agent/i });
  expect(link).toHaveAttribute("href", "/travel-agent");
});
