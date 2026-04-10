import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/stores/useMonthStore', () => {
  const mockAdvanceStep = vi.fn().mockResolvedValue(undefined);
  const mockCloseMonth = vi.fn().mockResolvedValue(undefined);
  const mockConfirmBillDates = vi.fn().mockResolvedValue(undefined);
  const mockConfirmIncomeTiming = vi.fn().mockResolvedValue(undefined);

  const store = {
    monthStatus: 'closing:step-1' as string,
    advanceStep: mockAdvanceStep,
    closeMonth: mockCloseMonth,
    confirmBillDates: mockConfirmBillDates,
    confirmIncomeTiming: mockConfirmIncomeTiming,
    isWriting: false,
    currentMonth: null,
    error: null,
  };

  const useMonthStore = Object.assign(vi.fn(() => store), {
    getState: vi.fn(() => store),
  });

  return { useMonthStore };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => new Promise(() => { /* never resolves — keeps CloseoutSummary in loading state */ })),
}));

vi.mock('@/stores/useSavingsStore', () => ({
  useSavingsStore: (selector: (s: unknown) => unknown) => {
    const store = {
      runway: () => 0,
      runwayDelta: () => null,
      loadReconciliations: vi.fn(),
      loadAvgMonthlyEssentialSpend: vi.fn(),
    };
    return selector(store);
  },
}));

vi.mock('@/stores/useEnvelopeStore', () => ({
  useEnvelopeStore: Object.assign(
    vi.fn(() => ({ envelopes: [], isWriting: false, error: null, borrowError: null })),
    { getState: vi.fn(() => ({ loadEnvelopes: vi.fn().mockResolvedValue(undefined) })) }
  ),
}));

import { useMonthStore } from '@/stores/useMonthStore';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import TurnTheMonthWizard from './TurnTheMonthWizard';

function setStoreState(overrides: Partial<{
  monthStatus: string;
  advanceStep: ReturnType<typeof vi.fn>;
  closeMonth: ReturnType<typeof vi.fn>;
  confirmBillDates: ReturnType<typeof vi.fn>;
  confirmIncomeTiming: ReturnType<typeof vi.fn>;
  isWriting: boolean;
  currentMonth: unknown;
  error: string | null;
}>) {
  const current = {
    monthStatus: 'closing:step-1' as string,
    advanceStep: vi.fn().mockResolvedValue(undefined),
    closeMonth: vi.fn().mockResolvedValue(undefined),
    confirmBillDates: vi.fn().mockResolvedValue(undefined),
    confirmIncomeTiming: vi.fn().mockResolvedValue(undefined),
    isWriting: false,
    currentMonth: null,
    error: null,
    ...overrides,
  };
  (useMonthStore as ReturnType<typeof vi.fn>).mockReturnValue(current);
  return current;
}

