import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TransactionRow from './TransactionRow';
import type { Transaction, Envelope } from '@/lib/types';

// ── Store mocks ──────────────────────────────────────────────────────────────

const mockTransactionState = {
  transactions: [] as Transaction[],
  importResult: null,
  isWriting: false,
  error: null,
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
};

vi.mock('@/stores/useTransactionStore', () => ({
  useTransactionStore: vi.fn((selector: (s: typeof mockTransactionState) => unknown) =>
    selector(mockTransactionState),
  ),
}));

import { useTransactionStore } from '@/stores/useTransactionStore';
(useTransactionStore as unknown as { getState: () => typeof mockTransactionState }).getState = () => mockTransactionState;

const mockEnvelopeState = {
  envelopes: [] as Envelope[],
  loadEnvelopes: vi.fn(),
};

vi.mock('@/stores/useEnvelopeStore', () => ({
  useEnvelopeStore: vi.fn((selector: (s: typeof mockEnvelopeState) => unknown) =>
    selector(mockEnvelopeState),
  ),
}));

import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
(useEnvelopeStore as unknown as { getState: () => typeof mockEnvelopeState }).getState = () => mockEnvelopeState;

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 1,
  payee: 'Acme Corp',
  amountCents: -5000,
  date: '2026-01-15',
  envelopeId: null,
  isCleared: true,
  importBatchId: null,
  createdAt: '2026-01-15T00:00:00Z',
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

