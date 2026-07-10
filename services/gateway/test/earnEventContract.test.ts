import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { expect, test } from "vitest";

// PRODUCER-SIDE guard for the EarnEvent wire contract. The producer is services/partners
// (Java), but standing up a Java test rig just to assert the shape is heavier than it's
// worth at demo scale. Instead we make the shared draft 2020-12 JSON Schema the single source
// of truth and assert here that the canonical fixtures satisfy it. The CONSUMER side (services/members,
// EarnEventContractTests.cs) deserializes the same fixtures with its real options, so if
// partners' produced shape and members' consumed shape ever diverge, one side goes red.
// See docs/decisions/0014-contract-testing.md.

const contractsDir = new URL("../../../contracts/earn-event/", import.meta.url);
const schema = JSON.parse(readFileSync(new URL("earn-event.schema.json", contractsDir), "utf8"));
const full = JSON.parse(readFileSync(new URL("earn-event.full.json", contractsDir), "utf8"));
const minimal = JSON.parse(readFileSync(new URL("earn-event.minimal.json", contractsDir), "utf8"));

type Json = Record<string, unknown>;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateEarnEvent = ajv.compile(schema);

function expectValid(value: unknown): void {
  expect(validateEarnEvent(value), ajv.errorsText(validateEarnEvent.errors)).toBe(true);
}

// PRODUCER contract: the full fixture (every field) satisfies the shared schema.
test("EarnEvent full fixture satisfies the shared schema", () => {
  expectValid(full);
});

// Exercises ADR-0002: older payloads omit correlationId/authToken and still validate.
test("EarnEvent minimal fixture (required fields only) satisfies the schema", () => {
  expectValid(minimal);
  expect("correlationId" in minimal).toBe(false);
  expect("authToken" in minimal).toBe(false);
});

// Pin the required set so nobody silently drops a field partners still sends or members needs.
test("EarnEvent required set is exactly what both sides agree on", () => {
  expect(schema.required).toEqual([
    "memberId",
    "partnerId",
    "amount",
    "rate",
    "idempotencyKey",
    "occurredAtUtc",
  ]);
});

// Guards the guard: the JSON Schema validator must actually reject a broken shape.
test("EarnEvent validator rejects a broken shape", () => {
  const broken = { ...full, occurredAtUtc: 1720526400000, extra: "nope" } as Json;
  delete broken.memberId;

  expect(validateEarnEvent(broken)).toBe(false);
  expect(validateEarnEvent.errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        keyword: "required",
        params: { missingProperty: "memberId" },
      }),
      expect.objectContaining({
        keyword: "additionalProperties",
        params: { additionalProperty: "extra" },
      }),
      expect.objectContaining({
        instancePath: "/occurredAtUtc",
        keyword: "type",
      }),
    ]),
  );
});
