import { expect, test } from "vitest";
import { buildYoga } from "../src/server.js";
import { fakeDeps } from "./fakeDeps.js";

test("transactions query resolves a page", async () => {
  const yoga = buildYoga(fakeDeps({
    fetchTransactions: async () => ({
      items: [{ id: "t1", type: "earn", points: 2000, source: "stayinn", occurredAtUtc: "2026-07-06T12:00:00Z" }],
      page: 0,
      hasMore: false,
    }),
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ transactions(memberId: "demo-ada") { items { type points source } page hasMore } }' }),
  });

  const body = await response.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.transactions).toEqual({
    items: [{ type: "earn", points: 2000, source: "stayinn" }],
    page: 0,
    hasMore: false,
  });
});
