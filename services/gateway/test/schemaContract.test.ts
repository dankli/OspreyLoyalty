import { readFileSync } from "node:fs";
import { buildSchema, findBreakingChanges } from "graphql";
import { expect, test } from "vitest";

// The gateway OWNS services/gateway/schema.graphql. The member-portal (and any other
// consumer) is coded against it, so a breaking change here breaks the frontend without
// the frontend's own tests ever noticing. This is the cheapest real contract test the
// gateway can own: snapshot the schema, and fail the build if the live schema removes or
// narrows anything the snapshot promised. Additive changes (new type, new nullable field,
// new optional arg) are fine and pass — see docs/decisions/0014-contract-testing.md.

const liveSdl = readFileSync(new URL("../schema.graphql", import.meta.url), "utf8");
const snapshotSdl = readFileSync(new URL("./schema.snapshot.graphql", import.meta.url), "utf8");

test("live schema parses", () => {
  expect(() => buildSchema(liveSdl)).not.toThrow();
});

test("live schema introduces no breaking change vs the committed snapshot", () => {
  const oldSchema = buildSchema(snapshotSdl);
  const newSchema = buildSchema(liveSdl);

  const breaking = findBreakingChanges(oldSchema, newSchema);

  // If this fails, you changed schema.graphql in a way that breaks the member-portal.
  // Either make the change additive, or (if intended) refresh test/schema.snapshot.graphql
  // in the same PR that migrates the consumers.
  expect(
    breaking,
    `Breaking GraphQL changes detected:\n${breaking.map((c) => `  - [${c.type}] ${c.description}`).join("\n")}`,
  ).toEqual([]);
});
