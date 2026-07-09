import { t } from "../../i18n.js";

const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

export type RedemptionResult = {
  rewardId: string;
  pointsSpent: number;
  spendablePoints: number;
  alreadyApplied: boolean;
};

export async function postRedemption(
  baseUrl: string,
  memberId: string,
  rewardId: string,
  idempotencyKey: string,
  correlationId?: string,
  authorization?: string,
  acceptLanguage?: string,
): Promise<RedemptionResult> {
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
  if (response.status === 404) throw new Error(t("member_not_found", acceptLanguage));
  if (response.status === 400) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? t("redemption_rejected", acceptLanguage));
  }
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return (await response.json()) as RedemptionResult;
}
