const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

export type Member = {
  id: string;
  name: string;
  email: string;
  tier: string;
  qualifyingPoints: number;
  spendablePoints: number;
  pointsToNextTier: number | null;
  benefits: string[];
  joinedAtUtc: string;
};

export async function fetchMember(baseUrl: string, id: string): Promise<Member | null> {
  const response = await fetch(`${baseUrl}/api/members/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return (await response.json()) as Member;
}
