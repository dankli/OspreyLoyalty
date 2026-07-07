import { expect, test } from "vitest";
import { buildYoga } from "../src/server.js";

const ada = {
  id: "demo-ada", name: "Ada Lindqvist", email: "ada@example.com",
  tier: "SILVER", qualifyingPoints: 32000, spendablePoints: 14500,
  pointsToNextTier: 13000, benefits: ["Priority boarding"], joinedAtUtc: "2024-03-12T00:00:00Z",
};
const partners = [{ id: "cardco", name: "CardCo", rate: 0.5 }];
const emptyTransactions = async () => ({ items: [], page: 0, hasMore: false });
const stubRewards = async () => [];
const stubRedemption = async (): Promise<never> => { throw new Error("not used"); };

test("dashboard fans out to members and partners", async () => {
  const yoga = buildYoga({
    fetchMember: async () => ada,
    fetchPartners: async () => partners,
    fetchTransactions: emptyTransactions,
    fetchRewards: stubRewards,
    postRedemption: stubRedemption,
  });

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

test("partners outage surfaces as a GraphQL error, not a crash", async () => {
  const yoga = buildYoga({
    fetchMember: async () => ada,
    fetchPartners: async () => { throw new Error("partners service responded 500"); },
    fetchTransactions: emptyTransactions,
    fetchRewards: stubRewards,
    postRedemption: stubRedemption,
  });

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ dashboard(memberId: "demo-ada") { partners { id } } }' }),
  });

  const body = await response.json();
  expect(body.errors).toBeDefined();
});
