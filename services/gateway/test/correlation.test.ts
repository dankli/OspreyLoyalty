import { afterEach, expect, test, vi } from "vitest";
import { resolveCorrelationId } from "../src/correlation.js";
import { fetchMember } from "../src/features/member/membersClient.js";

afterEach(() => vi.unstubAllGlobals());

test("accepts an incoming id and generates when absent", () => {
  expect(resolveCorrelationId(new Headers({ "x-correlation-id": "abc-123" }))).toBe("abc-123");
  const generated = resolveCorrelationId(new Headers());
  expect(generated).toMatch(/^[0-9a-f]{32}$/);
});

test("the members call carries the correlation id downstream", async () => {
  const seen: Record<string, string> = {};
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
    for (const [k, v] of Object.entries((init?.headers as Record<string, string>) ?? {})) seen[k.toLowerCase()] = v;
    return new Response(null, { status: 404 });
  }));

  await fetchMember("http://members", "demo-ada", "corr-42");
  expect(seen["x-correlation-id"]).toBe("corr-42");
});
