import nodemailer from "nodemailer";
import { env } from "./env.js";
import type { PointsExpiringSoonEvent, TierChangedEvent } from "./events.js";

export type Mail = { to: string; subject: string; text: string };
export type SendMail = (mail: Mail) => Promise<void>;

/** SMTP transport aimed at Mailpit in the demo stack; any SMTP URL works. */
export function createSmtpSender(): SendMail {
  const transport = nodemailer.createTransport(env.smtpUrl);
  return async (mail) => {
    await transport.sendMail({ from: env.mailFrom, ...mail });
  };
}

// English-only bodies: the member's UI language is a browser-side choice the backend
// never sees (ADR-0023/0024) — a stored contact-language preference would be the
// follow-up that unlocks localized mail.

export function tierChangedMail(to: string, event: TierChangedEvent): Mail {
  const upgraded = tierRank(event.newTier) > tierRank(event.previousTier);
  return {
    to,
    subject: `Your Osprey Loyalty tier is now ${event.newTier}`,
    text: upgraded
      ? `Congratulations! You have moved up from ${event.previousTier} to ${event.newTier}. ` +
        `Your new benefits are waiting in the member portal.`
      : `Your tier has changed from ${event.previousTier} to ${event.newTier} because your ` +
        `qualifying points aged out of the rolling 12-month window. Earn with our partners ` +
        `to climb back up — your points balance is untouched.`,
  };
}

export function pointsExpiringMail(to: string, event: PointsExpiringSoonEvent): Mail {
  const date = event.expiresAtUtc.slice(0, 10);
  return {
    to,
    subject: `${event.points} Osprey points expire on ${date}`,
    text:
      `Heads up: ${event.points} of your points expire on ${date}. ` +
      `Redeem them for rewards in the member portal before they lapse.`,
  };
}

function tierRank(tier: string): number {
  return ["MEMBER", "SILVER", "GOLD", "DIAMOND", "OSPREY"].indexOf(tier);
}
