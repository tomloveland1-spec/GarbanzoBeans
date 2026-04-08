import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Envelope, IncomeEntry } from '@/lib/types';

// ── Hoisted mocks (must be declared before vi.mock factories) ─────────────────

const {
  mockAllocateEnvelopes,
  mockCreateIncomeEntry,
  mockDeleteIncomeEntry,
  mockNavigate,
} = vi.hoisted(() => ({
  mockAllocateEnvelopes: vi.fn(),
  mockCreateIncomeEntry: vi.fn(),
  mockDeleteIncomeEntry: vi.fn(),
  mockNavigate: vi.fn(),
}));

// ── Store mocks ───────────────────────────────────────────────────────────────

vi.mock('@/stores/useEnvelopeStore', () => {
  const store = {
    envelopes: [] as Envelope[],
    isWriting: false,
    error: null as { code: string; message: string } | null,
    allocateEnvelopes: mockAllocateEnvelopes,
    loadEnvelopes: vi.fn(),
    createEnvelope: vi.fn(),
    updateEnvelope: vi.fn(),
    deleteEnvelope: vi.fn(),
  };
  const useEnvelopeStore = Object.assign(
    vi.fn((selector?: (s: typeof store) => unknown) =>
      selector ? selector(store) : store
    ),
    { getState: vi.fn(() => store) },
  );
  return { useEnvelopeStore };
});

vi.mock('@/stores/useIncomeStore', () => {
  const store = {
    entries: [] as IncomeEntry[],
    isWriting: false,
    error: null,
    loadIncomeEntries: vi.fn(),
    createIncomeEntry: mockCreateIncomeEntry,
    deleteIncomeEntry: mockDeleteIncomeEntry,
  };
  const useIncomeStore = Object.assign(
    vi.fn((selector?: (s: typeof store) => unknown) =>
      selector ? selector(store) : store
    ),
    { getState: vi.fn(() => store) },
  );
  return { useIncomeStore };
});

