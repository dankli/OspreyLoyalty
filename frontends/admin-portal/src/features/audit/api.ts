import { request } from "../../http";

export interface AuditEntry {
  actor: string;
  action: string;
  targetMemberId: string;
  details: Record<string, string>;
  correlationId: string;
  occurredAtUtc: string;
}

export interface AuditPage {
  items: AuditEntry[];
  page: number;
  hasMore: boolean;
}

const MEMBERS_URL = import.meta.env.VITE_MEMBERS_URL ?? "http://localhost:5080";

export function getAuditLog(page: number): Promise<AuditPage> {
  return request<AuditPage>(`${MEMBERS_URL}/api/audit?page=${page}`);
}
