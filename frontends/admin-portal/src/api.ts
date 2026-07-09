import { getAccessToken } from "./auth";
import i18n from "./i18n";

const MEMBERS_URL = import.meta.env.VITE_MEMBERS_URL ?? "http://localhost:5080";
const PARTNERS_URL = import.meta.env.VITE_PARTNERS_URL ?? "http://localhost:8081";

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

export interface Partner {
  id: string;
  name: string;
  rate: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // Send the active UI language so members/partners localize their error messages to the
  // switcher's choice, and attach the admin's bearer (undefined when auth is off → no header) so
  // those services enforce zero-trust directly — the admin portal calls them, not the gateway.
  const token = getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      "Accept-Language": i18n.global.locale.value,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // no JSON body — keep the status message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

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

export function getPartners(): Promise<Partner[]> {
  return request<Partner[]>(`${PARTNERS_URL}/partners`);
}

export function updateRate(partnerId: string, rate: number): Promise<Partner> {
  return request<Partner>(`${PARTNERS_URL}/partners/${partnerId}/rate`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rate }),
  });
}
