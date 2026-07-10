import { expect, test } from "vitest";
import { buildYoga } from "../src/server.js";
import { fakeDeps } from "./fakeDeps.js";

test("member query resolves through the members client", async () => {
  const yoga = buildYoga(fakeDeps({
    fetchMember: async () => ({
      id: "demo-ada", name: "Ada Lindqvist", email: "ada@example.com",
      tier: "SILVER", qualifyingPoints: 32000, spendablePoints: 14500,
      pointsToNextTier: 13000, benefits: ["Priority boarding"], joinedAtUtc: "2024-03-12T00:00:00Z",
    }),
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ member(id: "demo-ada") { name tier pointsToNextTier } }' }),
  });

  const body = await response.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.member).toEqual({ name: "Ada Lindqvist", tier: "SILVER", pointsToNextTier: 13000 });
});

test("unknown member resolves to null", async () => {
  const yoga = buildYoga(fakeDeps());
  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ member(id: "nope") { id } }' }),
  });
  expect((await response.json()).data.member).toBeNull();
});
