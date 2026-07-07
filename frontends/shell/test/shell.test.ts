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

describe("shell", () => {
  it("renders the nav and mounts the member portal by default", async () => {
    const member = fakeRemote();
    const admin = fakeRemote();
    const root = document.createElement("div");

    const shell = createShell(root, { memberPortal: member.loader, adminPortal: admin.loader });
    await shell.ready;

    const buttons = [...root.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toEqual(["Member portal", "Admin portal"]);
    expect(member.mount).toHaveBeenCalledOnce();
    expect(admin.mount).not.toHaveBeenCalled();
    expect(root.querySelector('button[data-portal="memberPortal"]')!.classList).toContain(
      "active",
    );
  });

  it("unmounts the previous portal and mounts the admin portal on switch", async () => {
    const member = fakeRemote();
    const admin = fakeRemote();
    const root = document.createElement("div");

    const shell = createShell(root, { memberPortal: member.loader, adminPortal: admin.loader });
    await shell.ready;

    root.querySelector<HTMLButtonElement>('button[data-portal="adminPortal"]')!.click();
    await vi.waitFor(() => expect(admin.mount).toHaveBeenCalledOnce());

    expect(member.unmount).toHaveBeenCalledOnce();
    expect(root.querySelector('button[data-portal="adminPortal"]')!.classList).toContain(
      "active",
    );
  });
});
