import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import CampaignsPanel from "../src/features/campaigns/CampaignsPanel.vue";
import * as api from "../src/features/campaigns/api";
import * as partnersApi from "../src/features/partners/api";

vi.mock("../src/features/campaigns/api");
vi.mock("../src/features/partners/api");

const july: api.Campaign = {
  id: "c-1",
  partnerId: "stayinn",
  name: "Double points July",
  multiplier: 2,
  startsAtUtc: "2026-07-01T00:00:00Z",
  endsAtUtc: "2026-08-01T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(partnersApi.getPartners).mockResolvedValue([
    { id: "cardco", name: "CardCo", rate: 0.5 },
    { id: "stayinn", name: "StayInn", rate: 2 },
  ]);
  vi.mocked(api.getCampaigns).mockResolvedValue([july]);
});

describe("CampaignsPanel", () => {
  it("lists campaigns with partner, multiplier and window", async () => {
    const wrapper = mount(CampaignsPanel);
    await flushPromises();

    expect(wrapper.text()).toContain("Double points July");
    expect(wrapper.text()).toContain("stayinn");
    expect(wrapper.text()).toContain("×2");
  });

  it("creates a campaign from the form and refreshes the list", async () => {
    vi.mocked(api.createCampaign).mockResolvedValue({ ...july, id: "c-2", name: "August boost" });
    const wrapper = mount(CampaignsPanel);
    await flushPromises();

    await wrapper.get('input[aria-label="Name"]').setValue("August boost");
    await wrapper.get('select[aria-label="Campaign partner"]').setValue("stayinn");
    await wrapper.get('input[aria-label="Campaign multiplier"]').setValue("3");
    const [starts, ends] = wrapper.findAll('input[type="datetime-local"]');
    await starts!.setValue("2026-08-01T00:00");
    await ends!.setValue("2026-09-01T00:00");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(api.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: "stayinn", name: "August boost", multiplier: 3 }),
    );
    expect(wrapper.text()).toContain("Campaign created.");
    expect(api.getCampaigns).toHaveBeenCalledTimes(2); // mount + refresh
  });

  it("deletes after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.deleteCampaign).mockResolvedValue();
    const wrapper = mount(CampaignsPanel);
    await flushPromises();

    await wrapper.findAll("button").find((b) => b.text() === "Delete")!.trigger("click");
    await flushPromises();

    expect(api.deleteCampaign).toHaveBeenCalledWith("c-1");
  });

  it("shows the backend's localized refusal on a bad create", async () => {
    vi.mocked(api.createCampaign).mockRejectedValue(
      new Error("Campaign multiplier must be greater than 1 and at most 5."),
    );
    const wrapper = mount(CampaignsPanel);
    await flushPromises();

    await wrapper.get('input[aria-label="Name"]').setValue("Too strong");
    const [starts, ends] = wrapper.findAll('input[type="datetime-local"]');
    await starts!.setValue("2026-08-01T00:00");
    await ends!.setValue("2026-09-01T00:00");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Campaign multiplier must be greater than 1 and at most 5.");
  });
});
