import { env } from "./env.js";

const TIMEOUT_MS = 2_000;

/**
 * Events carry no PII (ADR-0024), so the email is resolved here at send time.
 * Null means "nothing to send": unknown member (404) or GDPR-erased (email null).
 * Anything else (members down, 5xx, timeout) throws — the consumer requeues.
 */
export async function fetchMemberEmail(memberId: string): Promise<string | null> {
  const response = await fetch(`${env.membersUrl}/api/members/${encodeURIComponent(memberId)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`members responded ${response.status}`);
  const profile = (await response.json()) as { email?: string | null };
  return profile.email ?? null;
}
