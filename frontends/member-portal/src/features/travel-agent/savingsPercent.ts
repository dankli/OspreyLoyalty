// Pure: what fraction (0–100, whole number) of a goal trip's cost the member has already saved.
// Owned by the travel-agent slice so it doesn't borrow the dashboard's tier-progress semantics.
export function savingsPercent(saved: number, goalCost: number): number {
  if (goalCost <= 0) return 0;
  return Math.min(100, Math.round((saved / goalCost) * 100));
}
