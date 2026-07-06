const REQUEST_TIMEOUT_MS = 2000; // the BFF must answer fast or not at all

export type PointsTransaction = {
  id: string;
  type: string;
  points: number;
  source: string;
  occurredAtUtc: string;
};

export type TransactionsPage = {
  items: PointsTransaction[];
  page: number;
  hasMore: boolean;
};

export async function fetchTransactions(baseUrl: string, memberId: string, page: number): Promise<TransactionsPage> {
  const response = await fetch(
    `${baseUrl}/api/members/${encodeURIComponent(memberId)}/transactions?page=${encodeURIComponent(page)}`,
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
  if (!response.ok) throw new Error(`members service responded ${response.status}`);
  return (await response.json()) as TransactionsPage;
}
