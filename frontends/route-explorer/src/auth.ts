// The shell owns the OIDC session (ADR-0007) and shares the token with every remote
// through one sessionStorage key. This remote only reads it — it never signs in or out.
const SESSION_KEY = "osprey.auth.session";

type Session = { accessToken: string; expiresAt: number; sub?: string };

const authEnabled = (): boolean => import.meta.env.VITE_AUTH_ENABLED === "true";

function readSession(): Partial<Session> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<Session>;
    if (!session.accessToken || (session.expiresAt ?? 0) <= Date.now()) return null;
    return session;
  } catch {
    return null; // a malformed session must never break the page
  }
}

export function getAccessToken(): string | undefined {
  return readSession()?.accessToken;
}

/**
 * Who books a trip: with auth on the token's sub (never spoofable), otherwise the same
 * `?as=` dev override + demo fallback the member portal uses.
 */
export function getMemberId(fallback = "demo-ada"): string {
  if (authEnabled()) return readSession()?.sub ?? fallback;
  const override = new URLSearchParams(window.location.search).get("as");
  return override?.trim() || fallback;
}
