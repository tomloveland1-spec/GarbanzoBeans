import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import LedgerView from './LedgerView';
import type { Transaction, ImportResult, Envelope } from '@/lib/types';

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
};

const mockUpdateTransaction = vi.fn().mockResolvedValue(undefined);
const mockLoadEnvelopes = vi.fn().mockResolvedValue(undefined);

vi.mock('@/stores/useTransactionStore', () => ({
  useTransactionStore: Object.assign(
    vi.fn((selector: (s: typeof mockTransactionState) => unknown) =>
      selector(mockTransactionState),
    ),
    { getState: () => ({ updateTransaction: mockUpdateTransaction }) },
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

let _txId = 0;
const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: ++_txId,
  payee: 'Acme Corp',
  amountCents: -5000,
  date: '2026-01-15',
  envelopeId: null,
  isCleared: true,
  importBatchId: null,
  createdAt: '2026-01-15T00:00:00Z',
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

  it('renders Inflow and Outflow balance labels', () => {
    render(<LedgerView />);
    expect(screen.getByText('Inflow')).toBeInTheDocument();
    expect(screen.getByText('Outflow')).toBeInTheDocument();
  });

  it('computes cleared balance from only is_cleared=true transactions', () => {
    mockTransactionState.transactions = [
      makeTx({ id: 1, amountCents: -5000, isCleared: true }),
      makeTx({ id: 2, amountCents: -3000, isCleared: false }),
    ];
    render(<LedgerView />);
    // Cleared: -5000 cents = -$50.00
    // Working: -8000 cents = -$80.00
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

  it('renders import summary line when importResult is non-null', () => {
    mockTransactionState.importResult = {
      count: 5,
      batchId: 'abc',
      latestDate: '2026-10-12',
      transactions: [],
      matchedTransactions: [],
      categorizedAnnotations: {},
      uncategorizedIds: [],
      conflictedIds: [],
    };
    render(<LedgerView />);
    expect(screen.getByText('Import — Oct 12 — 5 transactions')).toBeInTheDocument();
  });

  it('does NOT render import summary line when importResult is null', () => {
    mockTransactionState.importResult = null;
    render(<LedgerView />);
    expect(screen.queryByText(/Import —/)).not.toBeInTheDocument();
  });

  it('renders import summary without date when importResult.latestDate is null', () => {
    mockTransactionState.importResult = {
      count: 3,
      batchId: 'abc',
      latestDate: null,
      transactions: [],
      matchedTransactions: [],
      categorizedAnnotations: {},
      uncategorizedIds: [],
      conflictedIds: [],
    };
    render(<LedgerView />);
    expect(screen.getByText('Import — 3 transactions')).toBeInTheDocument();
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

  it('uncleared transaction rows have reduced visual emphasis (opacity 0.5)', () => {
    mockTransactionState.transactions = [
      makeTx({ id: 1, payee: 'Cleared Store', isCleared: true }),
      makeTx({ id: 2, payee: 'Uncleared Store', isCleared: false }),
    ];
    const { container } = render(<LedgerView />);
    const rows = container.querySelectorAll('tbody tr');
    expect((rows[0] as HTMLElement).style.opacity).not.toBe('0.5');
    expect((rows[1] as HTMLElement).style.opacity).toBe('0.5');
  });

  it('does not render empty state when transactions exist', () => {
    mockTransactionState.transactions = [makeTx()];
    render(<LedgerView />);
    expect(screen.queryByText(/No transactions yet/)).not.toBeInTheDocument();
  });

  describe('UnknownMerchantQueue integration', () => {
    it('renders queue section when importResult.uncategorizedIds is non-empty', () => {
      const tx = makeTx({ id: 50, envelopeId: null });
      mockTransactionState.transactions = [tx];
      mockTransactionState.importResult = {
        count: 1,
        batchId: 'import_abc',
        latestDate: '2026-04-08',
        transactions: [tx],
        matchedTransactions: [],
        categorizedAnnotations: {},
        uncategorizedIds: [50],
        conflictedIds: [],
      };
      render(<LedgerView />);
      expect(screen.getByTestId('unknown-merchant-queue')).toBeInTheDocument();
      expect(screen.getByTestId('queue-header')).toHaveTextContent('1 transaction need a category');
    });

    it('renders queue section when importResult.conflictedIds is non-empty', () => {
      const tx = makeTx({ id: 51, envelopeId: null });
      mockTransactionState.transactions = [tx];
      mockTransactionState.importResult = {
        count: 1,
        batchId: 'import_abc',
        latestDate: '2026-04-08',
        transactions: [tx],
        matchedTransactions: [],
        categorizedAnnotations: {},
        uncategorizedIds: [],
        conflictedIds: [51],
      };
      render(<LedgerView />);
      expect(screen.getByTestId('unknown-merchant-queue')).toBeInTheDocument();
    });

    it('does NOT render queue section when both uncategorizedIds and conflictedIds are empty', () => {
      const tx = makeTx({ id: 52, envelopeId: 1 });
      mockTransactionState.transactions = [tx];
      mockTransactionState.importResult = {
        count: 1,
        batchId: 'import_abc',
        latestDate: '2026-04-08',
        transactions: [tx],
        matchedTransactions: [],
        categorizedAnnotations: {},
        uncategorizedIds: [],
        conflictedIds: [],
      };
      render(<LedgerView />);
      expect(screen.queryByTestId('unknown-merchant-queue')).not.toBeInTheDocument();
    });

    it('does NOT render queue section when importResult is null', () => {
      mockTransactionState.importResult = null;
      render(<LedgerView />);
      expect(screen.queryByTestId('unknown-merchant-queue')).not.toBeInTheDocument();
    });

    it('deduplicates queueIds when a transaction ID appears in both uncategorizedIds and conflictedIds', () => {
      const tx = makeTx({ id: 60, envelopeId: null });
      mockTransactionState.transactions = [tx];
      mockTransactionState.importResult = {
        count: 1,
        batchId: 'import_abc',
        latestDate: '2026-04-08',
        transactions: [tx],
        matchedTransactions: [],
        categorizedAnnotations: {},
        uncategorizedIds: [60],
        conflictedIds: [60],
      };
      render(<LedgerView />);
      expect(screen.getAllByTestId(/^queue-item-/)).toHaveLength(1);
    });
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
});
