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
): Promise<RedemptionResult> {
  const response = await fetch(`${baseUrl}/api/members/${encodeURIComponent(memberId)}/redemptions`, {
    method: "POST",
    headers: { ...(correlationId ? { "x-correlation-id": correlationId } : {}), "content-type": "application/json" },
    body: JSON.stringify({ rewardId, idempotencyKey }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) throw new Error("Member not found.");
  if (response.status === 400) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "Redemption rejected.");
  }
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return (await response.json()) as RedemptionResult;
}
