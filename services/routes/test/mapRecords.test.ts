import { expect, test } from "vitest";
import { zipCarriers } from "../src/features/airports/mapRecords.js";

test("zips parallel carrier arrays back into objects", () => {
  expect(zipCarriers(["VT", "AH"], ["Air Tahiti", "Air Algerie"])).toEqual([
    { iata: "VT", name: "Air Tahiti" },
    { iata: "AH", name: "Air Algerie" },
  ]);
});

test("empty carrier arrays zip to an empty list", () => {
  expect(zipCarriers([], [])).toEqual([]);
});

test("mismatched lengths zip to the shorter side rather than fabricating entries", () => {
  expect(zipCarriers(["VT", "AH"], ["Air Tahiti"])).toEqual([{ iata: "VT", name: "Air Tahiti" }]);
});
