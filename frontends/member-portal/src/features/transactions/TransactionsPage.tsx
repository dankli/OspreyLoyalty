import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { graphql } from "../../gql";
import { gatewayClient } from "../../gatewayClient";
import { filterTransactions, type TransactionFilter } from "./filterTransactions";
import { formatPoints, formatDate } from "../../format";

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
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<TransactionFilter>("all");
  const { data, isPending, isError } = useQuery({
    queryKey: ["transactions", memberId, page],
    queryFn: () => gatewayClient.request(transactionsQuery, { memberId, page }),
  });

  if (isPending) return <p className="muted">{t("tx.loading")}</p>;
  if (isError || !data.transactions) return <p role="alert">{t("tx.error")}</p>;

  const { items, hasMore } = data.transactions;
  const visible = filterTransactions(items, filter);

  return (
    <main className="dashboard">
      <h1>{t("tx.title")}</h1>
      <label htmlFor="tx-filter">
        {t("tx.type")}{" "}
        <select
          id="tx-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as TransactionFilter)}
        >
          {filters.map((f) => (
            <option key={f} value={f}>
              {t(`tx.filter.${f}`)}
            </option>
          ))}
        </select>
      </label>
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
          {visible.map((tx) => (
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
