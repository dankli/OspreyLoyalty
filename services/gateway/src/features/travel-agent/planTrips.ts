import type { Trip } from "./catalogue.js";

// The pure, total heart of the feature. Given a balance and a catalogue it always returns a
// Plan (never throws): up to 3 trips the member can afford (aspire as high as possible), plus
// the cheapest trip just above the balance as a savings goal — the retention hook.
export type Plan = {
  spendablePoints: number;
  affordable: Trip[]; // at most 3, highest cost first
  goal: Trip | null; // cheapest trip above the balance; null when the member can afford every trip in the catalogue
};

const MAX_AFFORDABLE = 3;

export function planTrips(spendablePoints: number, catalogue: Trip[]): Plan {
  const byCostAsc = [...catalogue].sort((a, b) => a.cost - b.cost);
  const affordable = byCostAsc
    .filter((t) => t.cost <= spendablePoints)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, MAX_AFFORDABLE);
  const goal = byCostAsc.find((t) => t.cost > spendablePoints) ?? null;
  return { spendablePoints, affordable, goal };
}
