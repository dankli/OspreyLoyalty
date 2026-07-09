import { request } from "../../http";

export interface MemberProfile {
  id: string;
  name: string;
  email: string;
  tier: string;
  qualifyingPoints: number;
  spendablePoints: number;
  pointsToNextTier: number | null;
  benefits: string[];
  joinedAtUtc: string;
}

export interface Transaction {
  id: string;
  type: string;
  points: number;
  source: string;
  occurredAtUtc: string;
}

export interface TransactionsPage {
  items: Transaction[];
  page: number;
  hasMore: boolean;
}

export interface AdjustmentResult {
  points: number;
  spendablePoints: number;
  alreadyApplied: boolean;
}

const MEMBERS_URL = import.meta.env.VITE_MEMBERS_URL ?? "http://localhost:5080";

export function findMemberByEmail(email: string): Promise<MemberProfile> {
  return request<MemberProfile>(
    `${MEMBERS_URL}/api/members?email=${encodeURIComponent(email)}`,
  );
}

export function getTransactions(memberId: string, page = 1): Promise<TransactionsPage> {
  return request<TransactionsPage>(
    `${MEMBERS_URL}/api/members/${memberId}/transactions?page=${page}`,
  );
}

export function adjustPoints(
  memberId: string,
  points: number,
  reason: string,
): Promise<AdjustmentResult> {
  return request<AdjustmentResult>(`${MEMBERS_URL}/api/members/${memberId}/adjustments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points, reason, idempotencyKey: crypto.randomUUID() }),
  });
}

export function setOsprey(memberId: string, invited: boolean): Promise<MemberProfile> {
  return request<MemberProfile>(`${MEMBERS_URL}/api/members/${memberId}/osprey`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invited }),
  });
}
