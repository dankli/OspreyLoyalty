import { expect, test } from "vitest";
import { filterTransactions, type TransactionItem } from "../src/features/transactions/filterTransactions";

const items: TransactionItem[] = [
  { id: "1", type: "earn", points: 2000, source: "stayinn", occurredAtUtc: "2026-07-01T10:00:00Z" },
  { id: "2", type: "burn", points: -500, source: "rewards", occurredAtUtc: "2026-07-02T10:00:00Z" },
  { id: "3", type: "earn", points: 100, source: "cardco", occurredAtUtc: "2026-07-03T10:00:00Z" },
];

test("all passes everything through", () => {
  expect(filterTransactions(items, "all")).toHaveLength(3);
});

test("filtering by type keeps only that type", () => {
  expect(filterTransactions(items, "earn").map((t) => t.id)).toEqual(["1", "3"]);
  expect(filterTransactions(items, "burn").map((t) => t.id)).toEqual(["2"]);
});

test("unknown type yields empty, not a crash", () => {
  expect(filterTransactions(items, "expiry")).toEqual([]);
});
