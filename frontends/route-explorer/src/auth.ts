// The shell owns the OIDC session (ADR-0007) and shares the token with every remote
// through one sessionStorage key. This remote only reads it — it never signs in or out.
const SESSION_KEY = "osprey.auth.session";

type Session = { accessToken: string; expiresAt: number };

export function getAccessToken(): string | undefined {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const session = JSON.parse(raw) as Partial<Session>;
    if (!session.accessToken || (session.expiresAt ?? 0) <= Date.now()) return undefined;
    return session.accessToken;
  } catch {
    return undefined; // a malformed session must never break the page
  }
}
