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
