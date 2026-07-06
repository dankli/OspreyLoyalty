import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { graphql } from "../../gql";
import { gatewayClient } from "../../gatewayClient";
import { filterTransactions, type TransactionFilter } from "./filterTransactions";

const transactionsQuery = graphql(`
  query MemberTransactions($memberId: ID!, $page: Int!) {
    transactions(memberId: $memberId, page: $page) {
      items {
        id
        type
        points
        source
        occurredAtUtc
      }
      page
      hasMore
    }
  }
`);

const filters: TransactionFilter[] = ["all", "earn", "burn", "expiry", "adjustment"];

export function TransactionsPage({ memberId }: { memberId: string }) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<TransactionFilter>("all");
  const { data, isPending, isError } = useQuery({
    queryKey: ["transactions", memberId, page],
    queryFn: () => gatewayClient.request(transactionsQuery, { memberId, page }),
  });

  if (isPending) return <p className="muted">Loading transactions…</p>;
  if (isError || !data.transactions) return <p role="alert">Could not load transactions.</p>;

  const { items, hasMore } = data.transactions;
  const visible = filterTransactions(items, filter);

  return (
    <main className="dashboard">
      <h1>Transactions</h1>
      <label htmlFor="tx-filter">
        Type{" "}
        <select
          id="tx-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as TransactionFilter)}
        >
          {filters.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <table className="transactions">
        <thead>
          <tr>
            <th>When</th>
            <th>Type</th>
            <th>Source</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((t) => (
            <tr key={t.id}>
              <td>{new Date(t.occurredAtUtc).toLocaleDateString("sv-SE")}</td>
              <td>
                <span className={`type-badge type-${t.type}`}>{t.type}</span>
              </td>
              <td>{t.source}</td>
              <td className={t.points < 0 ? "negative" : "positive"}>
                {t.points.toLocaleString("sv-SE")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pager">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span className="muted">Page {page + 1}</span>
        <button disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </main>
  );
}
