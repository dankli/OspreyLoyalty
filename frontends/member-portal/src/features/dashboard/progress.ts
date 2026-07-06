export function progressPercent(qualifyingPoints: number, pointsToNextTier: number | null): number {
  if (pointsToNextTier === null) return 100;
  const target = qualifyingPoints + pointsToNextTier;
  if (target === 0) return 0;
  return Math.min(100, Math.round((qualifyingPoints / target) * 100));
}
