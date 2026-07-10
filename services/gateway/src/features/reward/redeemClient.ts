import { z } from "zod";
import { t } from "../../i18n.js";

const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

export const RedemptionResultSchema = z.object({
  rewardId: z.string(),
  pointsSpent: z.number(),
  spendablePoints: z.number(),
  alreadyApplied: z.boolean(),
});

export type RedemptionResult = z.infer<typeof RedemptionResultSchema>;

// members' 400 body carries a localized { error } message.
const RejectionSchema = z.object({ error: z.string().optional() });

// The redemption rail. An applied result, or an EXPECTED refusal returned as a value — never
// thrown. The resolver pattern-matches this and maps a refusal onto a GraphQLError (the GraphQL
// edge, like members maps its outcomes onto HTTP status). Genuine upstream faults still throw.
export type RedemptionOutcome =
  | { ok: true; result: RedemptionResult }
  | { ok: false; reason: "not_found" | "rejected"; message: string };

export async function postRedemption(
  baseUrl: string,
  memberId: string,
  rewardId: string,
  idempotencyKey: string,
  correlationId?: string,
  authorization?: string,
  acceptLanguage?: string,
): Promise<RedemptionOutcome> {
  const response = await fetch(`${baseUrl}/api/members/${encodeURIComponent(memberId)}/redemptions`, {
    method: "POST",
    headers: {
      ...(correlationId ? { "x-correlation-id": correlationId } : {}),
      ...(authorization ? { authorization } : {}),
      // Forward the caller's language so members localizes its own 400 body.error.
      ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({ rewardId, idempotencyKey }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) return { ok: false, reason: "not_found", message: t("member_not_found", acceptLanguage) };
  if (response.status === 400) {
    const body = RejectionSchema.safeParse(await response.json());
    const message = body.success && body.data.error ? body.data.error : t("redemption_rejected", acceptLanguage);
    return { ok: false, reason: "rejected", message };
  }
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return { ok: true, result: RedemptionResultSchema.parse(await response.json()) };
}
