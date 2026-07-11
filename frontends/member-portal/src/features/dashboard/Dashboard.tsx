import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { graphql } from "../../gql";
import { gatewayClient } from "../../gatewayClient";
import { TierProgress } from "./TierProgress";
import { BenefitsList } from "./BenefitsList";
import { formatPoints } from "../../format";

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
  const { t } = useTranslation();
  const { data, isPending, isError } = useQuery({
    queryKey: ["member", memberId],
    queryFn: () => gatewayClient.request(memberDashboardQuery, { id: memberId }),
  });

  if (isPending) return <p className="muted">{t("dashboard.loading")}</p>;
  if (isError || !data.member) return <p role="alert">{t("dashboard.error")}</p>;

  const member = data.member;
  return (
    <main className="dashboard">
      <h1>{t("dashboard.welcome", { name: member.name })}</h1>
      <section className="balance-card">
        <span className="label">{t("points.spendable")}</span>
        <span className="balance">{formatPoints(member.spendablePoints)}</span>
      </section>
      <TierProgress
        tier={member.tier}
        qualifyingPoints={member.qualifyingPoints}
        pointsToNextTier={member.pointsToNextTier ?? null}
      />
      <section>
        <h2>{t("dashboard.benefits")}</h2>
        <BenefitsList memberId={memberId} benefits={member.benefits} />
      </section>
    </main>
  );
}
