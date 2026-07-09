import { useTranslation } from "react-i18next";
import { progressPercent } from "./progress";

type Props = { tier: string; qualifyingPoints: number; pointsToNextTier: number | null };

export function TierProgress({ tier, qualifyingPoints, pointsToNextTier }: Props) {
  const { t } = useTranslation();
  const percent = progressPercent(qualifyingPoints, pointsToNextTier);
  return (
    <section className="tier-progress">
      <span className="tier-badge">{tier}</span>
      <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="bar">
        <div className="bar-fill" style={{ width: `${percent}%` }} />
      </div>
      {tier === "OSPREY" ? (
        <p>{t("tier.osprey")}</p>
      ) : pointsToNextTier === null ? (
        <p>{t("tier.diamond")}</p>
      ) : (
        <p>{t("tier.toNext", { points: pointsToNextTier.toLocaleString("sv-SE") })}</p>
      )}
      <p className="muted qualifying-note">
        {t("tier.qualifyingNote", { points: qualifyingPoints.toLocaleString("sv-SE") })}
      </p>
    </section>
  );
}
