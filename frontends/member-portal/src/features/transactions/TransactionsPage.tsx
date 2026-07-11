import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { graphql } from "../../gql";
import { gatewayClient, gatewayBaseUrl } from "../../gatewayClient";
import { formatPoints, formatDate } from "../../format";

const transactionsQuery = graphql(`
  query MemberTransactions($memberId: ID!, $page: Int!, $type: String) {
    transactions(memberId: $memberId, page: $page, type: $type) {
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

export type TransactionFilter = "all" | "earn" | "burn" | "expiry" | "adjustment";
const filters: TransactionFilter[] = ["all", "earn", "burn", "expiry", "adjustment"];

export function TransactionsPage({ memberId }: { memberId: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<TransactionFilter>("all");
  // The filter is a query variable: members filters server-side, so a filtered view spans
  // the whole ledger instead of just the rows that happened to be on the current page.
  const type = filter === "all" ? null : filter;
  const { data, isPending, isError } = useQuery({
    queryKey: ["transactions", memberId, page, type],
    queryFn: () => gatewayClient.request(transactionsQuery, { memberId, page, type }),
  });

  async function exportCsv() {
    const response = await fetch(`${gatewayBaseUrl}/export/transactions?memberId=${encodeURIComponent(memberId)}`);
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `osprey-transactions-${memberId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (isPending) return <p className="muted">{t("tx.loading")}</p>;
  if (isError || !data.transactions) return <p role="alert">{t("tx.error")}</p>;

  const { items, hasMore } = data.transactions;

  return (
    <main className="dashboard">
      <h1>{t("tx.title")}</h1>
      <div className="tx-toolbar">
        <label htmlFor="tx-filter">
          {t("tx.type")}{" "}
          <select
            id="tx-filter"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as TransactionFilter);
              setPage(0); // a new filter is a new list — never land mid-way into it
            }}
          >
            {filters.map((f) => (
              <option key={f} value={f}>
                {t(`tx.filter.${f}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="tx-export" onClick={() => void exportCsv()}>
          {t("tx.export")}
        </button>
      </div>
      <table className="transactions">
        <thead>
          <tr>
            <th>{t("tx.col.when")}</th>
            <th>{t("tx.col.type")}</th>
            <th>{t("tx.col.source")}</th>
            <th>{t("tx.col.points")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((tx) => (
            <tr key={tx.id}>
              <td>{formatDate(tx.occurredAtUtc)}</td>
              <td>
                <span className={`type-badge type-${tx.type}`}>{tx.type}</span>
              </td>
              <td>{tx.source}</td>
              <td className={tx.points < 0 ? "negative" : "positive"}>
                {formatPoints(tx.points)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pager">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          {t("tx.previous")}
        </button>
        <span className="muted">{t("tx.page", { page: page + 1 })}</span>
        <button disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
          {t("tx.next")}
        </button>
      </div>
    </main>
  );
}
