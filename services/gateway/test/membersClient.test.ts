import { afterEach, expect, test, vi } from "vitest";
import { fetchMember } from "../src/features/member/membersClient.js";

afterEach(() => vi.unstubAllGlobals());

test("maps a members-service profile to a Member", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({
      id: "demo-ada", name: "Ada Lindqvist", email: "ada@example.com",
      tier: "SILVER", qualifyingPoints: 32000, spendablePoints: 14500,
      pointsToNextTier: 13000, benefits: ["Priority boarding"], joinedAtUtc: "2024-03-12T00:00:00Z",
    }), { status: 200, headers: { "content-type": "application/json" } })));

  const member = await fetchMember("http://members", "demo-ada");
  expect(member?.tier).toBe("SILVER");
  expect(member?.pointsToNextTier).toBe(13000);
});

test("404 from members means null, not an error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  expect(await fetchMember("http://members", "nope")).toBeNull();
});

test("5xx from members throws", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
  await expect(fetchMember("http://members", "demo-ada")).rejects.toThrow("members service responded 500");
});

test("a drifted members shape is rejected, not passed through", async () => {
  // zod is the trust boundary: a 200 whose body is missing required fields must fail loudly here.
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ id: "x", name: "No Tier Here" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
  await expect(fetchMember("http://members", "x")).rejects.toThrow();
});
