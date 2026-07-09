import { expect, test } from "vitest";
import { planTrips } from "../src/features/travel-agent/planTrips.js";
import type { Trip } from "../src/features/travel-agent/catalogue.js";

const cat: Trip[] = [
  { id: "a", destination: "Aville", emoji: "🅰", cost: 4000 },
  { id: "b", destination: "Bville", emoji: "🅱", cost: 6500 },
  { id: "c", destination: "Cville", emoji: "🅲", cost: 9000 },
  { id: "f", destination: "Fville", emoji: "🅵", cost: 10000 },
  { id: "g", destination: "Gville", emoji: "🅶", cost: 12000 },
  { id: "d", destination: "Dville", emoji: "🅳", cost: 16500 },
  { id: "e", destination: "Eville", emoji: "🅴", cost: 22000 },
];

// () => 0.999999 makes Fisher–Yates a no-op (every swap targets its own index), so the pick is the
// first MAX_AFFORDABLE in-budget trips in catalogue order — deterministic, for assertable tests.
const identityRng = () => 0.999999;

test("affordable is a pick of at most 3 in-budget trips, shown highest cost first", () => {
  const plan = planTrips(14500, cat, identityRng);
  expect(plan.affordable).toHaveLength(3);
  expect(plan.affordable.every((t) => t.cost <= 14500)).toBe(true);
  const costs = plan.affordable.map((t) => t.cost);
  expect(costs).toEqual([...costs].sort((x, y) => y - x)); // descending
});

test("the same rng reproduces the same selection (pure/deterministic)", () => {
  expect(planTrips(14500, cat, identityRng).affordable.map((t) => t.id)).toEqual(["c", "b", "a"]);
  expect(planTrips(14500, cat, identityRng).affordable.map((t) => t.id)).toEqual(["c", "b", "a"]);
});

test("a different rng surfaces a different set of alternatives (variety per click)", () => {
  const withHigh = planTrips(14500, cat, () => 0.999999).affordable.map((t) => t.id);
  const withZero = planTrips(14500, cat, () => 0).affordable.map((t) => t.id);
  expect(withZero).not.toEqual(withHigh);
  expect(withZero).toContain("f"); // a trip the identity pick never reaches
});

test("goal is the cheapest trip just above the balance, with the gap available via cost", () => {
  const plan = planTrips(14500, cat, identityRng);
  expect(plan.goal?.id).toBe("d");
  expect((plan.goal?.cost ?? 0) - plan.spendablePoints).toBe(2000);
});

test("exact-balance trip counts as affordable, not as the goal", () => {
  const plan = planTrips(9000, cat, identityRng);
  expect(plan.affordable.map((t) => t.id)).toContain("c"); // 9000 == balance → affordable
  expect(plan.goal?.id).toBe("f"); // cheapest above 9000
});

test("when nothing is affordable, goal is the cheapest trip and affordable is empty", () => {
  const plan = planTrips(1000, cat, identityRng);
  expect(plan.affordable).toEqual([]);
  expect(plan.goal?.id).toBe("a");
});

test("when everything is affordable, there is no goal (still bounded to 3)", () => {
  const plan = planTrips(999999, cat, identityRng);
  expect(plan.affordable).toHaveLength(3);
  expect(plan.goal).toBeNull();
});
