import { z } from "zod";

const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

export const RewardSchema = z.object({
  id: z.string(),
  name: z.string(),
  cost: z.number(),
});

export type Reward = z.infer<typeof RewardSchema>;

export async function fetchRewards(baseUrl: string, correlationId?: string, authorization?: string, acceptLanguage?: string): Promise<Reward[]> {
  const response = await fetch(`${baseUrl}/api/rewards`, {
    headers: { ...(correlationId ? { "x-correlation-id": correlationId } : {}), ...(authorization ? { authorization } : {}), ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return z.array(RewardSchema).parse(await response.json()); // trust boundary — validate, don't cast
}
