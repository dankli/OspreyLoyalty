import { expect, test } from "vitest";
import { progressPercent } from "../src/features/dashboard/progress";

test("halfway to next tier is proportional", () => {
  // 32 000 of 45 000 to GOLD ≈ 71%
  expect(progressPercent(32000, 13000)).toBe(71);
});

test("top tier shows a full bar", () => {
  expect(progressPercent(200000, null)).toBe(100);
});

test("fresh member starts at zero", () => {
  expect(progressPercent(0, 20000)).toBe(0);
});
