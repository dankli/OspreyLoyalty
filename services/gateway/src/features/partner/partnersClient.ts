import { z } from "zod";

const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

export const PartnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  rate: z.number(),
});

export type Partner = z.infer<typeof PartnerSchema>;

export async function fetchPartners(baseUrl: string, correlationId?: string, authorization?: string, acceptLanguage?: string): Promise<Partner[]> {
  const response = await fetch(`${baseUrl}/partners`, {
    headers: { ...(correlationId ? { "x-correlation-id": correlationId } : {}), ...(authorization ? { authorization } : {}), ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`partners service responded ${response.status}`);
  return z.array(PartnerSchema).parse(await response.json()); // trust boundary — validate, don't cast
}
