import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const request = vi.fn(async (_doc: unknown, variables: { type?: string | null }) => ({
  transactions: {
    items: [
      { id: "1", type: "earn", points: 2000, source: "stayinn", occurredAtUtc: "2026-07-01T10:00:00Z" },
      { id: "2", type: "burn", points: -500, source: "rewards", occurredAtUtc: "2026-07-02T10:00:00Z" },
    ].filter((tx) => !variables.type || tx.type === variables.type),
    page: 0,
    hasMore: false,
  },
}));

vi.mock("../src/gatewayClient", () => ({
  gatewayClient: { get request() { return request; } },
  gatewayBaseUrl: "http://gateway",
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

test("the type filter is a server-side query variable", async () => {
  renderPage();
  await screen.findByText("stayinn");
  await userEvent.selectOptions(screen.getByLabelText(/type/i), "earn");

  // A new fetch with the type variable — not a client-side slice of the current page.
  expect(await screen.findByText("stayinn")).toBeInTheDocument();
  expect(screen.queryByText("rewards")).not.toBeInTheDocument();
  expect(request).toHaveBeenLastCalledWith(expect.anything(), { memberId: "demo-ada", page: 0, type: "earn" });
});

test("the export button is offered", async () => {
  renderPage();
  await screen.findByText("stayinn");
  expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
});
