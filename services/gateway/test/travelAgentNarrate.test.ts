import { expect, test } from "vitest";
import { narrate, tokenize } from "../src/features/travel-agent/narrate.js";
import { toSuggestions } from "../src/features/travel-agent/suggestions.js";
import { normalizeLang } from "../src/features/travel-agent/phrasebook.js";
import type { Plan } from "../src/features/travel-agent/planTrips.js";

const affordablePlan: Plan = {
  spendablePoints: 14500,
  affordable: [{ id: "lisbon", destination: "Lissabon", emoji: "🏖", cost: 9000 }],
  goal: { id: "mallorca", destination: "Mallorca", emoji: "🏝", cost: 16500 },
};

test("normalizeLang accepts the 5 supported languages and defaults to en", () => {
  expect(normalizeLang("sv")).toBe("sv");
  expect(normalizeLang("de")).toBe("de");
  expect(normalizeLang("fr")).toBe("en");
  expect(normalizeLang(null)).toBe("en");
});

test("narrate mentions the balance, the affordable count and the goal destination", () => {
  const text = narrate(affordablePlan, "en");
  expect(text).toContain("14,500");
  expect(text).toContain("1"); // one affordable getaway
  expect(text).toContain("Mallorca");
});

test("narrate uses the none-phrase when nothing is affordable", () => {
  const text = narrate({ spendablePoints: 1000, affordable: [], goal: affordablePlan.goal }, "en");
  expect(text.toLowerCase()).toContain("budget");
});

test("narrate localises (Swedish differs from English)", () => {
  expect(narrate(affordablePlan, "sv")).not.toEqual(narrate(affordablePlan, "en"));
});

test("tokenize splits into tokens that concatenate back to the original text", () => {
  const tokens = tokenize("Hello there world");
  expect(tokens.length).toBeGreaterThan(1);
  expect(tokens.join("")).toBe("Hello there world");
});

test("toSuggestions marks affordable trips and attaches the gap to the goal", () => {
  const s = toSuggestions(affordablePlan);
  expect(s.find((x) => x.destination === "Lissabon")).toMatchObject({ affordable: true });
  expect(s.find((x) => x.destination === "Mallorca")).toMatchObject({ affordable: false, gap: 2000 });
});