// Mock TanStack Router navigate
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useIncomeStore } from '@/stores/useIncomeStore';
import AllocationPage from './AllocationPage';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeEnvelope = (overrides: Partial<Envelope> = {}): Envelope => ({
  id: 1,
  name: 'Groceries',
  type: 'Rolling',
  priority: 'Need',
  allocatedCents: 0,
  monthId: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeIncome = (overrides: Partial<IncomeEntry> = {}): IncomeEntry => ({
  id: 1,
  name: '1st Paycheck',
  amountCents: 250000,
  ...overrides,
});

function setEnvelopes(envelopes: Envelope[]) {
  const store = useEnvelopeStore.getState();
  Object.assign(store, { envelopes, error: null });
  vi.mocked(useEnvelopeStore).mockImplementation((selector?: (s: typeof store) => unknown) =>
    selector ? selector(store) : store
  );
  vi.mocked(useEnvelopeStore.getState).mockReturnValue(store);
}

function setIncomeEntries(entries: IncomeEntry[]) {
  const store = useIncomeStore.getState();
  Object.assign(store, { entries });
  vi.mocked(useIncomeStore).mockImplementation((selector?: (s: typeof store) => unknown) =>
    selector ? selector(store) : store
  );
  vi.mocked(useIncomeStore.getState).mockReturnValue(store);
}

function setAllocationError(err: { code: string; message: string } | null) {
  const store = useEnvelopeStore.getState();
  Object.assign(store, { error: err });
  vi.mocked(useEnvelopeStore.getState).mockReturnValue(store);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AllocationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEnvelopes([]);
    setIncomeEntries([]);
    mockAllocateEnvelopes.mockResolvedValue(undefined);
    mockCreateIncomeEntry.mockResolvedValue(undefined);
    mockDeleteIncomeEntry.mockResolvedValue(undefined);
  });

  // AC 10: empty state
  it('shows empty state message when no envelopes exist', () => {
    render(<AllocationPage />);
    expect(screen.getByTestId('allocation-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/Add envelopes on the Budget screen/i)).toBeInTheDocument();
  });

  // AC 1: envelopes shown with pre-filled inputs
  it('renders each envelope with a pre-filled allocation input', () => {
    setEnvelopes([
      makeEnvelope({ id: 1, name: 'Groceries', allocatedCents: 50000 }),
      makeEnvelope({ id: 2, name: 'Rent', allocatedCents: 100000 }),
    ]);
    render(<AllocationPage />);

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Rent')).toBeInTheDocument();

    const input1 = screen.getByTestId('allocation-input-1') as HTMLInputElement;
    const input2 = screen.getByTestId('allocation-input-2') as HTMLInputElement;
    expect(input1.value).toBe('500.00');
    expect(input2.value).toBe('1000.00');
  });

  // AC 2: income section present
  it('shows income section with Available to Allocate', () => {
    setEnvelopes([makeEnvelope()]);
    setIncomeEntries([
      makeIncome({ id: 1, name: '1st Paycheck', amountCents: 250000 }),
      makeIncome({ id: 2, name: '2nd Paycheck', amountCents: 250000 }),
    ]);
    render(<AllocationPage />);

    expect(screen.getByText('1st Paycheck')).toBeInTheDocument();
    expect(screen.getByText('2nd Paycheck')).toBeInTheDocument();
    expect(screen.getByTestId('available-to-allocate')).toHaveTextContent('$5,000.00');
  });

  // AC 3: adding income entry calls store
  it('calls createIncomeEntry when Add button clicked with valid input', async () => {
    const user = userEvent.setup();
    setEnvelopes([makeEnvelope()]);
    render(<AllocationPage />);

    await user.type(screen.getByTestId('income-name-input'), '1st Paycheck');
    await user.type(screen.getByTestId('income-amount-input'), '2500.00');
    await user.click(screen.getByTestId('add-income-button'));

    expect(mockCreateIncomeEntry).toHaveBeenCalledWith({
      name: '1st Paycheck',
      amountCents: 250000,
    });
  });

  // AC 4: deleting income entry calls store
  it('calls deleteIncomeEntry when delete button clicked', async () => {
    const user = userEvent.setup();
    setEnvelopes([makeEnvelope()]);
    setIncomeEntries([makeIncome({ id: 5, name: 'Bonus' })]);
    render(<AllocationPage />);

    await user.click(screen.getByLabelText('Delete Bonus'));
    expect(mockDeleteIncomeEntry).toHaveBeenCalledWith(5);
  });

  // AC 5: live update of available balance
  it('updates Available to Allocate live as envelope amounts are typed', async () => {
    const user = userEvent.setup();
    setEnvelopes([makeEnvelope({ id: 1, allocatedCents: 0 })]);
    setIncomeEntries([makeIncome({ amountCents: 500000 })]);
    render(<AllocationPage />);

    const input = screen.getByTestId('allocation-input-1');
    await user.clear(input);
    await user.type(input, '100.00');

    // Allocated total should update
    expect(screen.getByTestId('allocated-total')).toHaveTextContent('$100.00');
  });

  // AC 6: blur validation — invalid input
  it('shows red border and error on blur for invalid input', async () => {
    const user = userEvent.setup();
    setEnvelopes([makeEnvelope({ id: 1, allocatedCents: 0 })]);
    render(<AllocationPage />);

    const input = screen.getByTestId('allocation-input-1');
    await user.clear(input);
    await user.type(input, 'abc');
    await user.tab(); // blur

    await waitFor(() => {
      expect(screen.getByTestId('allocation-error-1')).toBeInTheDocument();
    });
  });

  it('does NOT show error while typing (only on blur)', async () => {
    const user = userEvent.setup();
    setEnvelopes([makeEnvelope({ id: 1, allocatedCents: 0 })]);
    render(<AllocationPage />);

    const input = screen.getByTestId('allocation-input-1');
    await user.clear(input);
    await user.type(input, 'abc');
    // No blur — error should not appear yet
    expect(screen.queryByTestId('allocation-error-1')).not.toBeInTheDocument();
  });

  // AC 7: overage blocks Confirm and shows message
  it('disables Confirm button and shows overage message when over budget', async () => {
    const user = userEvent.setup();
    setEnvelopes([makeEnvelope({ id: 1, allocatedCents: 0 })]);
    setIncomeEntries([makeIncome({ amountCents: 10000 })]);
    render(<AllocationPage />);

    const input = screen.getByTestId('allocation-input-1');
    await user.clear(input);
    await user.type(input, '500.00'); // $500 > $100 income
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByTestId('overage-message')).toBeInTheDocument();
      expect(screen.getByTestId('overage-message')).toHaveTextContent('Over budget by');
    });

    expect(screen.getByTestId('confirm-allocation-button')).toBeDisabled();
  });

  // AC 8: successful confirm calls allocateEnvelopes and navigates
  it('calls allocateEnvelopes with cents values and navigates to / on success', async () => {
    const user = userEvent.setup();
    setEnvelopes([makeEnvelope({ id: 1, allocatedCents: 0 })]);
    setIncomeEntries([makeIncome({ amountCents: 500000 })]);
    render(<AllocationPage />);

    const input = screen.getByTestId('allocation-input-1');
    await user.clear(input);
    await user.type(input, '150.00');
    fireEvent.blur(input);

    await user.click(screen.getByTestId('confirm-allocation-button'));

    await waitFor(() => {
      expect(mockAllocateEnvelopes).toHaveBeenCalledWith([
        { id: 1, allocatedCents: 15000 },
      ]);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });

  // Error state: inline error shown when allocateEnvelopes fails
  it('shows inline error message when allocation command fails', async () => {
    setEnvelopes([makeEnvelope({ id: 1, allocatedCents: 0 })]);
    setIncomeEntries([makeIncome({ amountCents: 500000 })]);
    mockAllocateEnvelopes.mockImplementation(async () => {
      // Simulate store setting an error
      setAllocationError({ code: 'DB_ERROR', message: 'fail' });
    });
    render(<AllocationPage />);

    // Blur the input to make it valid
    const input = screen.getByTestId('allocation-input-1');
    fireEvent.blur(input);

    await userEvent.click(screen.getByTestId('confirm-allocation-button'));

    await waitFor(() => {
      expect(screen.getByTestId('allocation-error')).toBeInTheDocument();
    });
  });
});
