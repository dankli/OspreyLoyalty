import { getAccessToken } from "./auth";
import i18n from "./i18n";

// The single transport edge (the A-frame infrastructure boundary): every feature's data module
// funnels its fetches through here, so auth, language and the upstream timeout are applied in
// exactly one place and the feature slices stay free of HTTP plumbing.
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
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
