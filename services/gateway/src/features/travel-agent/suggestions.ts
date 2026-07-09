import type { Plan } from "./planTrips.js";

// The structured cards the client renders. Affordable trips first (highest cost first, from the
// plan), then the goal trip last with its point gap. Pure.
export type Suggestion = {
  destination: string;
  emoji: string;
  cost: number;
  affordable: boolean;
  gap?: number;
};

export function toSuggestions(plan: Plan): Suggestion[] {
  const affordable: Suggestion[] = plan.affordable.map((t) => ({
    destination: t.destination,
    emoji: t.emoji,
    cost: t.cost,
    affordable: true,
  }));
  if (!plan.goal) return affordable;
  return [
    ...affordable,
    {
      destination: plan.goal.destination,
      emoji: plan.goal.emoji,
      cost: plan.goal.cost,
      affordable: false,
      gap: plan.goal.cost - plan.spendablePoints,
    },
  ];
}
