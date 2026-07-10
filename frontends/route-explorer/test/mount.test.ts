import { expect, test } from "vitest";
import { mount } from "../src/mount";

// The ADR-0004 contract the shell relies on: mount(el) renders, the returned
// function tears everything down.
test("mount renders the app into the host element and unmount empties it", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const unmount = mount(host);
  expect(host.textContent).toContain("Route Explorer");

  unmount();
  expect(host.textContent).toBe("");

  host.remove();
});
