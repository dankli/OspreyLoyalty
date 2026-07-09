import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import MemberPanel from "../src/components/MemberPanel.vue";
import * as api from "../src/api";

vi.mock("../src/api");

const profile: api.MemberProfile = {
  id: "m-1",
  name: "Freja Falk",
  email: "freja@example.com",
  tier: "SOAR",
  qualifyingPoints: 12000,
  spendablePoints: 4500,
  pointsToNextTier: 8000,
  benefits: ["Priority boarding"],
  joinedAtUtc: "2024-03-01T00:00:00Z",
};

const transactions: api.TransactionsPage = {
  items: [
    { id: "t-1", type: "EARN", points: 250, source: "flight", occurredAtUtc: "2026-06-01T10:00:00Z" },
  ],
  page: 1,
  hasMore: false,
};

async function lookedUpPanel() {
  const wrapper = mount(MemberPanel);
  await wrapper.get('input[aria-label="Member email"]').setValue("freja@example.com");
  expect(wrapper.get('button[aria-label="Look up"]').text()).toBe("Look up");
  await wrapper.get("form.lookup-form").trigger("submit");
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.findMemberByEmail).mockResolvedValue(profile);
  vi.mocked(api.getTransactions).mockResolvedValue(transactions);
});

describe("MemberPanel", () => {
  it("looks up a member by email and renders profile with tier and transactions", async () => {
    const wrapper = await lookedUpPanel();

    expect(api.findMemberByEmail).toHaveBeenCalledWith("freja@example.com");
    expect(api.getTransactions).toHaveBeenCalledWith("m-1");
    expect(wrapper.text()).toContain("Freja Falk");
    expect(wrapper.get(".tier-badge").text()).toBe("SOAR");
    expect(wrapper.text()).toContain("4500");
    expect(wrapper.text()).toContain("flight");
  });

  it("submits a signed adjustment with reason and refreshes profile and transactions", async () => {
    vi.mocked(api.adjustPoints).mockResolvedValue({
      points: -300,
      spendablePoints: 4200,
      alreadyApplied: false,
    });
    const wrapper = await lookedUpPanel();

    await wrapper.get('input[aria-label="Adjustment points"]').setValue("-300");
    await wrapper.get('input[aria-label="Adjustment reason"]').setValue("Goodwill correction");
    await wrapper.get("form.adjustment-form").trigger("submit");
    await flushPromises();

    expect(api.adjustPoints).toHaveBeenCalledWith("m-1", -300, "Goodwill correction");
    // profile + transactions re-fetched after a successful adjustment
    expect(api.findMemberByEmail).toHaveBeenCalledTimes(2);
    expect(api.getTransactions).toHaveBeenCalledTimes(2);
  });

  it("shows the backend error text when an adjustment is rejected", async () => {
    vi.mocked(api.adjustPoints).mockRejectedValue(new Error("Insufficient spendable balance"));
    const wrapper = await lookedUpPanel();

    await wrapper.get('input[aria-label="Adjustment points"]').setValue("-99999");
    await wrapper.get('input[aria-label="Adjustment reason"]').setValue("test");
    await wrapper.get("form.adjustment-form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Insufficient spendable balance");
  });

  it("grants a PANDION invitation after confirmation", async () => {
    vi.mocked(api.setPandion).mockResolvedValue({ ...profile, tier: "PANDION" });
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const wrapper = await lookedUpPanel();

    const toggle = wrapper.get("button.pandion-toggle");
    expect(toggle.text()).toBe("Grant PANDION invitation");
    await toggle.trigger("click");
    await flushPromises();

    expect(window.confirm).toHaveBeenCalled();
    expect(api.setPandion).toHaveBeenCalledWith("m-1", true);
    expect(wrapper.get(".tier-badge").text()).toBe("PANDION");
    expect(wrapper.get("button.pandion-toggle").text()).toBe("Revoke PANDION invitation");

    vi.unstubAllGlobals();
  });

  it("lists the seeded demo members in the quick-pick dropdown", () => {
    const wrapper = mount(MemberPanel);
    const labels = wrapper
      .get('select[aria-label="Quick pick member"]')
      .findAll("option")
      .map((o) => o.text());

    expect(labels).toContain("Ada Lindqvist");
    expect(labels).toContain("Erik Boman");
    expect(labels).toContain("Yusra Ali");
  });

  it("looks up a member chosen from the quick-pick dropdown", async () => {
    const wrapper = mount(MemberPanel);
    await wrapper.get('select[aria-label="Quick pick member"]').setValue("erik@example.com");
    await flushPromises();

    expect(api.findMemberByEmail).toHaveBeenCalledWith("erik@example.com");
    expect(api.getTransactions).toHaveBeenCalledWith("m-1");
    expect(wrapper.text()).toContain("Freja Falk"); // mocked lookup result
  });
});
