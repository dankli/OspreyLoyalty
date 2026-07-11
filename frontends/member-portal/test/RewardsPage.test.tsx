import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientError } from "graphql-request";
import { expect, test, vi } from "vitest";

const requestMock = vi.fn();
vi.mock("../src/gatewayClient", () => ({
  gatewayClient: { request: (...args: unknown[]) => requestMock(...args) },
}));

import { RewardsPage } from "../src/features/rewards/RewardsPage";

const rewards = [
  { id: "lounge-pass", name: "Lounge day pass", cost: 15000 },
  { id: "upgrade-voucher", name: "Cabin upgrade voucher", cost: 30000 },
  { id: "cardco-giftcard", name: "CardCo gift card", cost: 5000 },
];

function primeQueries(opts: { redeem: "succeed" | "fail" }) {
  requestMock.mockReset();
  // Server-side balance is mutable: a successful redeem moves it, so the
  // onSettled refetch of MemberBalance returns the settled server truth.
  let serverBalance = 14500;
  requestMock.mockImplementation(async (document: unknown, variables?: Record<string, unknown>) => {
    // Codegen documents are AST objects (no loc), so stringify to find the operation name.
    const doc = JSON.stringify(document);
    if (doc.includes("RewardsCatalog")) return { rewards };
    if (doc.includes("MemberBalance")) return { member: { id: "demo-ada", spendablePoints: serverBalance } };
    if (doc.includes("RedeemReward")) {
      // A real ClientError, exactly what graphql-request throws on a GraphQL error:
      // its .message carries the full response+request JSON, which must never reach the UI.
      if (opts.redeem === "fail")
        throw new ClientError(
          { errors: [{ message: "Insufficient spendable points." }], status: 200 } as never,
          { query: "" } as never,
        );
      serverBalance = 9500;
      return { redeem: { rewardId: variables?.rewardId, pointsSpent: 5000, spendablePoints: 9500, alreadyApplied: false } };
    }
    throw new Error(`unexpected request: ${doc.slice(0, 80)}`);
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RewardsPage memberId="demo-ada" />
    </QueryClientProvider>,
  );
}

test("renders the catalog and the balance", async () => {
  primeQueries({ redeem: "succeed" });
  renderPage();
  expect(await screen.findByText("Lounge day pass")).toBeInTheDocument();
  expect(screen.getByText(/14[\s, ]?500/)).toBeInTheDocument();
});

test("unaffordable rewards are disabled", async () => {
  primeQueries({ redeem: "succeed" });
  renderPage();
  await screen.findByText("Lounge day pass");
  expect(screen.getByRole("button", { name: /redeem cabin upgrade voucher/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /redeem cardco gift card/i })).toBeEnabled();
});

test("successful redeem settles to the server balance", async () => {
  primeQueries({ redeem: "succeed" });
  renderPage();
  await screen.findByText("Lounge day pass");
  await userEvent.click(screen.getByRole("button", { name: /redeem cardco gift card/i }));
  await waitFor(() => expect(screen.getByText(/9[\s, ]?500/)).toBeInTheDocument());
});

test("failed redeem rolls the optimistic balance back and shows the error", async () => {
  primeQueries({ redeem: "fail" });
  renderPage();
  await screen.findByText("Lounge day pass");
  await userEvent.click(screen.getByRole("button", { name: /redeem cardco gift card/i }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/insufficient spendable points/i);
  // Only the human message — no leaked response/request JSON from ClientError.message.
  expect(alert.textContent).not.toContain("{");
  // The rollback is the point: the pre-click balance must be back.
  expect(screen.getByText(/14[\s, ]?500/)).toBeInTheDocument();
});
