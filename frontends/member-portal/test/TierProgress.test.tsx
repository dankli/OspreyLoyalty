import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TierProgress } from "../src/features/dashboard/TierProgress";

test("shows tier and points remaining to the next one", () => {
  render(<TierProgress tier="SILVER" qualifyingPoints={32000} pointsToNextTier={13000} />);
  expect(screen.getByText("SILVER")).toBeInTheDocument();
  expect(screen.getByText(/13[\s, ]?000/)).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "71");
});

test("osprey says invitation instead of counting", () => {
  render(<TierProgress tier="OSPREY" qualifyingPoints={96000} pointsToNextTier={null} />);
  expect(screen.getByText(/by invitation/i)).toBeInTheDocument();
});

test("diamond is the end of the earned ladder", () => {
  render(<TierProgress tier="DIAMOND" qualifyingPoints={95000} pointsToNextTier={null} />);
  expect(screen.getByText(/highest earned tier/i)).toBeInTheDocument();
});
