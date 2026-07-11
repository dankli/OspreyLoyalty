import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { parsePointsExpiringSoon, parseTierChanged } from "../src/events.js";

// Consumer side of the member-events contracts (ADR-0014 style): the shared schemas
// and fixtures under contracts/member-events are the single source of truth; the
// producer side lives in the members test suite.
const contractsDir = join(import.meta.dirname, "..", "..", "..", "contracts", "member-events");
const ajv = new Ajv2020.default({ strict: false });
addFormats.default(ajv);

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(contractsDir, name), "utf-8"));
}

describe("member-events contracts", () => {
  for (const [schemaFile, fixtures, parse] of [
    ["tier-changed.schema.json", ["tier-changed.full.json", "tier-changed.minimal.json"], parseTierChanged],
    [
      "points-expiring-soon.schema.json",
      ["points-expiring-soon.full.json", "points-expiring-soon.minimal.json"],
      parsePointsExpiringSoon,
    ],
  ] as const) {
    describe(schemaFile, () => {
      const validate = ajv.compile(load(schemaFile) as object);

      for (const fixture of fixtures) {
        it(`${fixture} validates and parses`, () => {
          const payload = load(fixture);
          expect(validate(payload), JSON.stringify(validate.errors)).toBe(true);
          expect(parse(payload)).not.toBeNull();
        });
      }
    });
  }

  it("the runtime guard rejects what the schema rejects", () => {
    expect(parseTierChanged({ eventId: "x" })).toBeNull();
    expect(parsePointsExpiringSoon({ eventId: "x", memberId: "m", points: 0.5 })).toBeNull();
  });
});
