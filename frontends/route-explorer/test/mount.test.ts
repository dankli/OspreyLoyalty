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

// Strings resolve against the locale at access time (see strings.ts); a remount is the
// documented way to pick up a language switch, and the shell's broadcast triggers it.
test("an osprey:locale-changed event remounts the app in the new language", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const unmount = mount(host);
  expect(host.textContent).toContain("Explore");

  localStorage.setItem("lang", "sv");
  window.dispatchEvent(new CustomEvent("osprey:locale-changed", { detail: { locale: "sv" } }));
  expect(host.textContent).toContain("Utforska");

  unmount();
  expect(host.textContent).toBe("");

  // A broadcast after teardown must not resurrect the app.
  window.dispatchEvent(new CustomEvent("osprey:locale-changed", { detail: { locale: "en" } }));
  expect(host.textContent).toBe("");

  localStorage.removeItem("lang");
  host.remove();
});
