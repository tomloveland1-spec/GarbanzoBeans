import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Envelope } from '@/lib/types';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockBorrowFromEnvelope } = vi.hoisted(() => ({
  mockBorrowFromEnvelope: vi.fn(),
}));

// ── Store mock ────────────────────────────────────────────────────────────────

vi.mock('@/stores/useEnvelopeStore', () => {
  const store = {
    envelopes: [] as Envelope[],
    isWriting: false,
    error: null as { code: string; message: string } | null,
    borrowError: null as { code: string; message: string } | null,
    borrowFromEnvelope: mockBorrowFromEnvelope,
    loadEnvelopes: vi.fn(),
    createEnvelope: vi.fn(),
    updateEnvelope: vi.fn(),
    deleteEnvelope: vi.fn(),
    allocateEnvelopes: vi.fn(),
  };
  const useEnvelopeStore = Object.assign(
    vi.fn((selector?: (s: typeof store) => unknown) =>
      selector ? selector(store) : store
    ),
    { getState: vi.fn(() => store) },
  );
  return { useEnvelopeStore };
});

import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import BorrowOverlay from './BorrowOverlay';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeEnvelope = (overrides: Partial<Envelope> = {}): Envelope => ({
  id: 1,
  name: 'Groceries',
  type: 'Rolling',
  priority: 'Need',
  allocatedCents: 50000,
  monthId: null,
  createdAt: '2026-01-01T00:00:00Z',
  isSavings: false,
  ...overrides,
});

function setStore(partialStore: Partial<ReturnType<typeof useEnvelopeStore.getState>>) {
  const store = useEnvelopeStore.getState();
  Object.assign(store, partialStore);
  vi.mocked(useEnvelopeStore).mockImplementation((selector?: (s: typeof store) => unknown) =>
    selector ? selector(store) : store
  );
  vi.mocked(useEnvelopeStore.getState).mockReturnValue(store);
}

