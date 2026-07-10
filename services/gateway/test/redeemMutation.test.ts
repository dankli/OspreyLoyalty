import { expect, test } from "vitest";
import { buildYoga } from "../src/server.js";
import { fakeDeps } from "./fakeDeps.js";

test("rewards query resolves the catalog", async () => {
  const yoga = buildYoga(fakeDeps({
    fetchRewards: async () => [{ id: "lounge-pass", name: "Lounge day pass", cost: 15000 }],
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ rewards { id cost } }" }),
  });
  const body = await response.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.rewards).toEqual([{ id: "lounge-pass", cost: 15000 }]);
});

test("redeem mutation returns the redemption result", async () => {
  const yoga = buildYoga(fakeDeps({
    postRedemption: async () => ({
      ok: true, result: { rewardId: "lounge-pass", pointsSpent: 15000, spendablePoints: 36000, alreadyApplied: false },
    }),
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: 'mutation { redeem(memberId: "demo-yusra", rewardId: "lounge-pass", idempotencyKey: "key-1234567890") { pointsSpent spendablePoints alreadyApplied } }',
    }),
  });
  const body = await response.json();
  expect(body.errors).toBeUndefined();
  expect(body.data.redeem).toEqual({ pointsSpent: 15000, spendablePoints: 36000, alreadyApplied: false });
});

test("insufficient balance surfaces the members error message", async () => {
  const yoga = buildYoga(fakeDeps({
    postRedemption: async () => ({ ok: false, reason: "rejected", message: "Insufficient spendable points." }),
  }));

  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: 'mutation { redeem(memberId: "demo-erik", rewardId: "upgrade-voucher", idempotencyKey: "key-1234567890") { pointsSpent } }',
    }),
  });
  const body = await response.json();
  expect(body.errors?.[0]?.message).toContain("Insufficient spendable points");
});
