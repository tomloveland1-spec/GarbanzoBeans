import { vi, describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TransactionRow from './TransactionRow';
import type { Transaction, Envelope } from '@/lib/types';

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

function renderRow(
  tx: Transaction,
  envelopes: Envelope[] = [],
  opts: { matchedRuleLabel?: string; isSelected?: boolean; onSelect?: () => void } = {},
) {
  const envelopeMap = new Map(envelopes.map((e) => [e.id, e.name]));
  const onSelect = opts.onSelect ?? vi.fn();
  return {
    onSelect,
    ...render(
      <table>
        <tbody>
          <TransactionRow
            transaction={tx}
            envelopeMap={envelopeMap}
            envelopes={envelopes}
            matchedRuleLabel={opts.matchedRuleLabel}
            isSelected={opts.isSelected ?? false}
            onSelect={onSelect}
          />
        </tbody>
      </table>,
    ),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TransactionRow — rendering', () => {
  it('renders payee, formatted date, and amount', () => {
    renderRow(makeTx({ payee: 'Acme Corp', amountCents: -5000, date: '2026-01-15' }));
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Jan 15')).toBeInTheDocument();
    expect(screen.getByText('-$50.00')).toBeInTheDocument();
  });

  it('renders "Uncategorized" pill when envelopeId is null', () => {
    renderRow(makeTx({ envelopeId: null }));
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  it('renders envelope name pill when envelopeId is set', () => {
    const env = makeEnvelope({ id: 7, name: 'Groceries' });
    renderRow(makeTx({ envelopeId: 7 }), [env]);
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });

  it('renders "Unknown" pill when envelopeId is set but envelope not in map', () => {
    renderRow(makeTx({ envelopeId: 999 }), []);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders cleared checkmark when isCleared is true', () => {
    renderRow(makeTx({ isCleared: true }));
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders uncleared circle indicator when isCleared is false', () => {
    renderRow(makeTx({ isCleared: false }));
    expect(screen.getByText('○')).toBeInTheDocument();
  });

  it('uncleared rows have opacity 0.5', () => {
    const { container } = renderRow(makeTx({ isCleared: false }));
    const row = container.querySelector('tr')!;
    expect(row.style.opacity).toBe('0.5');
  });

  it('cleared rows do not have opacity 0.5', () => {
    const { container } = renderRow(makeTx({ isCleared: true }));
    const row = container.querySelector('tr')!;
    expect(row.style.opacity).not.toBe('0.5');
  });
});

describe('TransactionRow — selection', () => {
  it('clicking the row calls onSelect', () => {
    const onSelect = vi.fn();
    const { container } = renderRow(makeTx(), [], { onSelect });
    fireEvent.click(container.querySelector('tr')!);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('selected row has a highlight background', () => {
    const { container } = renderRow(makeTx(), [], { isSelected: true });
    const row = container.querySelector('tr')!;
    expect(row.style.backgroundColor).toBeTruthy();
  });

  it('unselected row has no highlight background', () => {
    const { container } = renderRow(makeTx(), [], { isSelected: false });
    const row = container.querySelector('tr')!;
    expect(row.style.backgroundColor).toBeFalsy();
  });
});

describe('TransactionRow — matchedRuleLabel', () => {
  it('renders matchedRuleLabel when provided', () => {
    renderRow(makeTx({ envelopeId: 7 }), [], {
      matchedRuleLabel: '-> Groceries via Kroger rule',
    });
    expect(screen.getByTestId('matched-rule-label')).toHaveTextContent(
      '-> Groceries via Kroger rule',
    );
  });

  it('does NOT render matched-rule label element when matchedRuleLabel is undefined', () => {
    renderRow(makeTx());
    expect(screen.queryByTestId('matched-rule-label')).not.toBeInTheDocument();
  });
});

describe('TransactionRow — savings directional indicator', () => {
  it('shows "↓ deposited" for savings transaction with negative amountCents', () => {
    const savingsEnv = makeEnvelope({ id: 5, name: 'ING Savings', isSavings: true });
    renderRow(makeTx({ envelopeId: 5, amountCents: -30000 }), [savingsEnv]);
    expect(screen.getByTestId('savings-direction')).toHaveTextContent('Savings Deposit');
  });

  it('shows "↑ withdrew" for savings transaction with positive amountCents', () => {
    const savingsEnv = makeEnvelope({ id: 5, name: 'ING Savings', isSavings: true });
    renderRow(makeTx({ envelopeId: 5, amountCents: 10000 }), [savingsEnv]);
    expect(screen.getByTestId('savings-direction')).toHaveTextContent('Savings Withdrawal');
  });

  it('shows no directional indicator for non-savings transaction', () => {
    const regularEnv = makeEnvelope({ id: 3, name: 'Groceries', isSavings: false });
    renderRow(makeTx({ envelopeId: 3, amountCents: -5000 }), [regularEnv]);
    expect(screen.queryByTestId('savings-direction')).not.toBeInTheDocument();
  });

  it('shows no directional indicator when transaction has no envelope', () => {
    renderRow(makeTx({ envelopeId: null, amountCents: -5000 }));
    expect(screen.queryByTestId('savings-direction')).not.toBeInTheDocument();
  });
});
