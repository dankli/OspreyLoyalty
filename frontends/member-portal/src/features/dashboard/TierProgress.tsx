import { progressPercent } from "./progress";

type Props = { tier: string; qualifyingPoints: number; pointsToNextTier: number | null };

export function TierProgress({ tier, qualifyingPoints, pointsToNextTier }: Props) {
  const percent = progressPercent(qualifyingPoints, pointsToNextTier);
  return (
    <section className="tier-progress">
      <span className="tier-badge">{tier}</span>
      <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="bar">
        <div className="bar-fill" style={{ width: `${percent}%` }} />
      </div>
      {tier === "PANDION"
        ? <p>PANDION, by invitation.</p>
        : pointsToNextTier === null
          ? <p>DIAMOND is the highest earned tier. PANDION is by invitation only.</p>
          : <p>{pointsToNextTier.toLocaleString("sv-SE")} points to the next tier</p>}
    </section>
  );
}
