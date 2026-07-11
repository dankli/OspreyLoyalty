// Wire shapes of contracts/member-events/*.schema.json, with a structural guard per
// event. The full JSON-Schema validation runs in the contract tests (AJV against the
// shared fixtures); at runtime a cheap shape check is enough to tell poison from valid.

export type TierChangedEvent = {
  eventId: string;
  memberId: string;
  previousTier: string;
  newTier: string;
  occurredAtUtc: string;
  correlationId?: string | null;
};

export type PointsExpiringSoonEvent = {
  eventId: string;
  memberId: string;
  points: number;
  expiresAtUtc: string;
  occurredAtUtc: string;
  correlationId?: string | null;
};

const TIERS = ["MEMBER", "SILVER", "GOLD", "DIAMOND", "OSPREY"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function parseTierChanged(payload: unknown): TierChangedEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!isNonEmptyString(p.eventId) || !isNonEmptyString(p.memberId)) return null;
  if (!isNonEmptyString(p.previousTier) || !TIERS.includes(p.previousTier)) return null;
  if (!isNonEmptyString(p.newTier) || !TIERS.includes(p.newTier)) return null;
  if (!isNonEmptyString(p.occurredAtUtc)) return null;
  return p as TierChangedEvent;
}

export function parsePointsExpiringSoon(payload: unknown): PointsExpiringSoonEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!isNonEmptyString(p.eventId) || !isNonEmptyString(p.memberId)) return null;
  if (typeof p.points !== "number" || !Number.isInteger(p.points) || p.points < 1) return null;
  if (!isNonEmptyString(p.expiresAtUtc) || !isNonEmptyString(p.occurredAtUtc)) return null;
  return p as PointsExpiringSoonEvent;
}
