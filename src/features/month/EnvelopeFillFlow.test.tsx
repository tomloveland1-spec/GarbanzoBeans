import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Envelope } from '@/lib/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/stores/useEnvelopeStore');
vi.mock('@/lib/currency', () => ({
  formatCurrency: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

import { invoke } from '@tauri-apps/api/core';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import EnvelopeFillFlow from './EnvelopeFillFlow';

const mockUseEnvelopeStore = vi.mocked(useEnvelopeStore);

function makeEnvelope(overrides: Partial<Envelope> = {}): Envelope {
  return {
    id: 1,
    name: 'Groceries',
    type: 'Rolling',
    priority: 'Need',
    allocatedCents: 0,
    monthId: null,
    createdAt: '2026-01-01T00:00:00Z',
    isSavings: false,
    ...overrides,
  };
}

function setStoreEnvelopes(envelopes: Envelope[]) {
  mockUseEnvelopeStore.mockReturnValue({
    envelopes,
    isWriting: false,
    error: null,
    borrowError: null,
    loadEnvelopes: vi.fn(),
    createEnvelope: vi.fn(),
    updateEnvelope: vi.fn(),
    deleteEnvelope: vi.fn(),
    allocateEnvelopes: vi.fn(),
    borrowFromEnvelope: vi.fn(),
  });
}

describe('EnvelopeFillFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue([]);
    setStoreEnvelopes([]);
  });

  it('renders with data-testid="envelope-fill-flow"', () => {
    render(<EnvelopeFillFlow monthId={1} onAllocationsChange={vi.fn()} />);
    expect(screen.getByTestId('envelope-fill-flow')).toBeTruthy();
  });

  it('shows "No envelopes to allocate" when envelopes is empty', () => {
    render(<EnvelopeFillFlow monthId={1} onAllocationsChange={vi.fn()} />);
    expect(screen.getByText('No envelopes to allocate.')).toBeTruthy();
  });

  it('renders savings envelope first with lime border', () => {
    const savings = makeEnvelope({ id: 10, name: 'ING Savings', isSavings: true });
    const regular = makeEnvelope({ id: 20, name: 'Groceries', isSavings: false });
    setStoreEnvelopes([regular, savings]); // savings listed second in store, should render first
    render(<EnvelopeFillFlow monthId={1} onAllocationsChange={vi.fn()} />);
    expect(screen.getByTestId('savings-envelope-row-10')).toBeTruthy();
    const savingsRow = screen.getByTestId('savings-envelope-row-10') as HTMLElement;
    // Browser normalizes #C0F500 to rgb(192, 245, 0); check either form
    const border = savingsRow.style.border;
    expect(border.includes('#C0F500') || border.includes('rgb(192, 245, 0)')).toBe(true);
  });

  it('shows "Even $50 keeps your streak alive" prompt for savings envelope', () => {
    const savings = makeEnvelope({ id: 10, name: 'ING Savings', isSavings: true });
    setStoreEnvelopes([savings]);
    render(<EnvelopeFillFlow monthId={1} onAllocationsChange={vi.fn()} />);
    expect(screen.getByText('Even $50 keeps your streak alive')).toBeTruthy();
  });

  it('renders regular envelopes after savings', () => {
    const savings = makeEnvelope({ id: 10, name: 'ING Savings', isSavings: true });
    const regular = makeEnvelope({ id: 20, name: 'Groceries', isSavings: false });
    setStoreEnvelopes([savings, regular]);
    render(<EnvelopeFillFlow monthId={1} onAllocationsChange={vi.fn()} />);
    expect(screen.getByTestId('envelope-row-20')).toBeTruthy();
  });

  it('shows allocation input for each envelope', () => {
    const env1 = makeEnvelope({ id: 1, name: 'Rent', isSavings: false });
    const env2 = makeEnvelope({ id: 2, name: 'Food', isSavings: false });
    setStoreEnvelopes([env1, env2]);
    render(<EnvelopeFillFlow monthId={1} onAllocationsChange={vi.fn()} />);
    expect(screen.getByTestId('allocation-input-1')).toBeTruthy();
    expect(screen.getByTestId('allocation-input-2')).toBeTruthy();
  });

  it('calls onAllocationsChange on mount with initial draft values', async () => {
    const env = makeEnvelope({ id: 3, name: 'Rent', allocatedCents: 120000, isSavings: false });
    setStoreEnvelopes([env]);
    const onAllocationsChange = vi.fn();
    render(<EnvelopeFillFlow monthId={1} onAllocationsChange={onAllocationsChange} />);
    await waitFor(() => {
      expect(onAllocationsChange).toHaveBeenCalledWith([{ id: 3, allocatedCents: 120000 }]);
    });
  });

  it('calls onAllocationsChange with correct cents when typing', () => {
    const env = makeEnvelope({ id: 5, name: 'Dining', isSavings: false });
    setStoreEnvelopes([env]);
    const onAllocationsChange = vi.fn();
    render(<EnvelopeFillFlow monthId={1} onAllocationsChange={onAllocationsChange} />);
    fireEvent.change(screen.getByTestId('allocation-input-5'), { target: { value: '50.00' } });
    expect(onAllocationsChange).toHaveBeenCalledWith([{ id: 5, allocatedCents: 5000 }]);
  });

  it('calls onAllocationsChange with savings + regular envelopes', () => {
    const savings = makeEnvelope({ id: 10, name: 'ING', isSavings: true });
    const regular = makeEnvelope({ id: 20, name: 'Groceries', isSavings: false });
    setStoreEnvelopes([savings, regular]);
    const onAllocationsChange = vi.fn();
    render(<EnvelopeFillFlow monthId={1} onAllocationsChange={onAllocationsChange} />);
    fireEvent.change(screen.getByTestId('allocation-input-10'), { target: { value: '100.00' } });
    const lastCall = onAllocationsChange.mock.calls[onAllocationsChange.mock.calls.length - 1][0];
    expect(lastCall).toContainEqual({ id: 10, allocatedCents: 10000 });
  });

  it('shows available income header', () => {
    render(<EnvelopeFillFlow monthId={1} onAllocationsChange={vi.fn()} />);
    expect(screen.getByTestId('available-income-header')).toBeTruthy();
  });

  it('shows income amount after suggestions load', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{ payDate: '2026-05-01', amountCents: 300000, label: null }]);
    const env = makeEnvelope({ id: 1, name: 'Rent' });
    setStoreEnvelopes([env]);
    render(<EnvelopeFillFlow monthId={1} onAllocationsChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('available-income-amount').textContent).not.toBe('…');
    });
  });
});
