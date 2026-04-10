import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UnknownMerchantQueue from './UnknownMerchantQueue';
import type { Transaction, Envelope } from '@/lib/types';

// ── Store mocks ──────────────────────────────────────────────────────────────

const mockUpdateTransaction = vi.fn().mockResolvedValue(undefined);
const mockLoadEnvelopes = vi.fn().mockResolvedValue(undefined);
const mockCreateRule = vi.fn().mockResolvedValue(undefined);

vi.mock('@/stores/useTransactionStore', () => ({
  useTransactionStore: {
    getState: () => ({ updateTransaction: mockUpdateTransaction }),
  },
}));

vi.mock('@/stores/useEnvelopeStore', () => ({
  useEnvelopeStore: {
    getState: () => ({ loadEnvelopes: mockLoadEnvelopes }),
  },
}));

vi.mock('@/stores/useMerchantRuleStore', () => ({
  useMerchantRuleStore: {
    getState: () => ({ createRule: mockCreateRule }),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 1,
  payee: 'Unknown Store',
  amountCents: -2500,
  date: '2026-04-05',
  envelopeId: null,
  isCleared: true,
  importBatchId: 'import_abc',
  createdAt: '2026-04-05T00:00:00Z',
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

const defaultProps = {
  queueIds: [] as number[],
  transactions: [] as Transaction[],
  envelopes: [] as Envelope[],
  conflictedIds: [] as number[],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('UnknownMerchantQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when queueIds is empty', () => {
    const { container } = render(
      <UnknownMerchantQueue {...defaultProps} queueIds={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the queue section when queueIds is non-empty', () => {
    const tx = makeTx({ id: 1 });
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={[makeEnvelope()]}
      />,
    );
    expect(screen.getByTestId('unknown-merchant-queue')).toBeInTheDocument();
  });

  it('renders correct header count for single item', () => {
    const tx = makeTx({ id: 1 });
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={[makeEnvelope()]}
      />,
    );
    expect(screen.getByTestId('queue-header')).toHaveTextContent('1 transaction need a category');
  });

  it('renders correct header count for multiple items', () => {
    const txs = [makeTx({ id: 1 }), makeTx({ id: 2, payee: 'Another Store' })];
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1, 2]}
        transactions={txs}
        envelopes={[makeEnvelope()]}
      />,
    );
    expect(screen.getByTestId('queue-header')).toHaveTextContent('2 transactions need a category');
  });

  it('renders payee name for each queue item', () => {
    const txs = [
      makeTx({ id: 1, payee: 'Store A' }),
      makeTx({ id: 2, payee: 'Store B' }),
    ];
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1, 2]}
        transactions={txs}
        envelopes={[makeEnvelope()]}
      />,
    );
    expect(screen.getByText('Store A')).toBeInTheDocument();
    expect(screen.getByText('Store B')).toBeInTheDocument();
  });

  it('renders formatted amount for each item', () => {
    const tx = makeTx({ id: 1, amountCents: -2500 });
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={[makeEnvelope()]}
      />,
    );
    expect(screen.getByText('-$25.00')).toBeInTheDocument();
  });

  it('renders conflict note for conflicted items', () => {
    const tx = makeTx({ id: 1, payee: 'Ambiguous Store' });
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={[makeEnvelope()]}
        conflictedIds={[1]}
      />,
    );
    expect(screen.getByTestId('conflict-note-1')).toHaveTextContent(
      'Multiple rules matched — choose manually',
    );
  });

  it('does NOT render conflict note for non-conflicted items', () => {
    const tx = makeTx({ id: 1 });
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={[makeEnvelope()]}
        conflictedIds={[]}
      />,
    );
    expect(screen.queryByTestId('conflict-note-1')).not.toBeInTheDocument();
  });

  it('renders category Select with envelope options', () => {
    const tx = makeTx({ id: 1 });
    const envelopes = [
      makeEnvelope({ id: 1, name: 'Groceries' }),
      makeEnvelope({ id: 2, name: 'Gas' }),
    ];
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={envelopes}
      />,
    );
    // SelectTrigger should be present with the aria-label
    expect(screen.getByRole('combobox', { name: `Category for ${tx.payee}` })).toBeInTheDocument();
  });

  it('calls updateTransaction with correct id and envelopeId on category selection', async () => {
    const tx = makeTx({ id: 5, payee: 'Mystery Mart' });
    const envelopes = [makeEnvelope({ id: 7, name: 'Dining' })];
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[5]}
        transactions={[tx]}
        envelopes={envelopes}
      />,
    );

    // Open the select and pick an option
    const trigger = screen.getByRole('combobox', { name: 'Category for Mystery Mart' });
    fireEvent.click(trigger);

    const option = await screen.findByRole('option', { name: 'Dining' });
    fireEvent.click(option);

    // handleAssign is async — wait for the full chain to complete
    await waitFor(() => {
      expect(mockUpdateTransaction).toHaveBeenCalledWith({ id: 5, envelopeId: 7 });
      expect(mockLoadEnvelopes).toHaveBeenCalled();
    });
  });

  it('only renders items whose IDs are in queueIds (filters by ID)', () => {
    const txs = [
      makeTx({ id: 1, payee: 'In Queue' }),
      makeTx({ id: 2, payee: 'Not In Queue' }),
    ];
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={txs}
        envelopes={[makeEnvelope()]}
      />,
    );
    expect(screen.getByText('In Queue')).toBeInTheDocument();
    expect(screen.queryByText('Not In Queue')).not.toBeInTheDocument();
  });

  // ── Rule-builder mode tests ──────────────────────────────────────────────

  it('renders "Save as rule" toggle button per queue item', () => {
    const tx = makeTx({ id: 1, payee: 'Kroger #0423' });
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={[makeEnvelope()]}
      />,
    );
    expect(screen.getByTestId('save-as-rule-btn-1')).toBeInTheDocument();
  });

  it('clicking "Save as rule" renders SubstringRuleBuilder for that item', () => {
    const tx = makeTx({ id: 1, payee: 'Kroger #0423' });
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={[makeEnvelope()]}
      />,
    );

    fireEvent.click(screen.getByTestId('save-as-rule-btn-1'));

    // SubstringRuleBuilder renders payee-spans-container
    expect(screen.getByTestId('payee-spans-container')).toBeInTheDocument();
  });

  it('category select in rule-builder mode does NOT call updateTransaction immediately', async () => {
    const tx = makeTx({ id: 1, payee: 'Kroger' });
    const envelopes = [makeEnvelope({ id: 2, name: 'Groceries' })];
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={envelopes}
      />,
    );

    // Enter rule-builder mode
    fireEvent.click(screen.getByTestId('save-as-rule-btn-1'));

    // Select a category in rule-builder mode
    const trigger = screen.getByRole('combobox', { name: 'Category for Kroger' });
    fireEvent.click(trigger);
    const option = await screen.findByRole('option', { name: 'Groceries' });
    fireEvent.click(option);

    // updateTransaction must NOT have been called yet
    expect(mockUpdateTransaction).not.toHaveBeenCalled();
  });

  it('"Save rule" button is disabled when no substring and no category', () => {
    const tx = makeTx({ id: 1, payee: 'Kroger' });
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={[makeEnvelope()]}
      />,
    );

    fireEvent.click(screen.getByTestId('save-as-rule-btn-1'));

    expect(screen.getByTestId('save-rule-btn-1')).toBeDisabled();
  });

  it('"Save rule" button is disabled when substring is set but no category', () => {
    const tx = makeTx({ id: 1, payee: 'Kroger' });
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={[makeEnvelope()]}
      />,
    );

    fireEvent.click(screen.getByTestId('save-as-rule-btn-1'));

    // Simulate selecting a substring via keyboard (full payee)
    const container = screen.getByTestId('payee-spans-container');
    fireEvent.keyDown(container, { key: ' ' });

    // No category selected yet — still disabled
    expect(screen.getByTestId('save-rule-btn-1')).toBeDisabled();
  });

  it('"Save rule" button enabled when both substring and category present; calls updateTransaction then createRule', async () => {
    const tx = makeTx({ id: 1, payee: 'Kroger' });
    const envelopes = [makeEnvelope({ id: 2, name: 'Groceries' })];
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={envelopes}
      />,
    );

    // Enter rule-builder mode
    fireEvent.click(screen.getByTestId('save-as-rule-btn-1'));

    // Select full payee as substring via keyboard
    const container = screen.getByTestId('payee-spans-container');
    fireEvent.keyDown(container, { key: ' ' });

    // Select a category
    const trigger = screen.getByRole('combobox', { name: 'Category for Kroger' });
    fireEvent.click(trigger);
    const option = await screen.findByRole('option', { name: 'Groceries' });
    fireEvent.click(option);

    // Button should now be enabled
    const saveBtn = screen.getByTestId('save-rule-btn-1');
    expect(saveBtn).not.toBeDisabled();

    // Click save
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateTransaction).toHaveBeenCalledWith({ id: 1, envelopeId: 2 });
      expect(mockCreateRule).toHaveBeenCalledWith({ payeeSubstring: 'Kroger', envelopeId: 2 });
    });
  });

  it('clicking "Dismiss" with a pendingEnvelopeId calls updateTransaction but not createRule', async () => {
    const tx = makeTx({ id: 1, payee: 'Kroger' });
    const envelopes = [makeEnvelope({ id: 2, name: 'Groceries' })];
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={envelopes}
      />,
    );

    // Enter rule-builder mode
    fireEvent.click(screen.getByTestId('save-as-rule-btn-1'));

    // Select a category (sets pendingEnvelopeId)
    const trigger = screen.getByRole('combobox', { name: 'Category for Kroger' });
    fireEvent.click(trigger);
    const option = await screen.findByRole('option', { name: 'Groceries' });
    fireEvent.click(option);

    // Dismiss
    fireEvent.click(screen.getByTestId('dismiss-rule-btn-1'));

    await waitFor(() => {
      expect(mockUpdateTransaction).toHaveBeenCalledWith({ id: 1, envelopeId: 2 });
    });
    expect(mockCreateRule).not.toHaveBeenCalled();
  });

  it('clicking "Dismiss" with no pendingEnvelopeId collapses builder without calling updateTransaction', () => {
    const tx = makeTx({ id: 1, payee: 'Kroger' });
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[1]}
        transactions={[tx]}
        envelopes={[makeEnvelope()]}
      />,
    );

    // Enter rule-builder mode (no category selected)
    fireEvent.click(screen.getByTestId('save-as-rule-btn-1'));
    expect(screen.getByTestId('payee-spans-container')).toBeInTheDocument();

    // Dismiss without selecting a category
    fireEvent.click(screen.getByTestId('dismiss-rule-btn-1'));

    // Builder should be collapsed — payee text visible again, no spans container
    expect(screen.queryByTestId('payee-spans-container')).not.toBeInTheDocument();
    expect(mockUpdateTransaction).not.toHaveBeenCalled();
  });

  it('normal mode category Select still calls updateTransaction immediately (regression: 4.3 behavior)', async () => {
    const tx = makeTx({ id: 3, payee: 'Target' });
    const envelopes = [makeEnvelope({ id: 4, name: 'Shopping' })];
    render(
      <UnknownMerchantQueue
        {...defaultProps}
        queueIds={[3]}
        transactions={[tx]}
        envelopes={envelopes}
      />,
    );

    // Do NOT enter rule-builder mode — use normal select
    const trigger = screen.getByRole('combobox', { name: 'Category for Target' });
    fireEvent.click(trigger);
    const option = await screen.findByRole('option', { name: 'Shopping' });
    fireEvent.click(option);

    await waitFor(() => {
      expect(mockUpdateTransaction).toHaveBeenCalledWith({ id: 3, envelopeId: 4 });
    });
    expect(mockCreateRule).not.toHaveBeenCalled();
  });
});
