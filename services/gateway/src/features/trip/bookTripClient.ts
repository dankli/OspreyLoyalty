import { z } from "zod";
import { t } from "../../i18n.js";

const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

export const TripRedemptionResultSchema = z.object({
  fromIata: z.string(),
  toIata: z.string(),
  pointsSpent: z.number(),
  spendablePoints: z.number(),
  alreadyApplied: z.boolean(),
});

export type TripRedemptionResult = z.infer<typeof TripRedemptionResultSchema>;

// members' 400 body carries a localized { error } message.
const RejectionSchema = z.object({ error: z.string().optional() });

// Same rail shape as postRedemption: applied, or an EXPECTED refusal as a value.
export type TripRedemptionOutcome =
  | { ok: true; result: TripRedemptionResult }
  | { ok: false; reason: "not_found" | "rejected"; message: string };

/**
 * The POINTS PRICE never comes from the browser: the bookTrip resolver re-runs the
 * route search and passes its server-side estimate here.
 */
export async function postTripRedemption(
  baseUrl: string,
  memberId: string,
  fromIata: string,
  toIata: string,
  points: number,
  idempotencyKey: string,
  correlationId?: string,
  authorization?: string,
  acceptLanguage?: string,
): Promise<TripRedemptionOutcome> {
  const response = await fetch(`${baseUrl}/api/members/${encodeURIComponent(memberId)}/trip-redemptions`, {
    method: "POST",
    headers: {
      ...(correlationId ? { "x-correlation-id": correlationId } : {}),
      ...(authorization ? { authorization } : {}),
      // Forward the caller's language so members localizes its own 400 body.error.
      ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({ fromIata, toIata, points, idempotencyKey }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) return { ok: false, reason: "not_found", message: t("member_not_found", acceptLanguage) };
  if (response.status === 400) {
    const body = RejectionSchema.safeParse(await response.json());
    const message = body.success && body.data.error ? body.data.error : t("redemption_rejected", acceptLanguage);
    return { ok: false, reason: "rejected", message };
  }
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return { ok: true, result: TripRedemptionResultSchema.parse(await response.json()) };
}
