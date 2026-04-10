import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EnvelopeCard from './EnvelopeCard';
import type { Envelope, Transaction } from '@/lib/types';
import { STATE_COLORS, getEnvelopeStateExplanation } from '@/lib/envelopeState';
import { TooltipProvider } from '@/components/ui/tooltip';

// Mock the envelope store
vi.mock('@/stores/useEnvelopeStore', () => {
  const mockUpdateEnvelope = vi.fn();
  const mockDeleteEnvelope = vi.fn();

  const store = {
    envelopes: [],
    isWriting: false,
    error: null,
    updateEnvelope: mockUpdateEnvelope,
    deleteEnvelope: mockDeleteEnvelope,
    loadEnvelopes: vi.fn(),
    createEnvelope: vi.fn(),
  };

  const useEnvelopeStore = Object.assign(vi.fn(() => store), {
    getState: vi.fn(() => store),
  });

  return { useEnvelopeStore };
});

// Mock the settings store
vi.mock('@/stores/useSettingsStore', () => {
  const store = { isReadOnly: false };
  const useSettingsStore = vi.fn((selector: (s: typeof store) => unknown) => selector(store));
  return { useSettingsStore };
});

// Mock the transaction store
vi.mock('@/stores/useTransactionStore', () => {
  const store = { transactions: [] as Transaction[] };
  const useTransactionStore = vi.fn((selector: (s: typeof store) => unknown) => selector(store));
  return { useTransactionStore };
});

import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useTransactionStore } from '@/stores/useTransactionStore';

function mockTransactions(transactions: Partial<Transaction>[] = []) {
  vi.mocked(useTransactionStore).mockImplementation(
    (selector: (s: { transactions: Transaction[] }) => unknown) =>
      selector({ transactions: transactions as Transaction[] }),
  );
}

const makeEnvelope = (overrides: Partial<Envelope> = {}): Envelope => ({
  id: 1,
  name: 'Groceries',
  type: 'Rolling',
  priority: 'Need',
  allocatedCents: 12345,
  monthId: null,
  createdAt: '2026-01-01T00:00:00Z',
  isSavings: false,
  ...overrides,
});

// Helper to render with TooltipProvider (needed for Radix Tooltip)
const renderCard = (envelope: Envelope) =>
  render(
    <TooltipProvider delayDuration={0}>
      <EnvelopeCard envelope={envelope} />
    </TooltipProvider>
  );

