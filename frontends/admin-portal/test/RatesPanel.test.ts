import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import RatesPanel from "../src/components/RatesPanel.vue";
import * as api from "../src/api";

vi.mock("../src/api");

const partners: api.Partner[] = [
  { id: "p-1", name: "Talon Cafés", rate: 1.5 },
  { id: "p-2", name: "Osprey Air", rate: 2 },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getPartners).mockResolvedValue(partners);
});

describe("RatesPanel", () => {
  it("loads partners on mount and renders a row per partner", async () => {
    const wrapper = mount(RatesPanel);
    await flushPromises();

    expect(api.getPartners).toHaveBeenCalled();
    expect(wrapper.text()).toContain("Talon Cafés");
    expect(wrapper.text()).toContain("Osprey Air");
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(2);
  });

  it("saves an edited rate via updateRate and flashes success", async () => {
    vi.mocked(api.updateRate).mockResolvedValue({ id: "p-1", name: "Talon Cafés", rate: 2.5 });
    const wrapper = mount(RatesPanel);
    await flushPromises();

    await wrapper.get('input[aria-label="Rate for Talon Cafés"]').setValue("2.5");
    await wrapper.findAll("button").find((b) => b.text() === "Save")!.trigger("click");
    await flushPromises();

    expect(api.updateRate).toHaveBeenCalledWith("p-1", 2.5);
    expect(wrapper.text()).toContain("Saved");
  });
});
