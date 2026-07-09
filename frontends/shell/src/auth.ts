// Browser OIDC (authorization code + PKCE) for the shell, gated by VITE_AUTH_ENABLED so the default
// build, the e2e and every test run exactly as before (no login). When enabled the shell logs in
// once and writes the access token to a single sessionStorage key that both remotes read, giving
// SSO across the module-federation boundary (ADR-0007). The shell uses the admin-portal client so a
// single token carries both member and admin scopes; the user's roles still gate admin actions.

import type { User } from "oidc-client-ts";

export type Session = { accessToken: string; expiresAt: number; sub: string; roles: string[] };

const SESSION_KEY = "osprey.auth.session";

export const authEnabled = (): boolean => import.meta.env.VITE_AUTH_ENABLED === "true";

const issuer = (): string => import.meta.env.VITE_OIDC_ISSUER ?? "http://localhost:9000";
const clientId = (): string => import.meta.env.VITE_OIDC_CLIENT_ID ?? "admin-portal";
const redirectUri = (): string =>
  import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/callback`;

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session.accessToken || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

const writeSession = (s: Session): void => sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
const clearSession = (): void => sessionStorage.removeItem(SESSION_KEY);

const roles = (): string[] => readSession()?.roles ?? [];
export const hasRole = (role: string): boolean => roles().includes(role);
/** True only with auth on and the signed-in user carrying the admin role. Drives which portal the
 *  shell opens on load — admins land on the Admin console, everyone else on the Member dashboard. */
export const isAdmin = (): boolean => authEnabled() && hasRole("admin");

function toSession(user: User): Session {
  const roles = ((user.profile as Record<string, unknown>).roles as string[] | undefined) ?? [];
  return {
    accessToken: user.access_token,
    expiresAt: (user.expires_at ?? 0) * 1000,
    sub: user.profile.sub ?? "",
    roles,
  };
}

async function userManager() {
  const { UserManager, WebStorageStateStore } = await import("oidc-client-ts");
  return new UserManager({
    authority: issuer(),
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid profile member admin",
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true,
  });
}

/** Establish the shared session before the shell mounts remotes; no-op when auth is disabled. */
export async function ensureAuthenticated(): Promise<void> {
  if (!authEnabled()) return;
  const params = new URLSearchParams(window.location.search);
  if (params.has("code") && params.has("state")) {
    const manager = await userManager();
    writeSession(toSession(await manager.signinRedirectCallback()));
    // Reset to the app root, NOT window.location.pathname — the redirect lands on "/callback", which
    // is not an app route, so a client-side router (the member portal) would match nothing and render
    // a blank page. "/" is the entry the portals route from.
    window.history.replaceState({}, document.title, "/");
    return;
  }
  if (readSession()) return;
  const manager = await userManager();
  const existing = await manager.getUser();
  if (existing && !existing.expired) {
    writeSession(toSession(existing));
    return;
  }
  await manager.signinRedirect();
  await new Promise<void>(() => {}); // suspend — the browser is navigating to the identity service
}

export async function signOut(): Promise<void> {
  if (!authEnabled()) {
    clearSession();
    return;
  }
  const manager = await userManager();
  const user = await manager.getUser();
  clearSession();
  await manager.removeUser();
  // RP-initiated logout: end the IdP session too, otherwise the next login silently
  // re-authenticates via the IdP's session cookie. Land back on the app root (a registered
  // post-logout URI); id_token_hint skips the IdP's logout-confirmation prompt.
  const url = new URL(`${issuer()}/connect/logout`);
  if (user?.id_token) url.searchParams.set("id_token_hint", user.id_token);
  url.searchParams.set("post_logout_redirect_uri", window.location.origin);
  window.location.assign(url.toString());
}
