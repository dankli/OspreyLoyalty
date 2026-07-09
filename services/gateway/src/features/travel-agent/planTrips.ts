import type { Trip } from "./catalogue.js";

// The pure, total heart of the feature. Given a balance and a catalogue it always returns a
// Plan (never throws): up to 3 trips the member can afford — picked at RANDOM from everything in
// budget so each click surfaces a slightly different set — plus the cheapest trip just above the
// balance as a savings goal (kept deterministic: a stable "aim for" anchor).
export type Plan = {
  spendablePoints: number;
  affordable: Trip[]; // at most 3, a random pick from the in-budget trips, shown highest cost first
  goal: Trip | null; // cheapest trip above the balance; null when the member can afford every trip
};

const MAX_AFFORDABLE = 3;

// rng is injected so the function stays pure and testable; production passes Math.random.
export function planTrips(spendablePoints: number, catalogue: Trip[], rng: () => number = Math.random): Plan {
  const inBudget = catalogue.filter((t) => t.cost <= spendablePoints);
  const affordable = shuffle(inBudget, rng)
    .slice(0, MAX_AFFORDABLE)
    .sort((a, b) => b.cost - a.cost);
  const goal = [...catalogue].sort((a, b) => a.cost - b.cost).find((t) => t.cost > spendablePoints) ?? null;
  return { spendablePoints, affordable, goal };
}

// Fisher–Yates over a copy, driven by the injected rng — no mutation of the caller's array.
function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
