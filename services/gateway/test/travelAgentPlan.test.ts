import { expect, test } from "vitest";
import { planTrips } from "../src/features/travel-agent/planTrips.js";
import type { Trip } from "../src/features/travel-agent/catalogue.js";

const cat: Trip[] = [
  { id: "a", destination: "Aville", emoji: "🅰", cost: 4000 },
  { id: "b", destination: "Bville", emoji: "🅱", cost: 6500 },
  { id: "c", destination: "Cville", emoji: "🅲", cost: 9000 },
  { id: "d", destination: "Dville", emoji: "🅳", cost: 16500 },
  { id: "e", destination: "Eville", emoji: "🅴", cost: 22000 },
];

test("affordable trips are the top 3 within budget, highest cost first", () => {
  const plan = planTrips(14500, cat);
  expect(plan.affordable.map((t) => t.id)).toEqual(["c", "b", "a"]);
  expect(plan.affordable.every((t) => t.cost <= 14500)).toBe(true);
});

test("goal is the cheapest trip just above the balance, with the gap available via cost", () => {
  const plan = planTrips(14500, cat);
  expect(plan.goal?.id).toBe("d");
  expect((plan.goal?.cost ?? 0) - plan.spendablePoints).toBe(2000);
});

test("exact-balance trip counts as affordable, not as the goal", () => {
  const plan = planTrips(9000, cat);
  expect(plan.affordable.map((t) => t.id)).toEqual(["c", "b", "a"]);
  expect(plan.goal?.id).toBe("d");
});

test("when nothing is affordable, goal is the cheapest trip and affordable is empty", () => {
  const plan = planTrips(1000, cat);
  expect(plan.affordable).toEqual([]);
  expect(plan.goal?.id).toBe("a");
});

test("when everything is affordable, there is no goal", () => {
  const plan = planTrips(999999, cat);
  expect(plan.affordable).toHaveLength(3); // bounded to 3
  expect(plan.goal).toBeNull();
});