const targetEnvelope = makeEnvelope({ id: 99, name: 'Car Repair', allocatedCents: 0 });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BorrowOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStore({ envelopes: [], borrowError: null });
    mockBorrowFromEnvelope.mockResolvedValue(undefined);
  });

  it('shows empty state when no funded sources exist', () => {
    setStore({ envelopes: [targetEnvelope] });
    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={vi.fn()} />);
    expect(screen.getByText(/No funded envelopes to borrow from/i)).toBeInTheDocument();
  });

  it('renders source envelopes sorted Want → Should → Need', () => {
    const need = makeEnvelope({ id: 1, name: 'Rent', priority: 'Need', allocatedCents: 10000 });
    const should = makeEnvelope({ id: 2, name: 'Fun', priority: 'Should', allocatedCents: 20000 });
    const want = makeEnvelope({ id: 3, name: 'Treat', priority: 'Want', allocatedCents: 30000 });
    setStore({ envelopes: [need, should, want, targetEnvelope] });

    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={vi.fn()} />);

    const buttons = screen.getAllByRole('button', { name: /Rent|Fun|Treat/i });
    const names = buttons.map((b) => b.textContent?.trim() ?? '');
    const treatIdx = names.findIndex((n) => n.includes('Treat'));
    const funIdx = names.findIndex((n) => n.includes('Fun'));
    const rentIdx = names.findIndex((n) => n.includes('Rent'));
    expect(treatIdx).toBeLessThan(funIdx);
    expect(funIdx).toBeLessThan(rentIdx);
  });

  it('renders savings envelope last with a visual divider', () => {
    const regular = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 50000 });
    const savings = makeEnvelope({ id: 2, name: 'Savings', allocatedCents: 100000, isSavings: true });
    setStore({ envelopes: [regular, savings, targetEnvelope] });

    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={vi.fn()} />);

    expect(screen.getByLabelText('Savings separator')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button', { name: /Vacation|Savings/i });
    const names = buttons.map((b) => b.textContent?.trim() ?? '');
    const vacIdx = names.findIndex((n) => n.includes('Vacation'));
    const savIdx = names.findIndex((n) => n.includes('Savings'));
    expect(vacIdx).toBeLessThan(savIdx);
  });

  it('Borrow button is disabled when no source is selected', () => {
    const source = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 50000 });
    setStore({ envelopes: [source, targetEnvelope] });

    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={vi.fn()} />);

    const borrowBtn = screen.getByRole('button', { name: /^Borrow$/i });
    expect(borrowBtn).toBeDisabled();
  });

  it('Borrow button is disabled when amount is invalid', () => {
    const source = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 50000 });
    setStore({ envelopes: [source, targetEnvelope] });

    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Vacation/i }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });

    expect(screen.getByRole('button', { name: /^Borrow$/i })).toBeDisabled();
  });

  it('Borrow button disabled when amount exceeds source balance', () => {
    const source = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 10000 });
    setStore({ envelopes: [source, targetEnvelope] });

    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Vacation/i }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '200' } });

    expect(screen.getByRole('button', { name: /^Borrow$/i })).toBeDisabled();
    expect(screen.getByText(/Amount exceeds available balance/i)).toBeInTheDocument();
  });

  it('shows real-time preview when valid amount entered', () => {
    const source = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 50000 });
    const target = makeEnvelope({ id: 99, name: 'Car Repair', allocatedCents: 0 });
    setStore({ envelopes: [source, target] });

    render(<BorrowOverlay targetEnvelope={target} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Vacation/i }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '100' } });

    expect(screen.getByText(/Borrowing/i)).toBeInTheDocument();
    // The preview text includes "Borrowing $100.00 → Car Repair: $100.00"
    expect(screen.getAllByText(/Car Repair/i).length).toBeGreaterThan(0);
  });

  it('transitions to savings confirmation view when savings source is selected', () => {
    const savings = makeEnvelope({ id: 2, name: 'Savings', allocatedCents: 100000, isSavings: true });
    setStore({ envelopes: [savings, targetEnvelope] });

    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Savings/i }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: /^Borrow$/i }));

    expect(screen.getByText(/Borrow \$80\.00 from Savings/i)).toBeInTheDocument();
    expect(screen.getByText(/New savings balance/i)).toBeInTheDocument();
    expect(screen.getByText(/This is exactly what it's for/i)).toBeInTheDocument();
  });

  it('savings confirmation Cancel returns to source selection without closing', () => {
    const savings = makeEnvelope({ id: 2, name: 'Savings', allocatedCents: 100000, isSavings: true });
    setStore({ envelopes: [savings, targetEnvelope] });

    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Savings/i }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: /^Borrow$/i }));

    expect(screen.getByText(/Borrow \$80\.00 from Savings/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    // Should return to source selection, not close
    expect(screen.getByRole('button', { name: /Savings/i })).toBeInTheDocument();
    expect(mockBorrowFromEnvelope).not.toHaveBeenCalled();
  });

  it('savings Confirm calls borrowFromEnvelope and closes overlay', async () => {
    const savings = makeEnvelope({ id: 2, name: 'Savings', allocatedCents: 100000, isSavings: true });
    setStore({ envelopes: [savings, targetEnvelope] });
    const onClose = vi.fn();

    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Savings/i }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: /^Borrow$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }));

    await waitFor(() => {
      expect(mockBorrowFromEnvelope).toHaveBeenCalledWith({
        sourceEnvelopeId: 2,
        targetEnvelopeId: 99,
        amountCents: 8000,
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('non-savings Borrow calls borrowFromEnvelope and closes overlay', async () => {
    const source = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 50000 });
    setStore({ envelopes: [source, targetEnvelope] });
    const onClose = vi.fn();

    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Vacation/i }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /^Borrow$/i }));

    await waitFor(() => {
      expect(mockBorrowFromEnvelope).toHaveBeenCalledWith({
        sourceEnvelopeId: 1,
        targetEnvelopeId: 99,
        amountCents: 10000,
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel button closes overlay without calling borrowFromEnvelope', () => {
    const source = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 50000 });
    setStore({ envelopes: [source, targetEnvelope] });
    const onClose = vi.fn();

    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    expect(mockBorrowFromEnvelope).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('displays borrowError message inline', () => {
    const source = makeEnvelope({ id: 1, name: 'Vacation', allocatedCents: 50000 });
    setStore({
      envelopes: [source, targetEnvelope],
      borrowError: { code: 'INSUFFICIENT_BALANCE', message: 'Not enough balance.' },
    });

    render(<BorrowOverlay targetEnvelope={targetEnvelope} open onClose={vi.fn()} />);

    expect(screen.getByText(/Not enough balance\./i)).toBeInTheDocument();
  });
});
