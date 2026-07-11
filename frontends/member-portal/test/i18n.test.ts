import { describe, expect, it, vi } from "vitest";
import i18n from "../src/i18n";

describe("i18n locale broadcast (ADR-0023)", () => {
  it("follows the shell's osprey:locale-changed event", async () => {
    window.dispatchEvent(new CustomEvent("osprey:locale-changed", { detail: { locale: "sv" } }));
    await vi.waitFor(() => expect(i18n.language).toBe("sv"));

    // Back to English so other suites' asserted strings stay stable.
    window.dispatchEvent(new CustomEvent("osprey:locale-changed", { detail: { locale: "en" } }));
    await vi.waitFor(() => expect(i18n.language).toBe("en"));
  });

  it("ignores unknown locales", () => {
    window.dispatchEvent(new CustomEvent("osprey:locale-changed", { detail: { locale: "xx" } }));
    expect(i18n.language).toBe("en");
  });
});
