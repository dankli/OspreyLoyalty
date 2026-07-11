import type { Channel } from "amqplib";
import { parsePointsExpiringSoon, parseTierChanged } from "./events.js";
import { pointsExpiringMail, tierChangedMail, type SendMail } from "./mailer.js";

export const EXCHANGE = "member-events";
export const QUEUE = "notifications";
export const DEAD_QUEUE = "notifications.dead";
const DELIVERY_LIMIT = 5;

/** What the AMQP wiring should do with a delivery. */
export type Decision = "ack" | "dead-letter" | "requeue";

export type HandlerDeps = {
  /** Resolve the member's email; null when unknown or GDPR-erased. */
  fetchMemberEmail: (memberId: string) => Promise<string | null>;
  sendMail: SendMail;
  /** Dedup guard for at-least-once delivery; returns true the FIRST time an id is seen. */
  markSeen: (eventId: string) => boolean;
  log: { info: (o: object, msg: string) => void; warn: (o: object, msg: string) => void };
};

/**
 * Same delivery semantics as the members earn consumer: success, duplicate, or
 * known-unsendable (no email) → ack; malformed → dead-letter (retrying poison never
 * helps); transient failure (members down, SMTP down) → requeue, and the quorum
 * delivery limit dead-letters after 5 attempts.
 */
export async function handleDelivery(
  routingKey: string,
  body: Buffer,
  deps: HandlerDeps,
): Promise<Decision> {
  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf-8"));
  } catch {
    deps.log.warn({ routingKey }, "Poison member event (not JSON) — dead-lettering.");
    return "dead-letter";
  }

  const parsed = parseByRoutingKey(routingKey, payload);
  if (parsed === null) {
    deps.log.warn({ routingKey }, "Poison member event (unknown key or bad shape) — dead-lettering.");
    return "dead-letter";
  }
  const { event, composeMail } = parsed;

  if (!deps.markSeen(event.eventId)) {
    deps.log.info({ eventId: event.eventId }, "Duplicate member event — already handled.");
    return "ack";
  }

  const email = await deps.fetchMemberEmail(event.memberId);
  if (email === null) {
    // Unknown or GDPR-erased member: nothing to send, and retrying will not change that.
    deps.log.info({ eventId: event.eventId, memberId: event.memberId }, "No email for member — skipping.");
    return "ack";
  }

  await deps.sendMail(composeMail(email));
  deps.log.info(
    { eventId: event.eventId, memberId: event.memberId, type: routingKey, correlationId: event.correlationId ?? "-" },
    "Notification sent.",
  );
  return "ack";
}

type Parsed = {
  event: { eventId: string; memberId: string; correlationId?: string | null };
  composeMail: (to: string) => ReturnType<typeof tierChangedMail>;
};

function parseByRoutingKey(routingKey: string, payload: unknown): Parsed | null {
  if (routingKey === "tier.changed") {
    const event = parseTierChanged(payload);
    return event && { event, composeMail: (to) => tierChangedMail(to, event) };
  }
  if (routingKey === "points.expiring") {
    const event = parsePointsExpiringSoon(payload);
    return event && { event, composeMail: (to) => pointsExpiringMail(to, event) };
  }
  return null;
}

/** Bounded dedup memory: at-least-once tolerable for demo mail, so LRU-ish is enough. */
export function createSeenSet(capacity = 5_000): (eventId: string) => boolean {
  const seen = new Set<string>();
  return (eventId) => {
    if (seen.has(eventId)) return false;
    seen.add(eventId);
    if (seen.size > capacity) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
    return true;
  };
}

/**
 * Declared identically wherever needed (idempotent, startup order never matters):
 * quorum queue bound to the member-events topic exchange, dead-lettering to a plain
 * queue after the delivery limit — the earn-events topology, one exchange over.
 */
export async function declareTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
  await channel.assertQueue(DEAD_QUEUE, { durable: true });
  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: {
      "x-queue-type": "quorum",
      "x-delivery-limit": DELIVERY_LIMIT,
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": DEAD_QUEUE,
    },
  });
  await channel.bindQueue(QUEUE, EXCHANGE, "#");
}
