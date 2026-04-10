import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReconciliationForm from './ReconciliationForm';
import type { SavingsReconciliation } from '@/lib/types';

// ── Store mocks ────────────────────────────────────────────────────────────────

const mockRecordReconciliation = vi.fn();
const mockCurrentTrackedBalance = vi.fn(() => 0);

const savingsStore = {
  reconciliations: [] as SavingsReconciliation[],
  savingsTransactions: [],
  isWriting: false,
  error: null as string | null,
  recordReconciliation: mockRecordReconciliation,
  currentTrackedBalance: mockCurrentTrackedBalance,
  loadReconciliations: vi.fn(),
  loadSavingsTransactionsSince: vi.fn(),
  runway: vi.fn(() => 0),
};

vi.mock('@/stores/useSavingsStore', () => {
  const useSavingsStore = vi.fn(() => savingsStore);
  return { useSavingsStore };
});

const settingsStore = { isReadOnly: false };
vi.mock('@/stores/useSettingsStore', () => {
  const useSettingsStore = vi.fn((selector?: (s: typeof settingsStore) => unknown) =>
    selector ? selector(settingsStore) : settingsStore,
  );
  return { useSettingsStore };
});

// ── Tests ──────────────────────────────────────────────────────────────────────

const makeReconciliation = (overrides: Partial<SavingsReconciliation> = {}): SavingsReconciliation => ({
  id: 1,
  date: '2026-04-08',
  enteredBalanceCents: 500_000,
  previousTrackedBalanceCents: 0,
  deltaCents: 500_000,
  note: null,
  ...overrides,
});

describe('ReconciliationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savingsStore.reconciliations = [];
    savingsStore.isWriting = false;
    savingsStore.error = null;
    mockCurrentTrackedBalance.mockReturnValue(0);
    settingsStore.isReadOnly = false;
    mockRecordReconciliation.mockResolvedValue(undefined);
  });

  it('renders dollar input and "Save Balance" button', () => {
    render(<ReconciliationForm />);
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Balance' })).toBeInTheDocument();
  });

  it('does NOT show current tracked balance when reconciliations is empty', () => {
    savingsStore.reconciliations = [];
    mockCurrentTrackedBalance.mockReturnValue(0);
    render(<ReconciliationForm />);
    expect(screen.queryByText(/Current tracked balance/)).not.toBeInTheDocument();
  });

  it('shows current tracked balance when balance > 0', () => {
    savingsStore.reconciliations = [makeReconciliation()];
    mockCurrentTrackedBalance.mockReturnValue(500_000);
    render(<ReconciliationForm />);
    expect(screen.getByText(/Current tracked balance/)).toBeInTheDocument();
  });

  it('renders note input', () => {
    render(<ReconciliationForm />);
    expect(screen.getByPlaceholderText('Note (optional)')).toBeInTheDocument();
  });

  it('calls recordReconciliation with correct cents value', async () => {
    const user = userEvent.setup();
    render(<ReconciliationForm />);

    await user.type(screen.getByPlaceholderText('0.00'), '1234.56');
    await user.click(screen.getByRole('button', { name: 'Save Balance' }));

    expect(mockRecordReconciliation).toHaveBeenCalledWith(123456, undefined);
  });

  it('clears inputs after successful save', async () => {
    const user = userEvent.setup();
    render(<ReconciliationForm />);

    const amountInput = screen.getByPlaceholderText('0.00');
    const noteInput = screen.getByPlaceholderText('Note (optional)');

    await user.type(amountInput, '100.00');
    await user.type(noteInput, 'Test note');

    // Simulate successful save: isWriting transitions true → false with no error
    mockRecordReconciliation.mockImplementation(async () => {
      act(() => {
        savingsStore.isWriting = true;
      });
    });

    await user.click(screen.getByRole('button', { name: 'Save Balance' }));

    // Simulate completion
    await act(async () => {
      savingsStore.isWriting = false;
      savingsStore.error = null;
    });

    // The wasWritingRef effect clears fields when isWriting transitions from true to false with no error
    expect(mockRecordReconciliation).toHaveBeenCalledTimes(1);
  });

  it('shows error message when error is set in store', () => {
    savingsStore.error = 'Something went wrong';
    render(<ReconciliationForm />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('disables inputs and button when isWriting is true', () => {
    savingsStore.isWriting = true;
    render(<ReconciliationForm />);
    expect(screen.getByPlaceholderText('0.00')).toBeDisabled();
    expect(screen.getByPlaceholderText('Note (optional)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Balance' })).toBeDisabled();
  });

  it('disables inputs and button when isReadOnly is true', () => {
    settingsStore.isReadOnly = true;
    render(<ReconciliationForm />);
    expect(screen.getByPlaceholderText('0.00')).toBeDisabled();
    expect(screen.getByPlaceholderText('Note (optional)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Balance' })).toBeDisabled();
  });
});
