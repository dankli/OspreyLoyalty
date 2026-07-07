/**
 * Framework-less micro-frontend shell (ADR-0004).
 *
 * The shell owns navigation only. Each remote exposes `mount(el) => unmount`;
 * the shell loads a remote on demand, tears down the previous one, and mounts
 * the new one into its outlet. Remote loaders are injected so tests can supply
 * fakes without touching module federation.
 */

export type MountFn = (el: HTMLElement) => () => void;
export type RemoteLoader = () => Promise<{ mount: MountFn }>;
export type RemoteName = "memberPortal" | "adminPortal";

const LABELS: Record<RemoteName, string> = {
  memberPortal: "Member portal",
  adminPortal: "Admin portal",
};

export interface Shell {
  /** Load and mount the named remote, unmounting the previous one. */
  navigate(name: RemoteName): Promise<void>;
  /** Resolves when the default view (member portal) has finished mounting. */
  ready: Promise<void>;
}

export function createShell(root: HTMLElement, remotes: Record<RemoteName, RemoteLoader>): Shell {
  const header = document.createElement("header");
  header.className = "shell-nav";

  const brand = document.createElement("span");
  brand.className = "shell-brand";
  brand.textContent = "Osprey Loyalty";
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
      outlet.textContent = `Failed to load ${LABELS[name]}. Is its server running?`;
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
      outlet.textContent = `Failed to load ${LABELS[name]}.`;
      console.error(`[shell] mounting ${name} failed`, error);
      return;
    }

    for (const [key, button] of buttons) {
      button.classList.toggle("active", key === name);
    }
  }

  for (const name of Object.keys(LABELS) as RemoteName[]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.portal = name;
    button.textContent = LABELS[name];
    button.addEventListener("click", () => void navigate(name));
    buttons.set(name, button);
    header.appendChild(button);
  }

  root.replaceChildren(header, outlet);

  const ready = navigate("memberPortal");
  return { navigate, ready };
}
