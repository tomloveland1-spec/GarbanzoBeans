import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LedgerView from './LedgerView';
import type { Transaction, ImportResult, Envelope } from '@/lib/types';

// ── Component stubs ──────────────────────────────────────────────────────────

vi.mock('./OFXImporter', () => ({ default: () => null }));
vi.mock('./AddTransactionForm', () => ({ default: () => null }));

// ── Store mocks ──────────────────────────────────────────────────────────────

const mockSettingsState = { isReadOnly: false };

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: vi.fn((selector: (s: typeof mockSettingsState) => unknown) =>
    selector(mockSettingsState),
  ),
}));

const mockTransactionState = {
  transactions: [] as Transaction[],
  importResult: null as ImportResult | null,
  error: null as { message: string } | null,
};

const mockUpdateTransaction = vi.fn().mockResolvedValue(undefined);
const mockLoadEnvelopes = vi.fn().mockResolvedValue(undefined);

vi.mock('@/stores/useTransactionStore', () => ({
  useTransactionStore: Object.assign(
    vi.fn((selector: (s: typeof mockTransactionState) => unknown) =>
      selector(mockTransactionState),
    ),
    { getState: () => ({ updateTransaction: mockUpdateTransaction, error: mockTransactionState.error }) },
  ),
}));

const mockEnvelopeState = {
  envelopes: [] as Envelope[],
};

