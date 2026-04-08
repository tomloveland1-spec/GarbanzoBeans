import type { EnvelopeType } from '@/lib/types';

export type EnvelopeDisplayState = 'funded' | 'caution' | 'overspent';

export function deriveEnvelopeState(
  allocatedCents: number,
  spentCents: number = 0
): EnvelopeDisplayState {
  if (spentCents > allocatedCents) return 'overspent';
  if (allocatedCents === 0) return 'caution';
  return 'funded';
}

export function getEnvelopeStateExplanation(
  type: EnvelopeType,
  state: EnvelopeDisplayState
): string {
  const explanations: Record<EnvelopeType, Record<EnvelopeDisplayState, string>> = {
    Rolling: {
      funded:    'Your rolling budget is fully funded and spending is on track.',
      caution:   'This rolling budget has no allocation yet. Add funds to get started.',
      overspent: "You've overspent this rolling budget. Consider reallocating from another envelope.",
    },
    Bill: {
      funded:    'This bill is funded and ready to pay.',
      caution:   'This bill is not yet funded. Allocate before the due date.',
      overspent: 'This bill has been overspent. Review the allocation.',
    },
    Goal: {
      funded:    "You're on track toward this goal.",
      caution:   'This goal has no allocation yet. Start contributing to make progress.',
      overspent: "You've exceeded the allocation for this goal.",
    },
  };
  return explanations[type][state];
}

export const STATE_COLORS: Record<EnvelopeDisplayState, string> = {
  funded:    'var(--color-envelope-green)',
  caution:   'var(--color-envelope-orange)',
  overspent: 'var(--color-envelope-red)',
};

export const STATE_LABELS: Record<EnvelopeDisplayState, string> = {
  funded:    'Funded',
  caution:   'Unfunded',
  overspent: 'Over budget',
};
