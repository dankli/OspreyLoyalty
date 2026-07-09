# ADR-0014: Contract testing across the service seams

**Status:** accepted

## Context

This is a polyglot fleet: a TypeScript/Node gateway, a C#/.NET members service, a Java partners service, and a Rust points-engine. The interesting failures in a system like this are not inside a service — each has its own unit and integration tests — but *between* services, where no single compiler or test suite sees both sides. Three seams carry real breakage risk:

1. **The GraphQL schema the gateway owns** (`services/gateway/schema.graphql`). The member-portal micro-frontend is coded against it. Removing a type, dropping a field, or making a nullable field non-null breaks the frontend at runtime, and the frontend's own tests never notice — the break lives in the gateway's repo, not theirs.
2. **The `EarnEvent` message on the `earn-events` queue.** Partners (Java) produces it; members (C#) consumes it off RabbitMQ. There is no shared build, no shared type — both sides carry a hand-maintained record and a "keep in sync by hand" comment. A rename, a reordered optional field, or a date-format change on one side is invisible until a purchase silently fails to earn in production.
3. **gateway → members REST** (`membersClient` and friends). Already covered by the gateway's client tests, which stub `fetch` with the exact JSON members returns; those are consumer-side contract tests in all but name.

At demo scale the question is not *whether* to test these seams but how much machinery is justified. A full Pact broker — a running service, published pacts, provider verification jobs, versioning and can-i-deploy gates — is real operational weight for a demo and a classic source of flaky, environment-dependent CI. The honest line is: test the two seams that have no shared type (schema and message), cheaply, in the repos that own them, with no extra infrastructure.

## Decision

Two additive, infrastructure-free contract tests, both wired into a dedicated CI workflow.

**1. GraphQL schema breaking-change guard (gateway owns it).** A committed snapshot of the schema (`services/gateway/test/schema.snapshot.graphql`) plus a vitest test (`schemaContract.test.ts`) that runs `graphql`'s `findBreakingChanges(oldSchema, newSchema)` between the snapshot and the live `schema.graphql`. Additive changes (new type, new nullable field, new optional argument) pass. A breaking change fails the build with the specific change listed, and the fix is deliberate: either make the change additive, or refresh the snapshot *in the same PR that migrates the consumers*. This is the cheapest real contract test the gateway can own, and it needs nothing running.

**2. `EarnEvent` message contract with a shared fixture as the single source of truth.** One JSON Schema plus two canonical example fixtures live in a top-level `contracts/earn-event/` directory, deliberately outside any one service so neither owns it:

- `earn-event.schema.json` — the wire shape (draft 2020-12).
- `earn-event.full.json` — every field populated.
- `earn-event.minimal.json` — required fields only, exercising the ADR-0002 additive convention (older payloads omit `correlationId`/`authToken`).

Both sides are pinned to those fixtures:

- **Consumer (members, C#):** `EarnEventContractTests.cs` deserializes both fixtures with the *same* `JsonSerializerDefaults.Web` options the live `ConsumeEarnEvents.Consumer` uses, and asserts every field maps — including that the minimal fixture binds with the optional trailing fields defaulting to null, and that an epoch-number date is rejected (partners serializes ISO-8601 strings). The fixtures are copied next to the test assembly via a `<Content>` link in the csproj.
- **Producer (partners, Java):** validated indirectly. A JS test in the gateway (`earnEventContract.test.ts`) validates both fixtures against the schema, pinning the required set and the camelCase shape. A JS check is chosen over a new Java test rig because it is far lighter and guards exactly the shape the schema promises; partners' `Jackson2JsonMessageConverter` already emits camelCase component names and ISO-8601 dates, which is the shape the schema encodes.

The fixture is the contract. If partners' produced shape and members' consumed shape ever diverge, one of the two tests goes red, because both are pinned to the same file.

**Why not a full Pact / provider-verification setup.** A broker plus provider verification would need members and partners running (or realistically stubbed) in CI, published pact artifacts, and can-i-deploy gating — operational weight and flakiness that buys little at demo scale over a shared fixture that both sides deserialize with their real options. The shared-fixture approach gives the same "producer and consumer agree" guarantee for the message seam without a broker, and the schema-diff guard gives the same "consumer isn't broken" guarantee for the GraphQL seam without provider verification. The gateway→members REST seam already has consumer-side stub tests (`membersClient.test.ts` et al.), so no additional Pact layer is added there.

## Alternatives considered

**Consumer-driven Pact (`@pact-foundation/pact`) for gateway → members.** Would generate a pact file on the consumer side and verify it on the provider. Rejected for this repo: the gateway's existing `fetch`-stub client tests already assert the same request/response contract, and a broker-backed verification loop is the flaky, heavy machinery this ADR is explicitly avoiding at demo scale. Revisit if the REST surface grows or a third consumer appears.

**A Java producer test asserting the serialized `EarnEvent` bytes.** The most direct producer-side check, but it means adding and maintaining a serialization test in the Java build purely to compare against the fixture. The JS-validates-the-schema approach covers the same shape guarantee for less, given partners' Jackson config is already camelCase + ISO dates. Worth adding later if the Java side's serialization config becomes non-trivial.

**Generating the members/partners records from the JSON Schema.** Would make the fixture the literal source of the types, eliminating hand-sync. Heavy codegen plumbing across two languages for two small records; the hand-maintained records with a pinned shared fixture and red-on-drift tests are the pragmatic demo answer.

## Consequences

- Two new fast tests with no runtime dependencies: `schemaContract.test.ts` (2 tests) and `earnEventContract.test.ts` (4 tests) in the gateway, and `EarnEventContractTests.cs` (3 tests) in members. All run in the existing `npm test` / `dotnet test` flows and in the new `contract-tests.yml` workflow.
- The schema snapshot must be refreshed deliberately when the schema changes intentionally — the guard failing is the feature, not friction. The failure message lists the exact breaking change.
- The `contracts/earn-event/` fixtures are the single source of truth for the message wire shape. Both services' hand-maintained records now have an executable check that they still agree, replacing "keep in sync by hand" with "red on drift."
- The producer side (partners) is guarded via the schema, not via a Java test. This is honest about being demo-scale: the schema pins the shape partners must emit, but a bug in partners' *own* serialization config that still matched the schema would not be caught here. Adding a Java serialization test is the documented next step if that risk grows.
- The `contract-tests.yml` workflow is **blocking** (no `continue-on-error`): all three tests run without external services, so they are reliably green and there is no reason to weaken the signal.