vi.mock('@/stores/useEnvelopeStore', () => ({
  useEnvelopeStore: Object.assign(
    vi.fn((selector: (s: typeof mockEnvelopeState) => unknown) =>
      selector(mockEnvelopeState),
    ),
    { getState: () => ({ loadEnvelopes: mockLoadEnvelopes }) },
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split('T')[0]!;

let _txId = 0;
const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: ++_txId,
  payee: 'Acme Corp',
  amountCents: -5000,
  date: TODAY,
  envelopeId: null,
  isCleared: true,
  importBatchId: null,
  createdAt: TODAY + 'T00:00:00Z',
  memo: null,
  ...overrides,
});

const makeEnvelope = (overrides: Partial<Envelope> = {}): Envelope => ({
  id: 1,
  name: 'Groceries',
  type: 'Rolling',
  priority: 'Need',
  allocatedCents: 10000,
  monthId: null,
  createdAt: '2026-01-01T00:00:00Z',
  isSavings: false,
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LedgerView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _txId = 0;
    mockTransactionState.transactions = [];
    mockTransactionState.importResult = null;
    mockTransactionState.error = null;
    mockEnvelopeState.envelopes = [];
    mockSettingsState.isReadOnly = false;
  });

  it('renders empty state when transactions array is empty', () => {
    render(<LedgerView />);
    expect(
      screen.getByText('No transactions yet — use Import OFX to get started'),
    ).toBeInTheDocument();
  });

  it('renders Cleared and Working balance labels', () => {
    render(<LedgerView />);
    expect(screen.getByText('Cleared')).toBeInTheDocument();
    expect(screen.getByText('Working')).toBeInTheDocument();
  });

  it('computes cleared balance from only is_cleared=true transactions', () => {
    mockTransactionState.transactions = [
      makeTx({ id: 1, amountCents: -5000, isCleared: true }),
      makeTx({ id: 2, amountCents: -3000, isCleared: false }),
    ];
    render(<LedgerView />);
    expect(screen.getByTestId('balance-cleared')).toHaveTextContent('-$50.00');
    expect(screen.getByTestId('balance-working')).toHaveTextContent('-$80.00');
  });

  it('renders category pill with "Uncategorized" when envelopeId is null', () => {
    mockTransactionState.transactions = [makeTx({ envelopeId: null })];
    render(<LedgerView />);
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  it('renders envelope name pill when envelopeId is non-null and envelope exists', () => {
    mockEnvelopeState.envelopes = [makeEnvelope({ id: 7, name: 'Groceries' })];
    mockTransactionState.transactions = [makeTx({ envelopeId: 7 })];
    render(<LedgerView />);
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });

  it('renders "Unknown" pill when envelopeId is non-null but envelope not in map', () => {
    mockEnvelopeState.envelopes = [];
    mockTransactionState.transactions = [makeTx({ envelopeId: 999 })];
    render(<LedgerView />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders matched-rule label for auto-categorized transactions in latest import', () => {
    const env = makeEnvelope({ id: 7, name: 'Groceries' });
    mockEnvelopeState.envelopes = [env];
    mockTransactionState.transactions = [
      makeTx({ id: 10, envelopeId: 7, importBatchId: 'import_abc' }),
    ];
    mockTransactionState.importResult = {
      count: 1,
      batchId: 'import_abc',
      latestDate: '2026-10-12',
      transactions: [makeTx({ id: 10, envelopeId: 7, importBatchId: 'import_abc' })],
      matchedTransactions: [],
      categorizedAnnotations: { '10': 'Kroger' },
      uncategorizedIds: [],
      conflictedIds: [],
    };
    render(<LedgerView />);
    expect(screen.getByTestId('matched-rule-label')).toHaveTextContent(
      '-> Groceries via Kroger rule',
    );
  });

  it('does NOT render matched-rule label for uncategorized or older transactions', () => {
    mockTransactionState.transactions = [
      makeTx({ id: 20, envelopeId: null, importBatchId: 'import_abc' }),
    ];
    mockTransactionState.importResult = {
      count: 1,
      batchId: 'import_abc',
      latestDate: '2026-10-12',
      transactions: [makeTx({ id: 20, envelopeId: null })],
      matchedTransactions: [],
      categorizedAnnotations: {},
      uncategorizedIds: [20],
      conflictedIds: [],
    };
    render(<LedgerView />);
    expect(screen.queryByTestId('matched-rule-label')).not.toBeInTheDocument();
  });

  it('does NOT render matched-rule label when importResult is null (older session)', () => {
    mockTransactionState.transactions = [
      makeTx({ id: 30, envelopeId: 7, importBatchId: 'import_old' }),
    ];
    mockTransactionState.importResult = null;
    render(<LedgerView />);
    expect(screen.queryByTestId('matched-rule-label')).not.toBeInTheDocument();
  });

  it('uncleared transaction rows have reduced visual emphasis (opacity 0.55)', () => {
    mockTransactionState.transactions = [
      makeTx({ id: 1, payee: 'Cleared Store', isCleared: true }),
      makeTx({ id: 2, payee: 'Uncleared Store', isCleared: false }),
    ];
    const { container } = render(<LedgerView />);
    const rows = container.querySelectorAll('tbody tr');
    expect((rows[0] as HTMLElement).style.opacity).not.toBe('0.55');
    expect((rows[1] as HTMLElement).style.opacity).toBe('0.55');
  });

  it('does not render empty state when transactions exist', () => {
    mockTransactionState.transactions = [makeTx()];
    render(<LedgerView />);
    expect(screen.queryByText(/No transactions yet/)).not.toBeInTheDocument();
  });

  it('disables Add Transaction button when isReadOnly = true', () => {
    mockSettingsState.isReadOnly = true;
    render(<LedgerView />);
    expect(screen.getByRole('button', { name: /add transaction/i })).toBeDisabled();
  });

  it('does NOT render matched-rule label for a transaction not in a subsequent import batch', () => {
    mockEnvelopeState.envelopes = [makeEnvelope({ id: 7, name: 'Groceries' })];
    mockTransactionState.transactions = [
      makeTx({ id: 10, envelopeId: 7, importBatchId: 'import_old' }),
    ];
    mockTransactionState.importResult = {
      count: 1,
      batchId: 'import_new',
      latestDate: '2026-10-15',
      transactions: [makeTx({ id: 99, envelopeId: null })],
      matchedTransactions: [],
      categorizedAnnotations: {},
      uncategorizedIds: [99],
      conflictedIds: [],
    };
    render(<LedgerView />);
    expect(screen.queryByTestId('matched-rule-label')).not.toBeInTheDocument();
  });

  // ── Inline editing ────────────────────────────────────────────────────────

  it('enters edit mode when a row is clicked', () => {
    mockTransactionState.transactions = [makeTx({ id: 1, payee: 'Acme Corp' })];
    render(<LedgerView />);
    const row = screen.getByText('Acme Corp').closest('tr')!;
    fireEvent.click(row);
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('does not enter edit mode when isReadOnly = true', () => {
    mockSettingsState.isReadOnly = true;
    mockTransactionState.transactions = [makeTx({ id: 1, payee: 'Acme Corp' })];
    render(<LedgerView />);
    const row = screen.getByText('Acme Corp').closest('tr')!;
    fireEvent.click(row);
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('clicking a different row while editing discards the current draft and edits the new row', () => {
    mockTransactionState.transactions = [
      makeTx({ id: 1, payee: 'Row One' }),
      makeTx({ id: 2, payee: 'Row Two' }),
    ];
    render(<LedgerView />);
    fireEvent.click(screen.getByText('Row One').closest('tr')!);
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Row Two').closest('tr')!);
    // Still one Save button — now for Row Two
    expect(screen.getAllByRole('button', { name: /save/i })).toHaveLength(1);
  });

  it('cancel button exits edit mode without saving', () => {
    mockTransactionState.transactions = [makeTx({ id: 1, payee: 'Acme Corp' })];
    render(<LedgerView />);
    fireEvent.click(screen.getByText('Acme Corp').closest('tr')!);
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    expect(mockUpdateTransaction).not.toHaveBeenCalled();
  });

  it('Save calls updateTransaction with correct payload', async () => {
    mockTransactionState.transactions = [
      makeTx({ id: 1, payee: 'Acme Corp', amountCents: -5000, envelopeId: null, isCleared: true, memo: null }),
    ];
    render(<LedgerView />);
    fireEvent.click(screen.getByText('Acme Corp').closest('tr')!);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockUpdateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          payee: 'Acme Corp',
          amountCents: -5000,
          date: TODAY,
          clearEnvelopeId: true,
          memo: null,
        }),
      );
    });
  });

  it('shows inline error and does not call updateTransaction for non-numeric amount', async () => {
    mockTransactionState.transactions = [makeTx({ id: 1 })];
    render(<LedgerView />);
    fireEvent.click(screen.getByText('Acme Corp').closest('tr')!);
    const amountInput = screen.getByDisplayValue('-50.00');
    fireEvent.change(amountInput, { target: { value: 'not-a-number' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/enter a valid amount/i)).toBeInTheDocument();
    expect(mockUpdateTransaction).not.toHaveBeenCalled();
  });

  it('Cleared cell click calls updateTransaction immediately without entering edit mode', async () => {
    mockTransactionState.transactions = [makeTx({ id: 1, isCleared: true })];
    render(<LedgerView />);
    const clearedCell = screen.getByLabelText('Mark uncleared');
    fireEvent.click(clearedCell);
    await waitFor(() => {
      expect(mockUpdateTransaction).toHaveBeenCalledWith({ id: 1, isCleared: false });
    });
    // No Save button should appear — edit mode was not entered
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('Cleared cell click is a no-op when isReadOnly = true', async () => {
    mockSettingsState.isReadOnly = true;
    mockTransactionState.transactions = [makeTx({ id: 1, isCleared: true })];
    render(<LedgerView />);
    const clearedCell = screen.getByLabelText('Mark uncleared');
    fireEvent.click(clearedCell);
    await waitFor(() => {
      expect(mockUpdateTransaction).not.toHaveBeenCalled();
    });
  });

  it('does not render savings deposit/withdrawal sublabel on amount', () => {
    mockEnvelopeState.envelopes = [makeEnvelope({ id: 1, isSavings: true })];
    mockTransactionState.transactions = [makeTx({ id: 1, envelopeId: 1, amountCents: -10000 })];
    render(<LedgerView />);
    expect(screen.queryByText(/savings deposit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/savings withdrawal/i)).not.toBeInTheDocument();
  });

});
