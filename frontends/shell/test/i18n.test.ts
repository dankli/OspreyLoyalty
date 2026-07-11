import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_LABELS, SUPPORTED_LOCALES, currentLocale, setLocale, t } from "../src/i18n";

describe("shell i18n", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("supports five locales with native labels", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "sv", "es", "de", "it"]);
    expect(LOCALE_LABELS.sv).toBe("Svenska");
    expect(t("language")).toBe("Language");
  });

  it("setLocale persists the choice and broadcasts osprey:locale-changed", () => {
    const heard = vi.fn();
    window.addEventListener("osprey:locale-changed", heard, { once: true });

    setLocale("sv");

    expect(localStorage.getItem("lang")).toBe("sv");
    expect(heard).toHaveBeenCalledOnce();
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ locale: "sv" });
    expect(currentLocale()).toBe("sv");
    expect(t("language")).toBe("Språk");
  });

  it("ignores unknown locales", () => {
    const heard = vi.fn();
    window.addEventListener("osprey:locale-changed", heard, { once: true });

    setLocale("xx" as never);

    expect(localStorage.getItem("lang")).toBeNull();
    expect(heard).not.toHaveBeenCalled();
  });
});
