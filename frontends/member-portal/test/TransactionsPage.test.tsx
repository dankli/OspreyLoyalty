import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

vi.mock("../src/gatewayClient", () => ({
  gatewayClient: {
    request: vi.fn(async () => ({
      transactions: {
        items: [
          { id: "1", type: "earn", points: 2000, source: "stayinn", occurredAtUtc: "2026-07-01T10:00:00Z" },
          { id: "2", type: "burn", points: -500, source: "rewards", occurredAtUtc: "2026-07-02T10:00:00Z" },
        ],
        page: 0,
        hasMore: false,
      },
    })),
  },
}));

import { TransactionsPage } from "../src/features/transactions/TransactionsPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TransactionsPage memberId="demo-ada" />
    </QueryClientProvider>,
  );
}

test("renders transaction rows", async () => {
  renderPage();
  expect(await screen.findByText("stayinn")).toBeInTheDocument();
  expect(screen.getByText("rewards")).toBeInTheDocument();
});

test("type filter narrows the list", async () => {
  renderPage();
  await screen.findByText("stayinn");
  await userEvent.selectOptions(screen.getByLabelText(/type/i), "earn");
  expect(screen.queryByText("rewards")).not.toBeInTheDocument();
  expect(screen.getByText("stayinn")).toBeInTheDocument();
});
