const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

export type Reward = {
  id: string;
  name: string;
  cost: number;
};

export async function fetchRewards(baseUrl: string, correlationId?: string): Promise<Reward[]> {
  const response = await fetch(`${baseUrl}/api/rewards`, {
    headers: { ...(correlationId ? { "x-correlation-id": correlationId } : {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return (await response.json()) as Reward[];
}
