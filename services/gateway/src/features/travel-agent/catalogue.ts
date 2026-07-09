// A fake trip catalogue. Costs are modelled on SAS EuroBonus economy Saver awards for a
// ROUND TRIP for TWO travellers (roughly 2× round-trip-per-person), so the numbers read
// realistically for the "resa för två" the agent proposes: ~11,000 pts for a short domestic hop,
// ~25,000 within Europe, ~90,000 to North America, ~140,000 to Asia. Destination names are proper
// nouns and are never translated. This is the single source of truth for what the agent can offer.
export type Trip = { id: string; destination: string; emoji: string; cost: number };

export const catalogue: Trip[] = [
  { id: "gothenburg", destination: "Göteborg", emoji: "🦞", cost: 11000 },
  { id: "copenhagen", destination: "Köpenhamn", emoji: "🚲", cost: 11000 },
  { id: "oslo", destination: "Oslo", emoji: "⛷️", cost: 12000 },
  { id: "helsinki", destination: "Helsingfors", emoji: "🧖", cost: 13000 },
  { id: "hamburg", destination: "Hamburg", emoji: "🍺", cost: 14000 },
  { id: "amsterdam", destination: "Amsterdam", emoji: "🌷", cost: 18000 },
  { id: "london", destination: "London", emoji: "🎡", cost: 22000 },
  { id: "paris", destination: "Paris", emoji: "🗼", cost: 24000 },
  { id: "lisbon", destination: "Lissabon", emoji: "🏖️", cost: 28000 },
  { id: "rome", destination: "Rom", emoji: "🏛️", cost: 28000 },
  { id: "barcelona", destination: "Barcelona", emoji: "🎨", cost: 28000 },
  { id: "reykjavik", destination: "Reykjavík", emoji: "🌋", cost: 30000 },
  { id: "mallorca", destination: "Mallorca", emoji: "🏝️", cost: 32000 },
  { id: "grancanaria", destination: "Gran Canaria", emoji: "🌴", cost: 40000 },
  { id: "dubai", destination: "Dubai", emoji: "🕌", cost: 55000 },
  { id: "newyork", destination: "New York", emoji: "🗽", cost: 90000 },
  { id: "bangkok", destination: "Bangkok", emoji: "🛺", cost: 120000 },
  { id: "tokyo", destination: "Tokyo", emoji: "⛩️", cost: 140000 },
];
