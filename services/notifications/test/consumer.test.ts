import { describe, expect, it, vi } from "vitest";
import { createSeenSet, handleDelivery, type HandlerDeps } from "../src/consumer.js";
import type { Mail } from "../src/mailer.js";

function deps(overrides: Partial<HandlerDeps> = {}) {
  const sent: Mail[] = [];
  const base: HandlerDeps = {
    fetchMemberEmail: vi.fn(async () => "ada@example.com"),
    sendMail: vi.fn(async (mail: Mail) => {
      sent.push(mail);
    }),
    markSeen: createSeenSet(),
    log: { info: () => {}, warn: () => {} },
  };
  return { deps: { ...base, ...overrides }, sent };
}

const tierChanged = JSON.stringify({
  eventId: "tier-m-1-GOLD-abc",
  memberId: "m-1",
  previousTier: "SILVER",
  newTier: "GOLD",
  occurredAtUtc: "2026-07-11T09:30:00Z",
});

const pointsExpiring = JSON.stringify({
  eventId: "expiring-abc",
  memberId: "m-1",
  points: 6000,
  expiresAtUtc: "2026-08-10T00:00:00Z",
  occurredAtUtc: "2026-07-11T02:00:00Z",
});

describe("handleDelivery", () => {
  it("sends a tier mail and acks", async () => {
    const { deps: d, sent } = deps();

    const decision = await handleDelivery("tier.changed", Buffer.from(tierChanged), d);

    expect(decision).toBe("ack");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("ada@example.com");
    expect(sent[0]!.subject).toContain("GOLD");
    expect(sent[0]!.text).toContain("Congratulations");
  });

  it("a downgrade mail explains the rolling window instead of congratulating", async () => {
    const { deps: d, sent } = deps();
    const downgrade = JSON.stringify({
      eventId: "tier-m-1-MEMBER-20260711",
      memberId: "m-1",
      previousTier: "SILVER",
      newTier: "MEMBER",
      occurredAtUtc: "2026-07-11T02:00:00Z",
    });

    await handleDelivery("tier.changed", Buffer.from(downgrade), d);

    expect(sent[0]!.text).toContain("12-month window");
    expect(sent[0]!.text).not.toContain("Congratulations");
  });

  it("sends an expiry warning mail with points and date", async () => {
    const { deps: d, sent } = deps();

    const decision = await handleDelivery("points.expiring", Buffer.from(pointsExpiring), d);

    expect(decision).toBe("ack");
    expect(sent[0]!.subject).toContain("6000");
    expect(sent[0]!.subject).toContain("2026-08-10");
  });

  it("dedups redelivered events without a second mail", async () => {
    const { deps: d, sent } = deps();

    expect(await handleDelivery("tier.changed", Buffer.from(tierChanged), d)).toBe("ack");
    expect(await handleDelivery("tier.changed", Buffer.from(tierChanged), d)).toBe("ack");

    expect(sent).toHaveLength(1);
  });

  it("acks without mail when the member has no email (erased or unknown)", async () => {
    const { deps: d, sent } = deps({ fetchMemberEmail: async () => null });

    const decision = await handleDelivery("tier.changed", Buffer.from(tierChanged), d);

    expect(decision).toBe("ack");
    expect(sent).toHaveLength(0);
  });

  it("dead-letters non-JSON, unknown routing keys, and bad shapes", async () => {
    const { deps: d } = deps();

    expect(await handleDelivery("tier.changed", Buffer.from("not json"), d)).toBe("dead-letter");
    expect(await handleDelivery("mystery.key", Buffer.from(tierChanged), d)).toBe("dead-letter");
    expect(await handleDelivery("tier.changed", Buffer.from('{"eventId":"x"}'), d)).toBe("dead-letter");
    const badTier = JSON.stringify({
      eventId: "e", memberId: "m", previousTier: "PLATINUM", newTier: "GOLD",
      occurredAtUtc: "2026-07-11T00:00:00Z",
    });
    expect(await handleDelivery("tier.changed", Buffer.from(badTier), d)).toBe("dead-letter");
  });

  it("propagates transient failures so the wiring can requeue", async () => {
    const { deps: d } = deps({
      fetchMemberEmail: async () => {
        throw new Error("members responded 503");
      },
    });

    await expect(handleDelivery("tier.changed", Buffer.from(tierChanged), d)).rejects.toThrow("503");
  });
});