function renderRow(tx: Transaction, envelopes: Envelope[] = [], matchedRuleLabel?: string) {
  const envelopeMap = new Map(envelopes.map(e => [e.id, e.name]));
  return render(
    <table><tbody>
      <TransactionRow
        transaction={tx}
        envelopeMap={envelopeMap}
        envelopes={envelopes}
        matchedRuleLabel={matchedRuleLabel}
      />
    </tbody></table>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TransactionRow — inline editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionState.updateTransaction.mockResolvedValue(undefined);
    mockEnvelopeState.loadEnvelopes.mockResolvedValue(undefined);
  });

  // ── Payee ────────────────────────────────────────────────────────────────

  it('clicking payee cell activates edit mode — input with current payee value appears', () => {
    renderRow(makeTx({ payee: 'Acme Corp' }));
    // Payee text is the second td
    const payeeCell = screen.getByText('Acme Corp').closest('td')!;
    fireEvent.click(payeeCell);
    const input = screen.getByDisplayValue('Acme Corp');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('Enter in payee edit calls updateTransaction with new payee and closes edit mode', async () => {
    renderRow(makeTx({ payee: 'Acme Corp' }));
    const payeeCell = screen.getByText('Acme Corp').closest('td')!;
    fireEvent.click(payeeCell);

    const input = screen.getByDisplayValue('Acme Corp');
    fireEvent.change(input, { target: { value: 'New Payee' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockTransactionState.updateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, payee: 'New Payee' }),
      );
    });
    // Edit mode should close — input gone
    await waitFor(() => {
      expect(screen.queryByDisplayValue('New Payee')).not.toBeInTheDocument();
    });
  });

  it('Escape in payee edit cancels without calling updateTransaction', () => {
    renderRow(makeTx({ payee: 'Acme Corp' }));
    const payeeCell = screen.getByText('Acme Corp').closest('td')!;
    fireEvent.click(payeeCell);

    const input = screen.getByDisplayValue('Acme Corp');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(mockTransactionState.updateTransaction).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue('Changed')).not.toBeInTheDocument();
  });

  it('Escape then blur does NOT call updateTransaction (no double-fire)', async () => {
    renderRow(makeTx({ payee: 'Acme Corp' }));
    const payeeCell = screen.getByText('Acme Corp').closest('td')!;
    fireEvent.click(payeeCell);

    const input = screen.getByDisplayValue('Acme Corp');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input); // simulates blur that fires after Escape

    await new Promise(r => setTimeout(r, 10));
    expect(mockTransactionState.updateTransaction).not.toHaveBeenCalled();
  });

  it('blur on payee edit calls updateTransaction', async () => {
    renderRow(makeTx({ payee: 'Acme Corp' }));
    const payeeCell = screen.getByText('Acme Corp').closest('td')!;
    fireEvent.click(payeeCell);

    const input = screen.getByDisplayValue('Acme Corp');
    fireEvent.change(input, { target: { value: 'Blurred Payee' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockTransactionState.updateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ payee: 'Blurred Payee' }),
      );
    });
  });

  // ── Amount ───────────────────────────────────────────────────────────────

  it('amount edit parses dollars to cents correctly (e.g. "-12.34" → -1234)', async () => {
    renderRow(makeTx({ amountCents: -5000 }));
    // Amount cell shows formatted currency; click it
    const amountCell = screen.getByText('-$50.00').closest('td')!;
    fireEvent.click(amountCell);

    const input = screen.getByDisplayValue('-50.00');
    fireEvent.change(input, { target: { value: '-12.34' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockTransactionState.updateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, amountCents: -1234 }),
      );
    });
  });

  it('invalid amount (e.g. "abc") does NOT call updateTransaction', async () => {
    renderRow(makeTx({ amountCents: -5000 }));
    const amountCell = screen.getByText('-$50.00').closest('td')!;
    fireEvent.click(amountCell);

    const input = screen.getByDisplayValue('-50.00');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Give async a chance
    await new Promise(r => setTimeout(r, 10));
    expect(mockTransactionState.updateTransaction).not.toHaveBeenCalled();
  });

  // ── Category (Select) ────────────────────────────────────────────────────

  it('category select change calls updateTransaction with envelopeId and then calls loadEnvelopes', async () => {
    const env = makeEnvelope({ id: 7, name: 'Groceries' });
    renderRow(makeTx({ envelopeId: null }), [env]);

    // Click the category cell to activate Select
    const categoryCell = screen.getByText('Uncategorized').closest('td')!;
    fireEvent.click(categoryCell);

    // Find the SelectTrigger button and open it
    const trigger = categoryCell.querySelector('button')!;
    fireEvent.click(trigger);

    // Click the Groceries option
    const option = await screen.findByRole('option', { name: 'Groceries' });
    fireEvent.click(option);

    await waitFor(() => {
      expect(mockTransactionState.updateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, envelopeId: 7 }),
      );
    });
    await waitFor(() => {
      expect(mockEnvelopeState.loadEnvelopes).toHaveBeenCalled();
    });
  });

  // ── matchedRuleLabel ─────────────────────────────────────────────────────

  it('renders matchedRuleLabel when provided', () => {
    renderRow(makeTx({ envelopeId: 7 }), [], '-> Groceries via Kroger rule');
    expect(screen.getByTestId('matched-rule-label')).toHaveTextContent(
      '-> Groceries via Kroger rule',
    );
  });

  it('does NOT render matched-rule label element when matchedRuleLabel is undefined', () => {
    renderRow(makeTx());
    expect(screen.queryByTestId('matched-rule-label')).not.toBeInTheDocument();
  });

  // ── Savings directional indicator ────────────────────────────────────────

  it('shows "↓ deposited" for savings transaction with negative amountCents', () => {
    const savingsEnv = makeEnvelope({ id: 5, name: 'ING Savings', isSavings: true });
    const tx = makeTx({ envelopeId: 5, amountCents: -30000 });
    renderRow(tx, [savingsEnv]);

    const indicator = screen.getByTestId('savings-direction');
    expect(indicator).toHaveTextContent('↓ deposited');
  });

  it('shows "↑ withdrew" for savings transaction with positive amountCents', () => {
    const savingsEnv = makeEnvelope({ id: 5, name: 'ING Savings', isSavings: true });
    const tx = makeTx({ envelopeId: 5, amountCents: 10000 });
    renderRow(tx, [savingsEnv]);

    const indicator = screen.getByTestId('savings-direction');
    expect(indicator).toHaveTextContent('↑ withdrew');
  });

  it('shows no directional indicator for non-savings transaction', () => {
    const regularEnv = makeEnvelope({ id: 3, name: 'Groceries', isSavings: false });
    const tx = makeTx({ envelopeId: 3, amountCents: -5000 });
    renderRow(tx, [regularEnv]);

    expect(screen.queryByTestId('savings-direction')).not.toBeInTheDocument();
  });

  it('shows no directional indicator when transaction has no envelope', () => {
    const tx = makeTx({ envelopeId: null, amountCents: -5000 });
    renderRow(tx, []);

    expect(screen.queryByTestId('savings-direction')).not.toBeInTheDocument();
  });

  it('category "None" calls updateTransaction with clearEnvelopeId: true', async () => {
    const env = makeEnvelope({ id: 7, name: 'Groceries' });
    renderRow(makeTx({ envelopeId: 7 }), [env]);

    const categoryCell = screen.getByText('Groceries').closest('td')!;
    fireEvent.click(categoryCell);

    const trigger = categoryCell.querySelector('button')!;
    fireEvent.click(trigger);

    const option = await screen.findByRole('option', { name: 'None' });
    fireEvent.click(option);

    await waitFor(() => {
      expect(mockTransactionState.updateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, clearEnvelopeId: true }),
      );
    });
  });
});