describe('EnvelopeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactions([]);
    // Reset store state
    const store = useEnvelopeStore.getState();
    vi.mocked(store.updateEnvelope).mockResolvedValue(undefined);
    vi.mocked(store.deleteEnvelope).mockResolvedValue(undefined);
    vi.mocked(useEnvelopeStore).mockReturnValue({
      ...store,
      isWriting: false,
    });
    // Reset settings store to non-read-only
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: { isReadOnly: boolean }) => unknown) => selector({ isReadOnly: false }),
    );
  });

  it('renders name, type, priority, and formatted allocated amount', () => {
    const envelope = makeEnvelope();
    renderCard(envelope);

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Rolling')).toBeInTheDocument();
    expect(screen.getByText('Need')).toBeInTheDocument();
    // Allocated label + value
    expect(screen.getByText('Allocated')).toBeInTheDocument();
    expect(screen.getAllByText('$123.45').length).toBeGreaterThan(0);
  });

  it('renders three labeled amounts: Allocated, Spent, Remaining', () => {
    const envelope = makeEnvelope({ allocatedCents: 5000 });
    renderCard(envelope);

    expect(screen.getByText('Allocated')).toBeInTheDocument();
    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
    // Spent shows $0.00 (no transactions mocked)
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    // Allocated and Remaining both show $50.00 (no spending)
    expect(screen.getAllByText('$50.00').length).toBe(2);
  });

  it('clicking name activates edit mode (Input appears)', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    renderCard(envelope);

    await user.click(screen.getByText('Groceries'));

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Groceries');
  });

  it('pressing Escape in edit mode restores original name without calling store', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    renderCard(envelope);

    await user.click(screen.getByText('Groceries'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Changed');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(useEnvelopeStore.getState().updateEnvelope).not.toHaveBeenCalled();
  });

  it('pressing Enter calls updateEnvelope with new name', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    renderCard(envelope);

    await user.click(screen.getByText('Groceries'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Supermarket');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(useEnvelopeStore.getState().updateEnvelope).toHaveBeenCalledWith({
        id: 1,
        name: 'Supermarket',
      });
    });
  });

  it('blur on name input calls updateEnvelope', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    renderCard(envelope);

    await user.click(screen.getByText('Groceries'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Supermarket');
    fireEvent.blur(input);

    await waitFor(() => {
      expect(useEnvelopeStore.getState().updateEnvelope).toHaveBeenCalledWith({
        id: 1,
        name: 'Supermarket',
      });
    });
  });

  it('⋯ button has aria-label "Envelope actions"', () => {
    const envelope = makeEnvelope();
    renderCard(envelope);

    expect(screen.getByRole('button', { name: 'Envelope actions' })).toBeInTheDocument();
  });

  it('clicking ⋯ button opens dropdown menu with Edit and Delete items', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    renderCard(envelope);

    await user.click(screen.getByRole('button', { name: 'Envelope actions' }));

    expect(await screen.findByText('Edit')).toBeInTheDocument();
    expect(await screen.findByText('Delete')).toBeInTheDocument();
  });

  it('clicking Delete in dropdown opens delete confirmation dialog', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    renderCard(envelope);

    await user.click(screen.getByRole('button', { name: 'Envelope actions' }));
    await user.click(await screen.findByText('Delete'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Groceries')).toBeInTheDocument();
  });

  it('clicking Ghost Cancel in delete dialog does not call deleteEnvelope', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    renderCard(envelope);

    await user.click(screen.getByRole('button', { name: 'Envelope actions' }));
    await user.click(await screen.findByText('Delete'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(useEnvelopeStore.getState().deleteEnvelope).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clicking Destructive Delete calls deleteEnvelope(envelope.id)', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope({ id: 42 });
    renderCard(envelope);

    await user.click(screen.getByRole('button', { name: 'Envelope actions' }));
    await user.click(await screen.findByText('Delete'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(useEnvelopeStore.getState().deleteEnvelope).toHaveBeenCalledWith(42);
    });
  });

  it('"Set as Savings" menu item renders when isSavings = false', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope({ isSavings: false });
    renderCard(envelope);

    await user.click(screen.getByRole('button', { name: 'Envelope actions' }));
    expect(await screen.findByText('Set as Savings')).toBeInTheDocument();
  });

  it('"Set as Savings" menu item does NOT render when isSavings = true', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope({ isSavings: true });
    renderCard(envelope);

    await user.click(screen.getByRole('button', { name: 'Envelope actions' }));
    await screen.findByText('Edit'); // wait for menu to open
    expect(screen.queryByText('Set as Savings')).not.toBeInTheDocument();
  });

  it('clicking Edit in dropdown opens edit dialog with type and priority selects', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    renderCard(envelope);

    await user.click(screen.getByRole('button', { name: 'Envelope actions' }));
    await user.click(await screen.findByText('Edit'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit Groceries')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
  });

  it('read-only mode disables the ⋯ button', () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: { isReadOnly: boolean }) => unknown) => selector({ isReadOnly: true }),
    );
    const envelope = makeEnvelope();
    renderCard(envelope);

    expect(screen.getByRole('button', { name: 'Envelope actions' })).toBeDisabled();
  });

  it('read-only mode prevents name click from entering edit mode', async () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: { isReadOnly: boolean }) => unknown) => selector({ isReadOnly: true }),
    );
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    renderCard(envelope);

    await user.click(screen.getByText('Groceries'));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // State bar tests
  it('funded envelope (allocatedCents > 0) renders lime state bar border color', () => {
    const envelope = makeEnvelope({ allocatedCents: 5000 });
    const { container } = renderCard(envelope);

    const card = container.firstChild as HTMLElement;
    expect(card.style.borderLeft).toBe(`4px solid ${STATE_COLORS.funded}`);
  });

  it('caution envelope (allocatedCents = 0) renders amber state bar border color', () => {
    const envelope = makeEnvelope({ allocatedCents: 0 });
    const { container } = renderCard(envelope);

    const card = container.firstChild as HTMLElement;
    expect(card.style.borderLeft).toBe(`4px solid ${STATE_COLORS.caution}`);
  });

  // State badge label tests
  it('state badge label renders "Funded" for funded envelope (allocatedCents > 0)', () => {
    const envelope = makeEnvelope({ allocatedCents: 5000 });
    renderCard(envelope);

    expect(screen.getByText('Funded')).toBeInTheDocument();
  });

  it('state badge label renders "Unfunded" for caution envelope (allocatedCents = 0)', () => {
    const envelope = makeEnvelope({ allocatedCents: 0 });
    renderCard(envelope);

    expect(screen.getByText('Unfunded')).toBeInTheDocument();
  });

  // Tooltip content test
  it('tooltip content matches getEnvelopeStateExplanation for Rolling/funded', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope({ type: 'Rolling', allocatedCents: 5000 });
    renderCard(envelope);

    const stateBadge = screen.getByText('Funded');
    await user.hover(stateBadge);

    const expectedText = getEnvelopeStateExplanation('Rolling', 'funded');
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(expectedText);
  });

  // Transaction-wired spent amount tests
  it('Spent amount derives from matched transactions', () => {
    mockTransactions([
      { id: 10, envelopeId: 1, amountCents: -3000, isCleared: false },
      { id: 11, envelopeId: 2, amountCents: -5000, isCleared: false },
    ]);
    const envelope = makeEnvelope({ id: 1, allocatedCents: 10000 });
    renderCard(envelope);

    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();
  });

  it('Remaining = allocated − spent', () => {
    mockTransactions([
      { id: 10, envelopeId: 1, amountCents: -4000, isCleared: false },
    ]);
    const envelope = makeEnvelope({ id: 1, allocatedCents: 10000 });
    renderCard(envelope);

    expect(screen.getAllByText('$100.00').length).toBe(1); // Allocated
    expect(screen.getByText('$40.00')).toBeInTheDocument(); // Spent
    expect(screen.getByText('$60.00')).toBeInTheDocument(); // Remaining
  });

  it('overspent state when spentCents > allocatedCents', () => {
    mockTransactions([
      { id: 10, envelopeId: 1, amountCents: -8000, isCleared: false },
    ]);
    const envelope = makeEnvelope({ id: 1, allocatedCents: 5000 });
    const { container } = renderCard(envelope);

    const card = container.firstChild as HTMLElement;
    expect(card.style.borderLeft).toBe(`4px solid ${STATE_COLORS.overspent}`);
    expect(screen.getByText('Over budget')).toBeInTheDocument();
  });

  // Edit dialog Name field tests
  it('Edit dialog contains Name input pre-populated with envelope name', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope({ name: 'Groceries' });
    renderCard(envelope);

    await user.click(screen.getByRole('button', { name: 'Envelope actions' }));
    await user.click(await screen.findByText('Edit'));
    await screen.findByRole('dialog');

    const nameInput = screen.getByTestId('edit-envelope-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Groceries');
  });

  it('Edit save includes updated name in updateEnvelope payload', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope({ name: 'Groceries' });
    renderCard(envelope);

    await user.click(screen.getByRole('button', { name: 'Envelope actions' }));
    await user.click(await screen.findByText('Edit'));
    await screen.findByRole('dialog');

    const nameInput = screen.getByTestId('edit-envelope-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, 'Supermarket');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(useEnvelopeStore.getState().updateEnvelope).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, name: 'Supermarket' }),
      );
    });
  });
});
