// A fake trip catalogue, priced in loyalty points for TWO travellers across point tiers.
// Destination names are proper nouns and are never translated. This is the single source of
// truth for what the (fake) travel agent can offer.
export type Trip = { id: string; destination: string; emoji: string; cost: number };

export const catalogue: Trip[] = [
  { id: "gothenburg", destination: "Göteborg", emoji: "🦀", cost: 4000 },
  { id: "copenhagen", destination: "Köpenhamn", emoji: "🚲", cost: 6500 },
  { id: "lisbon", destination: "Lissabon", emoji: "🏖", cost: 9000 },
  { id: "mallorca", destination: "Mallorca", emoji: "🏝", cost: 16500 },
  { id: "rome", destination: "Rom", emoji: "🏛", cost: 22000 },
  { id: "reykjavik", destination: "Reykjavík", emoji: "🌋", cost: 28000 },
  { id: "tokyo", destination: "Tokyo", emoji: "🗼", cost: 40000 },
  { id: "maldives", destination: "Maldiverna", emoji: "🐠", cost: 62000 },
];
