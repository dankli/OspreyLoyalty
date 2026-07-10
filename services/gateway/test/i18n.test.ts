import { afterEach, expect, test, vi } from "vitest";
import { pickLanguage, t } from "../src/i18n.js";
import { postRedemption } from "../src/features/reward/redeemClient.js";

afterEach(() => vi.unstubAllGlobals());

test("pickLanguage honours header order and falls back to English", () => {
  expect(pickLanguage(undefined)).toBe("en");
  expect(pickLanguage("")).toBe("en");
  expect(pickLanguage("sv-SE,sv;q=0.9,en;q=0.8")).toBe("sv");
  expect(pickLanguage("es-ES")).toBe("es");
  expect(pickLanguage("fr-FR")).toBe("en"); // unsupported → English
  expect(pickLanguage("fr,de;q=0.5")).toBe("de"); // first supported wins
});

test("t translates gateway-owned messages", () => {
  expect(t("member_not_found", "en")).toBe("Member not found.");
  expect(t("member_not_found", "sv-SE")).toBe("Medlemmen hittades inte.");
  expect(t("redemption_rejected", "de")).toBe("Einlösung abgelehnt.");
});

test("redeem 404 maps to a not_found outcome with a localized message", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  const outcome = await postRedemption("http://members", "nope", "lounge-pass", "key-1234567890", undefined, undefined, "sv");
  expect(outcome).toEqual({ ok: false, reason: "not_found", message: "Medlemmen hittades inte." });
});

test("redeem forwards Accept-Language downstream so members localizes its own 400", async () => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ error: "Otillräckliga poäng." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const outcome = await postRedemption("http://members", "demo-erik", "x", "key-1234567890", undefined, undefined, "sv-SE,sv;q=0.9");
  expect(outcome).toEqual({ ok: false, reason: "rejected", message: "Otillräckliga poäng." });

  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  expect((init.headers as Record<string, string>)["accept-language"]).toBe("sv-SE,sv;q=0.9");
});
