import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { graphql } from "../../gql";
import type { MemberBalanceQuery } from "../../gql/graphql";
import { gatewayClient } from "../../gatewayClient";

const rewardsCatalogQuery = graphql(`
  query RewardsCatalog {
    rewards {
      id
      name
      cost
    }
  }
`);

const memberBalanceQuery = graphql(`
  query MemberBalance($id: ID!) {
    member(id: $id) {
      id
      spendablePoints
    }
  }
`);

const redeemRewardMutation = graphql(`
  mutation RedeemReward($memberId: ID!, $rewardId: String!, $idempotencyKey: String!) {
    redeem(memberId: $memberId, rewardId: $rewardId, idempotencyKey: $idempotencyKey) {
      rewardId
      pointsSpent
      spendablePoints
      alreadyApplied
    }
  }
`);

export function RewardsPage({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const balanceKey = ["memberBalance", memberId] as const;

  const catalog = useQuery({
    queryKey: ["rewards"],
    queryFn: () => gatewayClient.request(rewardsCatalogQuery),
  });
  const balance = useQuery({
    queryKey: balanceKey,
    queryFn: () => gatewayClient.request(memberBalanceQuery, { id: memberId }),
  });

  const redeem = useMutation({
    mutationFn: ({ rewardId }: { rewardId: string; cost: number }) =>
      gatewayClient.request(redeemRewardMutation, {
        memberId,
        rewardId,
        idempotencyKey: crypto.randomUUID(),
      }),
    onMutate: async ({ cost }) => {
      // optimistic: pay immediately
      setError(null);
      await queryClient.cancelQueries({ queryKey: balanceKey });
      const snapshot = queryClient.getQueryData<MemberBalanceQuery>(balanceKey);
      queryClient.setQueryData<MemberBalanceQuery>(balanceKey, (current) =>
        current?.member
          ? {
              ...current,
              member: {
                ...current.member,
                spendablePoints: current.member.spendablePoints - cost,
              },
            }
          : current,
      );
      return { snapshot };
    },
    onError: (err, _variables, context) => {
      // rollback: the server said no — restore the snapshot
      queryClient.setQueryData(balanceKey, context?.snapshot);
      setError(err instanceof Error ? err.message : "Redeem failed.");
    },
    onSettled: () => {
      // settle: reconcile with server truth
      void queryClient.invalidateQueries({ queryKey: balanceKey });
      void queryClient.invalidateQueries({ queryKey: ["transactions", memberId] });
    },
  });

  if (catalog.isPending || balance.isPending) return <p className="muted">Loading rewards…</p>;
  if (catalog.isError || balance.isError || !balance.data.member) {
    return <p role="alert">Could not load rewards.</p>;
  }

  const spendable = balance.data.member.spendablePoints;

  return (
    <main className="dashboard">
      <h1>Rewards</h1>
      <section className="balance-card">
        <span className="label">Spendable points</span>
        <span className="balance">{spendable.toLocaleString("sv-SE")}</span>
      </section>
      {error && (
        <p role="alert" className="redeem-error">
          {error}{" "}
          <button className="dismiss" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}
      <ul className="reward-grid">
        {catalog.data.rewards.map((reward) => (
          <li key={reward.id} className="reward-card">
            <span className="reward-name">{reward.name}</span>
            <span className="reward-cost">{reward.cost.toLocaleString("sv-SE")} pts</span>
            <button
              aria-label={`Redeem ${reward.name}`}
              disabled={reward.cost > spendable || redeem.isPending}
              onClick={() => redeem.mutate({ rewardId: reward.id, cost: reward.cost })}
            >
              Redeem
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
