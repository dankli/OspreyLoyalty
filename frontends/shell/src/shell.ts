/**
 * Framework-less micro-frontend shell (ADR-0004).
 *
 * The shell owns navigation only. Each remote exposes `mount(el) => unmount`;
 * the shell loads a remote on demand, tears down the previous one, and mounts
 * the new one into its outlet. Remote loaders are injected so tests can supply
 * fakes without touching module federation.
 */

import { t } from "./i18n";
import { authEnabled, isAdmin, signOut } from "./auth";

export type MountFn = (el: HTMLElement) => () => void;
export type RemoteLoader = () => Promise<{ mount: MountFn }>;
export type RemoteName = "memberPortal" | "adminPortal" | "routeExplorer";

const REMOTE_NAMES: RemoteName[] = ["memberPortal", "adminPortal", "routeExplorer"];

export interface Shell {
  /** Load and mount the named remote, unmounting the previous one. */
  navigate(name: RemoteName): Promise<void>;
  /** Resolves when the landing view for the signed-in role has finished mounting. */
  ready: Promise<void>;
}

export function createShell(root: HTMLElement, remotes: Record<RemoteName, RemoteLoader>): Shell {
  const header = document.createElement("header");
  header.className = "shell-nav";

  const brand = document.createElement("span");
  brand.className = "shell-brand";
  brand.textContent = t("brand");
  header.appendChild(brand);

  const outlet = document.createElement("main");
  outlet.className = "shell-outlet";

  const buttons = new Map<RemoteName, HTMLButtonElement>();
  let unmount: (() => void) | null = null;
  let generation = 0;

  async function navigate(name: RemoteName): Promise<void> {
    const myGeneration = ++generation;
    let remote: { mount: MountFn };
    try {
      remote = await remotes[name]();
    } catch (error) {
      if (myGeneration !== generation) return;
      unmount?.();
      unmount = null;
      outlet.textContent = t("loadFailedRunning", { label: t(name) });
      console.error(`[shell] loading ${name} failed`, error);
      return;
    }
    if (myGeneration !== generation) return; // a later navigation won the race

    unmount?.();
    unmount = null;
    outlet.replaceChildren();

    const host = document.createElement("div");
    outlet.appendChild(host);
    try {
      unmount = remote.mount(host);
    } catch (error) {
      // A throwing mount must leave a visible message, not an unhandled rejection.
      outlet.textContent = t("loadFailed", { label: t(name) });
      console.error(`[shell] mounting ${name} failed`, error);
      return;
    }

    for (const [key, button] of buttons) {
      button.classList.toggle("active", key === name);
    }
  }

  // With auth on, each role gets only its own portal: admins the Admin console, members the Member
  // portal. The route explorer is informational, so both roles keep it. The auth-off default
  // build (and the shell tests) see all remotes.
  let visibleRemotes: RemoteName[] = REMOTE_NAMES;
  if (authEnabled()) {
    visibleRemotes = isAdmin()
      ? REMOTE_NAMES.filter((name) => name !== "memberPortal")
      : REMOTE_NAMES.filter((name) => name !== "adminPortal");
  }
  for (const name of visibleRemotes) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.portal = name;
    button.textContent = t(name);
    button.addEventListener("click", () => void navigate(name));
    buttons.set(name, button);
    header.appendChild(button);
  }

  // Remotes can ask the shell to switch portals (e.g. the route explorer's "plan with
  // Travel Agent" hand-off). The event carries only a remote name; anything deeper —
  // like which page inside the portal — travels in the URL, which the portals already
  // own via their routers. Unknown or role-hidden remotes are ignored.
  window.addEventListener("osprey:navigate", (event) => {
    const remote = (event as CustomEvent<{ remote?: string }>).detail?.remote;
    if (remote && buttons.has(remote as RemoteName)) {
      void navigate(remote as RemoteName);
    }
  });

  // Sign-out lives in the shell (it owns the shared session); only shown when auth is enabled,
  // so the default build and the shell tests see exactly the two nav buttons.
  if (authEnabled()) {
    const signOutButton = document.createElement("button");
    signOutButton.type = "button";
    signOutButton.className = "shell-signout";
    signOutButton.dataset.action = "sign-out";
    signOutButton.textContent = t("signOut");
    signOutButton.addEventListener("click", () => void signOut());
    header.appendChild(signOutButton);
  }

  root.replaceChildren(header, outlet);

  // Open the portal that matches the signed-in role: admins land on the Admin console, members (and
  // the auth-off default build) on the Member portal — whose default route is the dashboard.
  const ready = navigate(isAdmin() ? "adminPortal" : "memberPortal");
  return { navigate, ready };
}
