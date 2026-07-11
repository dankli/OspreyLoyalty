import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const request = vi.fn();
vi.mock("../src/gatewayClient", () => ({
  gatewayClient: { get request() { return request; } },
  gatewayBaseUrl: "http://gateway",
}));

import { BenefitsList } from "../src/features/dashboard/BenefitsList";

function renderList(benefits: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BenefitsList memberId="demo-ada" benefits={benefits} />
    </QueryClientProvider>,
  );
}

test("activating a benefit shows the minted code and its QR", async () => {
  request.mockImplementation(async (doc: unknown) => {
    const text = JSON.stringify(doc);
    if (text.includes("BenefitActivations")) return { benefitActivations: [] };
    return {
      activateBenefit: {
        benefit: "Priority boarding", code: "KLMNPQRS",
        activatedAtUtc: "2026-07-11T12:00:00Z", alreadyApplied: false,
      },
    };
  });
  renderList(["Priority boarding"]);

  await userEvent.click(await screen.findByRole("button", { name: /activate/i }));

  const dialog = await screen.findByRole("dialog", { name: /activation code/i });
  expect(dialog).toHaveTextContent("KLMNPQRS");
  expect(await screen.findByAltText(/qr code for klmnpqrs/i)).toBeInTheDocument();
});

test("an already-activated benefit offers its existing code instead", async () => {
  request.mockImplementation(async (doc: unknown) => {
    const text = JSON.stringify(doc);
    if (text.includes("BenefitActivations")) {
      return {
        benefitActivations: [
          { benefit: "Lounge access", code: "ABCDEFGH", activatedAtUtc: "2026-07-10T09:00:00Z" },
        ],
      };
    }
    throw new Error("no mutation expected");
  });
  renderList(["Lounge access", "Priority boarding"]);

  const showCode = await screen.findByRole("button", { name: /show code/i });
  await userEvent.click(showCode);

  expect(await screen.findByRole("dialog")).toHaveTextContent("ABCDEFGH");
  // the not-yet-activated benefit still offers activation
  expect(screen.getByRole("button", { name: /activate/i })).toBeInTheDocument();
});

test("a refusal renders the error note", async () => {
  request.mockImplementation(async (doc: unknown) => {
    const text = JSON.stringify(doc);
    if (text.includes("BenefitActivations")) return { benefitActivations: [] };
    throw new Error("The member's tier does not include that benefit.");
  });
  renderList(["Upgrade voucher"]);

  await userEvent.click(await screen.findByRole("button", { name: /activate/i }));

  expect(await screen.findByRole("alert")).toBeInTheDocument();
});
