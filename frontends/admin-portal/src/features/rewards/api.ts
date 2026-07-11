import { request } from "../../http";

export interface Reward {
  id: string;
  name: string;
  cost: number;
}

const MEMBERS_URL = import.meta.env.VITE_MEMBERS_URL ?? "http://localhost:5080";

export function getRewards(): Promise<Reward[]> {
  return request<Reward[]>(`${MEMBERS_URL}/api/rewards`);
}

export function createReward(reward: Reward): Promise<Reward> {
  return request<Reward>(`${MEMBERS_URL}/api/rewards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reward),
  });
}

export function updateReward(id: string, name: string, cost: number): Promise<Reward> {
  return request<Reward>(`${MEMBERS_URL}/api/rewards/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cost }),
  });
}

export async function deleteReward(id: string): Promise<void> {
  // 204 has no JSON body, so this skips the shared request() JSON parse.
  const { getAccessToken } = await import("../../auth");
  const token = getAccessToken();
  const response = await fetch(`${MEMBERS_URL}/api/rewards/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
}
