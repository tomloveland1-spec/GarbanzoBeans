import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Configurable savings store state for tests
const savingsState = {
  runway: 6,
  runwayDelta: null as number | null,
};

vi.mock('@/stores/useSavingsStore', () => ({
  useSavingsStore: (selector: (s: unknown) => unknown) => {
    const store = {
      runway: () => savingsState.runway,
      runwayDelta: () => savingsState.runwayDelta,
      loadReconciliations: vi.fn(),
      loadAvgMonthlyEssentialSpend: vi.fn(),
    };
    return selector(store);
  },
}));

import { invoke } from '@tauri-apps/api/core';
import CloseoutSummary from './CloseoutSummary';

function makeData(overrides: Partial<{
  totalAllocatedCents: number;
  totalSpentCents: number;
  stayedInBudget: boolean;
  overspendCents: number;
  savingsFlowCents: number;
  driftEnvelopeName: string | null;
}> = {}) {
  return {
    totalAllocatedCents: 100000,
    totalSpentCents: 80000,
    stayedInBudget: true,
    overspendCents: 0,
    savingsFlowCents: 25000,
    driftEnvelopeName: null,
    ...overrides,
  };
}

const defaultProps = { monthId: 1, year: 2026, month: 3 };

describe('CloseoutSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savingsState.runway = 6;
    savingsState.runwayDelta = null;
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(makeData());
  });

  it('shows loading state initially', () => {
    (invoke as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => { /* never resolves */ }));
    render(<CloseoutSummary {...defaultProps} />);
    expect(screen.getByText('Loading summary...')).toBeTruthy();
  });

  it('displays stayed in budget result', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeData({ stayedInBudget: true, overspendCents: 0, savingsFlowCents: 25000, driftEnvelopeName: null })
    );
    render(<CloseoutSummary {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Stayed in budget')).toBeTruthy();
    });
  });

  it('displays overspend result', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeData({ stayedInBudget: false, overspendCents: 10000 })
    );
    render(<CloseoutSummary {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/over budget/)).toBeTruthy();
    });
  });

  it('displays savings deposit', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeData({ savingsFlowCents: 30000 })
    );
    render(<CloseoutSummary {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/deposited/)).toBeTruthy();
    });
  });

  it('displays savings withdrawal', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeData({ savingsFlowCents: -15000 })
    );
    render(<CloseoutSummary {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/withdrawn/)).toBeTruthy();
    });
  });

  it('displays drift note when envelope drifted', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeData({ driftEnvelopeName: 'Dining Out' })
    );
    render(<CloseoutSummary {...defaultProps} />);
    await waitFor(() => {
      const note = screen.getByText(/Dining Out/);
      expect(note).toBeTruthy();
      expect(note.textContent).toContain('2 months in a row');
    });
  });

  it('does not display drift note when null', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeData({ driftEnvelopeName: null })
    );
    render(<CloseoutSummary {...defaultProps} />);
    await waitFor(() => {
      expect(screen.queryByText(/months in a row/)).toBeNull();
    });
  });

  it('displays runway with delta', async () => {
    savingsState.runway = 8;
    savingsState.runwayDelta = 2;
    render(<CloseoutSummary {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/\+2/)).toBeTruthy();
    });
  });

  it('shows error on fetch failure', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValue({
      code: 'MONTH_NOT_FOUND',
      message: 'No month found with id 1',
    });
    render(<CloseoutSummary {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('No month found with id 1')).toBeTruthy();
    });
  });
});
