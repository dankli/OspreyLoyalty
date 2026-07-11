import { z } from "zod";

const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

export const PointsTransactionSchema = z.object({
  id: z.string(),
  type: z.string(),
  points: z.number(),
  source: z.string(),
  occurredAtUtc: z.string(),
});

export const TransactionsPageSchema = z.object({
  items: z.array(PointsTransactionSchema),
  page: z.number(),
  hasMore: z.boolean(),
});

export type PointsTransaction = z.infer<typeof PointsTransactionSchema>;
export type TransactionsPage = z.infer<typeof TransactionsPageSchema>;

export async function fetchTransactions(
  baseUrl: string,
  memberId: string,
  page: number,
  type?: string,
  correlationId?: string,
  authorization?: string,
  acceptLanguage?: string,
): Promise<TransactionsPage> {
  const typeParam = type ? `&type=${encodeURIComponent(type)}` : "";
  const response = await fetch(
    `${baseUrl}/api/members/${encodeURIComponent(memberId)}/transactions?page=${encodeURIComponent(page)}${typeParam}`,
    {
      headers: { ...(correlationId ? { "x-correlation-id": correlationId } : {}), ...(authorization ? { authorization } : {}), ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return TransactionsPageSchema.parse(await response.json()); // trust boundary — validate, don't cast
}
