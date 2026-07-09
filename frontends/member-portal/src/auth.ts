// Browser OIDC (authorization code + PKCE) for the member portal, gated by VITE_AUTH_ENABLED so
// the default build, the e2e and every test run exactly as before (no login, demo identity). When
// enabled, the shell and both remotes share one access token via a single sessionStorage key so a
// single login covers all three (SSO across module-federation boundaries — ADR-0007).

import type { User } from "oidc-client-ts";

/** Shared token contract — read by the shell and both portals; written by whoever logs in. */
export type Session = { accessToken: string; expiresAt: number; sub: string; roles: string[] };

const SESSION_KEY = "osprey.auth.session";

export const authEnabled = (): boolean => import.meta.env.VITE_AUTH_ENABLED === "true";

const issuer = (): string => import.meta.env.VITE_OIDC_ISSUER ?? "http://localhost:9000";
const clientId = (): string => import.meta.env.VITE_OIDC_CLIENT_ID ?? "member-portal";
const redirectUri = (): string =>
  import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/callback`;

export function readSession(): Session | null {
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

export const writeSession = (s: Session): void => sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
export const clearSession = (): void => sessionStorage.removeItem(SESSION_KEY);

/** Bearer for the gateway, or undefined when auth is off / no valid session. */
export const getAccessToken = (): string | undefined =>
  authEnabled() ? readSession()?.accessToken : undefined;

/** With auth off there are no restrictions (demo/dev); with it on, check the token roles. */
export const hasRole = (role: string): boolean =>
  authEnabled() ? (readSession()?.roles.includes(role) ?? false) : true;

// A dev override to demo any member without a real login — honoured ONLY with auth off;
// with auth on, identity is the token's sub and cannot be spoofed via the URL.
function asOverride(): string | null {
  const value = new URLSearchParams(window.location.search).get("as");
  return value && value.trim() ? value.trim() : null;
}

export function getMemberId(fallback = "demo-ada"): string {
  if (authEnabled()) return readSession()?.sub ?? fallback;
  return asOverride() ?? fallback;
}

function toSession(user: User): Session {
  const roles = ((user.profile as Record<string, unknown>).roles as string[] | undefined) ?? [];
  return {
    accessToken: user.access_token,
    expiresAt: (user.expires_at ?? 0) * 1000,
    sub: user.profile.sub ?? "",
    roles,
  };
}

// oidc-client-ts is loaded lazily so the disabled path never imports it (smaller default bundle,
// and tests that never enable auth don't touch browser-crypto APIs).
async function userManager() {
  const { UserManager, WebStorageStateStore } = await import("oidc-client-ts");
  return new UserManager({
    authority: issuer(),
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid profile member",
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true,
  });
}

/**
 * Gate the app on a valid session. No-op when auth is disabled. Otherwise: complete a redirect
 * callback if present, resolve when a shared session already exists (the shell logged in), or
 * start the login redirect — the returned promise then never resolves as the page navigates away.
 */
export async function ensureAuthenticated(): Promise<void> {
  if (!authEnabled()) return;
  const params = new URLSearchParams(window.location.search);
  if (params.has("code") && params.has("state")) {
    const manager = await userManager();
    writeSession(toSession(await manager.signinRedirectCallback()));
    // Reset to "/" (not the "/callback" redirect path, which no app route matches — React Router
    // would render nothing / warn "No routes matched location /callback").
    window.history.replaceState({}, document.title, "/");
    return;
  }
  if (readSession()) return; // the shell (or a prior login) already populated the shared session
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
