import { describe, expect, it, vi } from "vitest";
import { createShell, type RemoteLoader } from "../src/shell";

function fakeRemote() {
  const unmount = vi.fn();
  const mount = vi.fn((el: HTMLElement) => {
    el.textContent = "remote content";
    return unmount;
  });
  const loader: RemoteLoader = () => Promise.resolve({ mount });
  return { loader, mount, unmount };
}

function fakeRemotes() {
  return {
    member: fakeRemote(),
    admin: fakeRemote(),
    explorer: fakeRemote(),
  };
}

describe("shell", () => {
  it("renders the nav and mounts the member portal by default", async () => {
    const { member, admin, explorer } = fakeRemotes();
    const root = document.createElement("div");

    const shell = createShell(root, {
      memberPortal: member.loader,
      adminPortal: admin.loader,
      routeExplorer: explorer.loader,
    });
    await shell.ready;

    const buttons = [...root.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toEqual(["Member portal", "Admin portal", "Route explorer"]);
    expect(member.mount).toHaveBeenCalledOnce();
    expect(admin.mount).not.toHaveBeenCalled();
    expect(explorer.mount).not.toHaveBeenCalled();
    expect(root.querySelector('button[data-portal="memberPortal"]')!.classList).toContain(
      "active",
    );
  });

  it("unmounts the previous portal and mounts the admin portal on switch", async () => {
    const { member, admin, explorer } = fakeRemotes();
    const root = document.createElement("div");

    const shell = createShell(root, {
      memberPortal: member.loader,
      adminPortal: admin.loader,
      routeExplorer: explorer.loader,
    });
    await shell.ready;

    root.querySelector<HTMLButtonElement>('button[data-portal="adminPortal"]')!.click();
    await vi.waitFor(() => expect(admin.mount).toHaveBeenCalledOnce());

    expect(member.unmount).toHaveBeenCalledOnce();
    expect(root.querySelector('button[data-portal="adminPortal"]')!.classList).toContain(
      "active",
    );
  });

  it("mounts the route explorer on demand and tears it down on switch-away", async () => {
    const { member, admin, explorer } = fakeRemotes();
    const root = document.createElement("div");

    const shell = createShell(root, {
      memberPortal: member.loader,
      adminPortal: admin.loader,
      routeExplorer: explorer.loader,
    });
    await shell.ready;

    root.querySelector<HTMLButtonElement>('button[data-portal="routeExplorer"]')!.click();
    await vi.waitFor(() => expect(explorer.mount).toHaveBeenCalledOnce());
    expect(member.unmount).toHaveBeenCalledOnce();

    root.querySelector<HTMLButtonElement>('button[data-portal="memberPortal"]')!.click();
    await vi.waitFor(() => expect(explorer.unmount).toHaveBeenCalledOnce());
  });
});

describe("shell language switcher (ADR-0023)", () => {
  it("renders a select with all five locales, seeded from localStorage", async () => {
    localStorage.setItem("lang", "de");
    const { member, admin, explorer } = fakeRemotes();
    const root = document.createElement("div");

    const shell = createShell(root, {
      memberPortal: member.loader,
      adminPortal: admin.loader,
      routeExplorer: explorer.loader,
    });
    await shell.ready;

    const select = root.querySelector<HTMLSelectElement>("select.shell-lang")!;
    expect(select).not.toBeNull();
    expect([...select.options].map((o) => o.value)).toEqual(["en", "sv", "es", "de", "it"]);
    expect(select.value).toBe("de");
    localStorage.removeItem("lang");
  });

  it("changing the select persists, broadcasts, and relabels the nav in place", async () => {
    const { member, admin, explorer } = fakeRemotes();
    const root = document.createElement("div");

    const shell = createShell(root, {
      memberPortal: member.loader,
      adminPortal: admin.loader,
      routeExplorer: explorer.loader,
    });
    await shell.ready;

    const heard = vi.fn();
    window.addEventListener("osprey:locale-changed", heard, { once: true });
    const select = root.querySelector<HTMLSelectElement>("select.shell-lang")!;
    select.value = "sv";
    select.dispatchEvent(new Event("change"));

    expect(localStorage.getItem("lang")).toBe("sv");
    expect(heard).toHaveBeenCalledOnce();
    const labels = [...root.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Medlemsportal", "Adminportal", "Ruttutforskare"]);
    // Relabeling must not remount the active remote.
    expect(member.mount).toHaveBeenCalledOnce();
    expect(member.unmount).not.toHaveBeenCalled();
    localStorage.removeItem("lang");
  });
});

it("an osprey:navigate event from a remote swaps the mounted portal", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const mounted: string[] = [];
  const loader = (name: string) => async () => ({
    mount: (el: HTMLElement) => {
      mounted.push(name);
      el.textContent = name;
      return () => {};
    },
  });
  const shell = createShell(host, {
    memberPortal: loader("member"),
    adminPortal: loader("admin"),
    routeExplorer: loader("explorer"),
  });
  await shell.navigate("routeExplorer");

  window.dispatchEvent(new CustomEvent("osprey:navigate", { detail: { remote: "memberPortal" } }));
  await vi.waitFor(() => expect(mounted).toContain("member"));

  // Unknown remotes are ignored rather than crashing the shell.
  window.dispatchEvent(new CustomEvent("osprey:navigate", { detail: { remote: "nope" } }));
  host.remove();
});
