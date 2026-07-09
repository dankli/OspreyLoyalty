import { request } from "../../http";

export interface Partner {
  id: string;
  name: string;
  rate: number;
}

const PARTNERS_URL = import.meta.env.VITE_PARTNERS_URL ?? "http://localhost:8081";

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
