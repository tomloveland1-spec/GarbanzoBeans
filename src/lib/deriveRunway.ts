/**
 * deriveRunway — pure function computing months of runway from savings balance.
 *
 * @param savingsBalanceCents         Current tracked savings balance in cents
 * @param avgMonthlyEssentialSpendCents  Average monthly essential spend in cents
 * @returns Whole months of runway (truncated), or 0 if inputs are non-positive
 *
 * Guard cases:
 *   - avgMonthlyEssentialSpendCents <= 0: return 0 (no spend data; avoid division by zero)
 *   - savingsBalanceCents <= 0: return 0 (no savings to run on)
 */
export function deriveRunway(
  savingsBalanceCents: number,
  avgMonthlyEssentialSpendCents: number,
): number {
  if (avgMonthlyEssentialSpendCents <= 0) return 0;
  if (savingsBalanceCents <= 0) return 0;
  return Math.floor(savingsBalanceCents / avgMonthlyEssentialSpendCents);
}
