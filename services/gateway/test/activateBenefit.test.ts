import { expect, test } from "vitest";
import { buildYoga } from "../src/server.js";
import { fakeDeps } from "./fakeDeps.js";

const MUTATION = `mutation {
  activateBenefit(memberId: "demo-ada", benefit: "Priority boarding", idempotencyKey: "benefit-key-0001") {
    benefit code activatedAtUtc alreadyApplied
  }
}`;

async function post(yoga: ReturnType<typeof buildYoga>, query: string) {
  const response = await yoga.fetch("http://gateway/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

test("activateBenefit returns the minted code", async () => {
  const yoga = buildYoga(fakeDeps({
    postBenefitActivation: async (_url, _memberId, benefit) => ({
      ok: true,
      result: { benefit, code: "KLMNPQRS", activatedAtUtc: "2026-07-11T12:00:00Z", alreadyApplied: false },
    }),
  }));

  const body = await post(yoga, MUTATION);

  expect(body.errors).toBeUndefined();
  expect(body.data.activateBenefit).toEqual({
    benefit: "Priority boarding",
    code: "KLMNPQRS",
    activatedAtUtc: "2026-07-11T12:00:00Z",
    alreadyApplied: false,
  });
});

test("a tier the member lacks surfaces members' localized refusal", async () => {
  const yoga = buildYoga(fakeDeps({
    postBenefitActivation: async () => ({
      ok: false,
      reason: "rejected",
      message: "The member's tier does not include that benefit.",
    }),
  }));

  const body = await post(yoga, MUTATION);

  expect(body.errors?.[0]?.message).toBe("The member's tier does not include that benefit.");
});

test("benefitActivations lists the member's codes", async () => {
  const yoga = buildYoga(fakeDeps({
    fetchBenefitActivations: async () => [
      { benefit: "Lounge access", code: "ABCDEFGH", activatedAtUtc: "2026-07-10T09:00:00Z", alreadyApplied: false },
    ],
  }));

  const body = await post(yoga, `{ benefitActivations(memberId: "demo-ada") { benefit code } }`);

  expect(body.errors).toBeUndefined();
  expect(body.data.benefitActivations).toEqual([{ benefit: "Lounge access", code: "ABCDEFGH" }]);
});
