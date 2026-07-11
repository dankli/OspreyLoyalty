import { expect, test } from "vitest";
import { buildYoga } from "../src/server.js";
import { fakeDeps } from "./fakeDeps.js";

const ada = {
  id: "demo-ada", name: "Ada Lindqvist", email: "ada@example.com",
  tier: "SILVER", qualifyingPoints: 32000, spendablePoints: 14500,
  pointsToNextTier: 13000, benefits: ["Priority boarding"], joinedAtUtc: "2024-03-12T00:00:00Z",
};
const partners = [{ id: "cardco", name: "CardCo", rate: 0.5 }];

test("dashboard fans out to members and partners", async () => {
  const yoga = buildYoga(fakeDeps({
    fetchMember: async () => ada,
    fetchPartners: async () => partners,
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ dashboard(memberId: "demo-ada") { member { name tier } partners { id rate } } }' }),
  });

  const body = await response.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.dashboard).toEqual({
    member: { name: "Ada Lindqvist", tier: "SILVER" },
    partners: [{ id: "cardco", rate: 0.5 }],
  });
});

test("a partners outage degrades that section instead of failing the dashboard", async () => {
  const yoga = buildYoga(fakeDeps({
    fetchMember: async () => ada,
    fetchPartners: async () => { throw new Error("partners service responded 500"); },
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ dashboard(memberId: "demo-ada") { member { name } partners { id } degraded } }' }),
  });

  const body = await response.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.dashboard).toEqual({
    member: { name: "Ada Lindqvist" },
    partners: [],
    degraded: ["partners"],
  });
});

test("a healthy dashboard reports nothing degraded", async () => {
  const yoga = buildYoga(fakeDeps({
    fetchMember: async () => ada,
    fetchPartners: async () => partners,
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ dashboard(memberId: "demo-ada") { degraded } }' }),
  });

  const body = await response.json();
  expect(body.data.dashboard.degraded).toEqual([]);
});
