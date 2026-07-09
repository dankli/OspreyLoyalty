import { expect, test } from "vitest";
import { handleTravelAgentStream } from "../src/features/travel-agent/stream.js";
import type { Member } from "../src/features/member/membersClient.js";

const ada: Member = {
  id: "demo-ada", name: "Ada", email: "ada@example.com", tier: "SILVER",
  qualifyingPoints: 32000, spendablePoints: 14500, pointsToNextTier: null,
  benefits: [], joinedAtUtc: "2024-03-12T00:00:00Z",
};

// A minimal ServerResponse stub that records everything written.
function fakeRes() {
  const chunks: string[] = [];
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    ended: false,
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; },
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      for (const [k, v] of Object.entries(headers ?? {})) this.headers[k.toLowerCase()] = v;
      return this;
    },
    write(chunk: string) { chunks.push(String(chunk)); return true; },
    end(chunk?: string) { if (chunk) chunks.push(String(chunk)); this.ended = true; },
    body() { return chunks.join(""); },
  };
}
const fakeReq = (url: string) => ({ url, headers: {} as Record<string, string> });

test("streams meta, tokens, suggestions and done for an affordable member", async () => {
  const res = fakeRes();
  await handleTravelAgentStream(
    fakeReq("/travel-agent/stream?memberId=demo-ada&lang=en") as never,
    res as never,
    { membersUrl: "http://members", delayMs: 0, fetchMember: async () => ada },
  );
  const out = res.body();
  expect(res.headers["content-type"]).toBe("text/event-stream");
  expect(res.headers["x-accel-buffering"]).toBe("no");
  expect(out).toContain("event: meta");
  expect(out).toContain('"spendablePoints":14500');
  expect(out).toContain("event: token");
  expect(out).toContain("event: suggestion");
  expect(out).toContain("Mallorca"); // the goal trip
  expect(out).toContain('"affordable":true');
  expect(out).toMatch(/event: done/);
  expect(res.ended).toBe(true);
});

test("emits a single error event when the member is unknown", async () => {
  const res = fakeRes();
  await handleTravelAgentStream(
    fakeReq("/travel-agent/stream?memberId=nope&lang=en") as never,
    res as never,
    { membersUrl: "http://members", delayMs: 0, fetchMember: async () => null },
  );
  expect(res.body()).toContain("event: error");
  expect(res.body()).not.toContain("event: suggestion");
  expect(res.ended).toBe(true);
});

test("emits an error event when the members fetch throws", async () => {
  const res = fakeRes();
  await handleTravelAgentStream(
    fakeReq("/travel-agent/stream?memberId=demo-ada&lang=en") as never,
    res as never,
    { membersUrl: "http://members", delayMs: 0, fetchMember: async () => { throw new Error("down"); } },
  );
  expect(res.body()).toContain("event: error");
  expect(res.ended).toBe(true);
});
