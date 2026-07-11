import { request } from "../../http";

export interface Campaign {
  id: string;
  partnerId: string;
  name: string;
  multiplier: number;
  startsAtUtc: string;
  endsAtUtc: string;
}

const PARTNERS_URL = import.meta.env.VITE_PARTNERS_URL ?? "http://localhost:8081";

export function getCampaigns(): Promise<Campaign[]> {
  return request<Campaign[]>(`${PARTNERS_URL}/campaigns`);
}

export function createCampaign(input: Omit<Campaign, "id">): Promise<Campaign> {
  return request<Campaign>(`${PARTNERS_URL}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteCampaign(id: string): Promise<void> {
  // 204 has no JSON body, so this skips the shared request() JSON parse.
  const { getAccessToken } = await import("../../auth");
  const token = getAccessToken();
  const response = await fetch(`${PARTNERS_URL}/campaigns/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
}
