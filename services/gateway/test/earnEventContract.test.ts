import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// PRODUCER-SIDE guard for the EarnEvent wire contract. The producer is services/partners
// (Java), but standing up a Java test rig just to assert the shape is heavier than it's
// worth at demo scale. Instead we make the shared JSON Schema the single source of truth and
// assert here that the canonical fixtures satisfy it. The CONSUMER side (services/members,
// EarnEventContractTests.cs) deserializes the same fixtures with its real options, so if
// partners' produced shape and members' consumed shape ever diverge, one side goes red.
// See docs/decisions/0014-contract-testing.md.

const contractsDir = new URL("../../../contracts/earn-event/", import.meta.url);
const schema = JSON.parse(readFileSync(new URL("earn-event.schema.json", contractsDir), "utf8"));
const full = JSON.parse(readFileSync(new URL("earn-event.full.json", contractsDir), "utf8"));
const minimal = JSON.parse(readFileSync(new URL("earn-event.minimal.json", contractsDir), "utf8"));

type Json = Record<string, unknown>;

// A tiny, dependency-free validator covering exactly what this schema uses:
// required, additionalProperties:false, and per-property type (incl. ["string","null"]
// unions and a date-time format check). Enough to guard the wire shape without pulling ajv.
function validate(schema: Json, value: Json): string[] {
  const errors: string[] = [];
  const props = schema.properties as Record<string, Json>;

  for (const req of (schema.required as string[]) ?? []) {
    if (!(req in value)) errors.push(`missing required field: ${req}`);
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in props)) errors.push(`unexpected field: ${key}`);
    }
  }

  for (const [key, spec] of Object.entries(props)) {
    if (!(key in value)) continue; // absent optional field is fine
    const v = value[key];
    const allowed = Array.isArray(spec.type) ? (spec.type as string[]) : [spec.type as string];
    if (!allowed.some((t) => matchesType(t, v))) {
      errors.push(`field ${key}: expected ${allowed.join("|")}, got ${describe(v)}`);
    }
    if (spec.format === "date-time" && typeof v === "string" && Number.isNaN(Date.parse(v))) {
      errors.push(`field ${key}: not a valid date-time: ${v}`);
    }
    if (spec.minLength != null && typeof v === "string" && v.length < (spec.minLength as number)) {
      errors.push(`field ${key}: shorter than minLength ${spec.minLength}`);
    }
  }

  return errors;
}

function matchesType(t: string, v: unknown): boolean {
  switch (t) {
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number";
    case "null":
      return v === null;
    case "object":
      return typeof v === "object" && v !== null && !Array.isArray(v);
    default:
      return false;
  }
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

// PRODUCER contract: the full fixture (every field) satisfies the shared schema.
test("EarnEvent full fixture satisfies the shared schema", () => {
  expect(validate(schema, full)).toEqual([]);
});

// Exercises ADR-0002: older payloads omit correlationId/authToken and still validate.
test("EarnEvent minimal fixture (required fields only) satisfies the schema", () => {
  expect(validate(schema, minimal)).toEqual([]);
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

// Guards the guard: the tiny validator must actually reject a broken shape.
test("EarnEvent validator rejects a broken shape", () => {
  const broken = { ...full, occurredAtUtc: 1720526400000, extra: "nope" } as Json;
  delete (broken as Json).memberId;
  const errors = validate(schema, broken);
  expect(errors).toContain("missing required field: memberId");
  expect(errors).toContain("unexpected field: extra");
  expect(errors.some((e) => e.startsWith("field occurredAtUtc"))).toBe(true);
});
