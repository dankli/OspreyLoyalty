import { afterEach, expect, test } from "vitest";
import { strings, currentLocale, formatNumber } from "../src/strings";

afterEach(() => localStorage.removeItem("lang"));

test("defaults to English when no language has been chosen", () => {
  expect(currentLocale()).toBe("en");
  expect(strings.title).toBe("Route Explorer");
});

test("resolves the fleet's localStorage lang switch at access time", () => {
  localStorage.setItem("lang", "sv");
  expect(strings.title).toBe("Ruttutforskaren");
  expect(strings.tabMap).toBe("Karta");
  localStorage.setItem("lang", "de");
  expect(strings.tabMap).toBe("Karte");
});

test("an unknown locale falls back to English", () => {
  localStorage.setItem("lang", "xx");
  expect(strings.title).toBe("Route Explorer");
});

test("numbers format per the active locale", () => {
  localStorage.setItem("lang", "de");
  expect(formatNumber(8187)).toBe("8.187");
});