describe('TurnTheMonthWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    setStoreState({ monthStatus: 'closing:step-1' });
  });

  it('renders at step from monthStatus closing:step-1', () => {
    setStoreState({ monthStatus: 'closing:step-1' });
    render(<TurnTheMonthWizard />);
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
    expect(screen.getByText('Last Month in Review')).toBeTruthy();
  });

  it('renders at step from monthStatus closing:step-2 (crash recovery)', () => {
    setStoreState({ monthStatus: 'closing:step-2' });
    render(<TurnTheMonthWizard />);
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    expect(screen.getByText('Confirm Bill Dates')).toBeTruthy();
  });

  it('Continue calls advanceStep with current dbStep', async () => {
    const advanceStep = vi.fn().mockResolvedValue(undefined);
    setStoreState({ monthStatus: 'closing:step-1', advanceStep });
    render(<TurnTheMonthWizard />);
    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });
    expect(advanceStep).toHaveBeenCalledWith(1);
  });

  it('Step 4 renders EnvelopeFillFlow', () => {
    setStoreState({ monthStatus: 'closing:step-4' });
    render(<TurnTheMonthWizard />);
    expect(screen.getByTestId('envelope-fill-flow')).toBeTruthy();
  });

  it('Continue on final step calls closeMonth with pending allocations and navigates', async () => {
    const closeMonth = vi.fn().mockResolvedValue(undefined);
    setStoreState({ monthStatus: 'closing:step-4', closeMonth });
    render(<TurnTheMonthWizard />);
    await act(async () => {
      fireEvent.click(screen.getByText('Close Month'));
    });
    expect(closeMonth).toHaveBeenCalledWith([]); // pendingAllocations starts empty
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('closeMonth failure shows error and does not navigate', async () => {
    const closeMonth = vi.fn().mockRejectedValue({ message: 'DB error' });
    setStoreState({ monthStatus: 'closing:step-4', closeMonth, error: 'DB error' });
    render(<TurnTheMonthWizard />);
    await act(async () => {
      fireEvent.click(screen.getByText('Close Month'));
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Back decrements viewStep without calling advanceStep', async () => {
    const advanceStep = vi.fn().mockResolvedValue(undefined);
    setStoreState({ monthStatus: 'closing:step-2', advanceStep });
    render(<TurnTheMonthWizard />);
    // Should start at step 2
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    fireEvent.click(screen.getByText('Back'));
    await waitFor(() => {
      expect(screen.getByText('Step 1 of 4')).toBeTruthy();
    });
    expect(advanceStep).not.toHaveBeenCalled();
  });

  it('drift note present does not block Continue — AC3', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValueOnce({
      totalAllocatedCents: 100000,
      totalSpentCents: 80000,
      stayedInBudget: true,
      overspendCents: 0,
      savingsFlowCents: 25000,
      driftEnvelopeName: 'Dining Out',
    });
    const advanceStep = vi.fn().mockResolvedValue(undefined);
    setStoreState({ monthStatus: 'closing:step-1', currentMonth: { id: 1, year: 2026, month: 3 }, advanceStep });
    render(<TurnTheMonthWizard />);
    await waitFor(() => {
      expect(screen.getByText(/Dining Out/)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });
    expect(advanceStep).toHaveBeenCalledWith(1);
  });

  it('Continue on step 1 advances to closing:step-2 — AC4', async () => {
    const advanceStep = vi.fn().mockImplementation(async () => {
      setStoreState({ monthStatus: 'closing:step-2', advanceStep });
    });
    setStoreState({ monthStatus: 'closing:step-1', advanceStep });
    const { rerender } = render(<TurnTheMonthWizard />);
    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });
    rerender(<TurnTheMonthWizard />);
    await waitFor(() => {
      expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    });
    expect(advanceStep).toHaveBeenCalledWith(1);
  });

  it('Continue on step 2 calls confirmBillDates', async () => {
    const confirmBillDates = vi.fn().mockResolvedValue(undefined);
    setStoreState({ monthStatus: 'closing:step-2', confirmBillDates });
    render(<TurnTheMonthWizard />);
    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });
    expect(confirmBillDates).toHaveBeenCalledTimes(1);
  });

  it('Not yet button is visible in the wizard', () => {
    setStoreState({ monthStatus: 'closing:step-1' });
    render(<TurnTheMonthWizard />);
    expect(screen.getByText('Not yet — finish later')).toBeTruthy();
  });

  it('clicking Not yet navigates to / without calling any store action', async () => {
    const advanceStep = vi.fn();
    const closeMonth = vi.fn();
    const confirmBillDates = vi.fn();
    const confirmIncomeTiming = vi.fn();
    setStoreState({ monthStatus: 'closing:step-1', advanceStep, closeMonth, confirmBillDates, confirmIncomeTiming });
    render(<TurnTheMonthWizard />);
    fireEvent.click(screen.getByText('Not yet — finish later'));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    expect(advanceStep).not.toHaveBeenCalled();
    expect(closeMonth).not.toHaveBeenCalled();
    expect(confirmBillDates).not.toHaveBeenCalled();
    expect(confirmIncomeTiming).not.toHaveBeenCalled();
  });

  it('Not yet on step 4 with no pending allocations skips confirm and navigates', () => {
    vi.spyOn(window, 'confirm');
    setStoreState({ monthStatus: 'closing:step-4' });
    render(<TurnTheMonthWizard />);
    // envelopes mock is empty → pendingAllocations seeded as []
    fireEvent.click(screen.getByText('Not yet — finish later'));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('Not yet on step 4 with pending allocations shows confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(useEnvelopeStore as ReturnType<typeof vi.fn>).mockReturnValue({
      envelopes: [{ id: 1, allocatedCents: 5000 }],
      isWriting: false,
      error: null,
      borrowError: null,
    });
    setStoreState({ monthStatus: 'closing:step-4' });
    render(<TurnTheMonthWizard />);
    // Wait for EnvelopeFillFlow useEffect to seed pendingAllocations
    await waitFor(() => {});
    fireEvent.click(screen.getByText('Not yet — finish later'));
    expect(window.confirm).toHaveBeenCalledWith('Your allocation entries will be lost — continue?');
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('Not yet on step 4: cancelling confirm blocks navigation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(useEnvelopeStore as ReturnType<typeof vi.fn>).mockReturnValue({
      envelopes: [{ id: 1, allocatedCents: 5000 }],
      isWriting: false,
      error: null,
      borrowError: null,
    });
    setStoreState({ monthStatus: 'closing:step-4' });
    render(<TurnTheMonthWizard />);
    await waitFor(() => {});
    fireEvent.click(screen.getByText('Not yet — finish later'));
    expect(window.confirm).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Continue from viewStep < dbStep does not call advanceStep', async () => {
    const advanceStep = vi.fn().mockResolvedValue(undefined);
    setStoreState({ monthStatus: 'closing:step-2', advanceStep });
    render(<TurnTheMonthWizard />);
    // Click Back to go to step 1
    fireEvent.click(screen.getByText('Back'));
    await waitFor(() => {
      expect(screen.getByText('Step 1 of 4')).toBeTruthy();
    });
    // Continue from viewStep=1 where dbStep=2 → just catch up, no advanceStep call
    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });
    expect(advanceStep).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    });
  });
});
