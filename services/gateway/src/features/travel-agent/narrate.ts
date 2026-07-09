import type { Plan } from "./planTrips.js";
import { formatPoints, phrasebook, type Lang } from "./phrasebook.js";

// Compose the agent's spoken reply from the plan. Pure — no I/O, deterministic per (plan, lang).
export function narrate(plan: Plan, lang: Lang): string {
  const p = phrasebook[lang];
  let text = p.intro(formatPoints(plan.spendablePoints, lang));
  text += plan.affordable.length > 0 ? p.affordable(plan.affordable.length) : p.none();
  if (plan.goal) {
    const gap = plan.goal.cost - plan.spendablePoints;
    text += p.goal(formatPoints(gap, lang), plan.goal.destination);
  }
  return text;
}

// Split into word-with-trailing-whitespace tokens so the client can stream them and reconstruct
// the exact original text by concatenation (the typewriter effect).
export function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}
