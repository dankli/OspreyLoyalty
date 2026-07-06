import { useQuery } from "@tanstack/react-query";
import { graphql } from "../../gql";
import { gatewayClient } from "../../gatewayClient";
import { TierProgress } from "./TierProgress";

const memberDashboardQuery = graphql(`
  query MemberDashboard($id: ID!) {
    member(id: $id) {
      id
      name
      tier
      qualifyingPoints
      spendablePoints
      pointsToNextTier
      benefits
    }
  }
`);

export function Dashboard({ memberId }: { memberId: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["member", memberId],
    queryFn: () => gatewayClient.request(memberDashboardQuery, { id: memberId }),
  });

  if (isPending) return <p className="muted">Loading your account…</p>;
  if (isError || !data.member) return <p role="alert">Could not load member.</p>;

  const member = data.member;
  return (
    <main className="dashboard">
      <h1>Welcome back, {member.name}</h1>
      <section className="balance-card">
        <span className="label">Spendable points</span>
        <span className="balance">{member.spendablePoints.toLocaleString("sv-SE")}</span>
      </section>
      <TierProgress
        tier={member.tier}
        qualifyingPoints={member.qualifyingPoints}
        pointsToNextTier={member.pointsToNextTier ?? null}
      />
      <section>
        <h2>Your benefits</h2>
        <ul>{member.benefits.map((b) => <li key={b}>{b}</li>)}</ul>
      </section>
    </main>
  );
}
