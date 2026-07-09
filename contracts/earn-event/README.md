# EarnEvent contract fixtures

Shared, single-source-of-truth fixtures for the `earn-events` queue message.

- **Producer:** `services/partners` — Java record `com.ospreyloyalty.partners.purchases.EarnEvent`, serialized by Spring AMQP's `Jackson2JsonMessageConverter` (camelCase component names, ISO-8601 dates because `WRITE_DATES_AS_TIMESTAMPS` is disabled).
- **Consumer:** `services/members` — `ApplyEarn.EarnEvent`, deserialized with `JsonSerializerDefaults.Web` (camelCase, case-insensitive, trailing optional fields default to `null`).

Files:

- `earn-event.schema.json` — JSON Schema (draft 2020-12) describing the wire shape.
- `earn-event.full.json` — canonical example with every field populated.
- `earn-event.minimal.json` — only the required fields, exercising the ADR-0002 additive convention (older payloads omit `correlationId` / `authToken`).

Who checks what:

- **Producer side (gateway JS test)** validates both fixtures against the schema — `services/gateway/test/earnEventContract.test.ts`. (A JS test is cheaper than adding a Java test rig; it guards the shape the schema promises.)
- **Consumer side (members C# test)** deserializes both fixtures with the real `JsonSerializerDefaults.Web` options and asserts every field maps — `services/members/Osprey.Members.Tests/EarnEventContractTests.cs`.

If the two services' shapes ever diverge, one of these tests goes red. See `docs/decisions/0014-contract-testing.md`.
