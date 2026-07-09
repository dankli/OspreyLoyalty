import { afterEach, describe, expect, it } from "vitest";
import { DOMWrapper, mount } from "@vue/test-utils";
import HelpButton from "../src/HelpButton.vue";

describe("HelpButton", () => {
  // The dialog is teleported to <body>, so assert/interact there (and clean up between tests).
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens and closes a localized help dialog", async () => {
    const wrapper = mount(HelpButton, { attachTo: document.body });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    await wrapper.get('button[aria-label="Help"]').trigger("click");
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain("OSPREY");

    const close = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Close")!;
    await new DOMWrapper(close).trigger("click");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
