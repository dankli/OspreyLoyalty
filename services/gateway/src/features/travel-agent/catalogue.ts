// A fake trip catalogue for two travellers. Costs are modelled on SAS EuroBonus one-way economy
// Saver award levels (≈5,000 pts domestic, ~10,000 within Europe, ~30,000 to North America,
// ~45,000 to Asia) so the numbers read realistically. Destination names are proper nouns and are
// never translated. This is the single source of truth for what the (fake) travel agent can offer.
export type Trip = { id: string; destination: string; emoji: string; cost: number };

export const catalogue: Trip[] = [
  { id: "gothenburg", destination: "Göteborg", emoji: "🦞", cost: 5000 },
  { id: "copenhagen", destination: "Köpenhamn", emoji: "🚲", cost: 5000 },
  { id: "oslo", destination: "Oslo", emoji: "⛷️", cost: 5000 },
  { id: "helsinki", destination: "Helsingfors", emoji: "🧖", cost: 6000 },
  { id: "hamburg", destination: "Hamburg", emoji: "🍺", cost: 7500 },
  { id: "amsterdam", destination: "Amsterdam", emoji: "🌷", cost: 8000 },
  { id: "london", destination: "London", emoji: "🎡", cost: 10000 },
  { id: "paris", destination: "Paris", emoji: "🗼", cost: 10000 },
  { id: "lisbon", destination: "Lissabon", emoji: "🏖️", cost: 12500 },
  { id: "rome", destination: "Rom", emoji: "🏛️", cost: 12500 },
  { id: "barcelona", destination: "Barcelona", emoji: "🎨", cost: 12500 },
  { id: "reykjavik", destination: "Reykjavík", emoji: "🌋", cost: 14000 },
  { id: "mallorca", destination: "Mallorca", emoji: "🏝️", cost: 16500 },
  { id: "grancanaria", destination: "Gran Canaria", emoji: "🌴", cost: 20000 },
  { id: "dubai", destination: "Dubai", emoji: "🕌", cost: 25000 },
  { id: "newyork", destination: "New York", emoji: "🗽", cost: 30000 },
  { id: "bangkok", destination: "Bangkok", emoji: "🛺", cost: 40000 },
  { id: "tokyo", destination: "Tokyo", emoji: "⛩️", cost: 45000 },
];
