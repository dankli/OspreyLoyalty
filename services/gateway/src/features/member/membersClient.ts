import { z } from "zod";

const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

// The wire shape members returns. Parsing (not casting) makes this a trust boundary: a drifted or
// malformed upstream body fails loudly here instead of flowing on as an unchecked value. The Member
// type is inferred from the schema, so the schema is the single source of truth.
export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  tier: z.string(),
  qualifyingPoints: z.number(),
  spendablePoints: z.number(),
  pointsToNextTier: z.number().nullable(),
  benefits: z.array(z.string()),
  joinedAtUtc: z.string(),
});

export type Member = z.infer<typeof MemberSchema>;

export async function fetchMember(baseUrl: string, id: string, correlationId?: string, authorization?: string, acceptLanguage?: string): Promise<Member | null> {
  const response = await fetch(`${baseUrl}/api/members/${encodeURIComponent(id)}`, {
    headers: { ...(correlationId ? { "x-correlation-id": correlationId } : {}), ...(authorization ? { authorization } : {}), ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) return null; // not found is a value on the happy rail, not an error
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return MemberSchema.parse(await response.json()); // throws on a drifted upstream shape
}
