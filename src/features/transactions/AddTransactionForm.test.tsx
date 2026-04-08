import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddTransactionForm from './AddTransactionForm';
import type { Envelope } from '@/lib/types';

// ── Store mocks ──────────────────────────────────────────────────────────────

const mockTransactionState = {
  transactions: [],
  importResult: null,
  isWriting: false,
  error: null as { message: string } | null,
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
};

vi.mock('@/stores/useEnvelopeStore', () => ({
  useEnvelopeStore: vi.fn((selector: (s: typeof mockEnvelopeState) => unknown) =>
    selector(mockEnvelopeState),
  ),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AddTransactionForm', () => {
  const onSuccess = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionState.isWriting = false;
    mockTransactionState.error = null;
    mockTransactionState.createTransaction.mockResolvedValue(undefined);
    mockEnvelopeState.envelopes = [];
  });

  it('renders payee, amount, date, and category fields', () => {
    render(<AddTransactionForm onSuccess={onSuccess} onCancel={onCancel} />);
    expect(screen.getByPlaceholderText('Payee')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Amount (e.g. -12.34)')).toBeInTheDocument();
    expect(screen.getByDisplayValue(new Date().toISOString().slice(0, 10))).toBeInTheDocument();
    // Category select is rendered (contains "None" option text)
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('submits with valid amount and calls createTransaction with isCleared: false and correct amountCents', async () => {
    render(<AddTransactionForm onSuccess={onSuccess} onCancel={onCancel} />);

    await userEvent.type(screen.getByPlaceholderText('Payee'), 'Coffee Shop');
    await userEvent.type(screen.getByPlaceholderText('Amount (e.g. -12.34)'), '-12.34');

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockTransactionState.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          payee: 'Coffee Shop',
          amountCents: -1234,
          isCleared: false,
        }),
      );
    });
  });

  it('does NOT call createTransaction and shows inline error when amount is invalid', async () => {
    render(<AddTransactionForm onSuccess={onSuccess} onCancel={onCancel} />);

    await userEvent.type(screen.getByPlaceholderText('Amount (e.g. -12.34)'), 'abc');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(mockTransactionState.createTransaction).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid amount (e.g. -12.34)')).toBeInTheDocument();
  });

  it('does NOT call createTransaction when amount is empty', async () => {
    render(<AddTransactionForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(mockTransactionState.createTransaction).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid amount (e.g. -12.34)')).toBeInTheDocument();
  });

  it('allows blank payee — form submits with payee: empty string', async () => {
    render(<AddTransactionForm onSuccess={onSuccess} onCancel={onCancel} />);

    await userEvent.type(screen.getByPlaceholderText('Amount (e.g. -12.34)'), '-5.00');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockTransactionState.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ payee: '' }),
      );
    });
  });

  it('clicking Cancel calls onCancel without calling createTransaction', () => {
    render(<AddTransactionForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
    expect(mockTransactionState.createTransaction).not.toHaveBeenCalled();
  });

  it('category "None" submits with envelopeId: null', async () => {
    render(<AddTransactionForm onSuccess={onSuccess} onCancel={onCancel} />);

    await userEvent.type(screen.getByPlaceholderText('Amount (e.g. -12.34)'), '-10.00');
    // Default category is 'none', so no change needed
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockTransactionState.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ envelopeId: null }),
      );
    });
  });

  it('calls onSuccess after successful createTransaction', async () => {
    mockTransactionState.error = null;
    render(<AddTransactionForm onSuccess={onSuccess} onCancel={onCancel} />);

    await userEvent.type(screen.getByPlaceholderText('Amount (e.g. -12.34)'), '-5.00');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
