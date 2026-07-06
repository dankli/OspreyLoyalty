export type TransactionItem = {
  id: string;
  type: string;
  points: number;
  source: string;
  occurredAtUtc: string;
};

export type TransactionFilter = "all" | "earn" | "burn" | "expiry" | "adjustment";

export function filterTransactions(items: TransactionItem[], filter: string): TransactionItem[] {
  if (filter === "all") return items;
  return items.filter((item) => item.type === filter);
}
