import { expect, test } from "vitest";
import { savingsPercent } from "../src/features/travel-agent/savingsPercent.ts";

test("returns the whole-number percentage of the goal cost already saved", () => {
  expect(savingsPercent(14500, 16500)).toBe(88); // 14500/16500 ≈ 87.9 → 88
});
test("clamps to 100 and handles a zero goal cost safely", () => {
  expect(savingsPercent(20000, 16500)).toBe(100);
  expect(savingsPercent(0, 0)).toBe(0);
});
