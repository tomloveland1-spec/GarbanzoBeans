import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EnvelopeCard from './EnvelopeCard';
import type { Envelope } from '@/lib/types';
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

import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

const makeEnvelope = (overrides: Partial<Envelope> = {}): Envelope => ({
  id: 1,
  name: 'Groceries',
  type: 'Rolling',
  priority: 'Need',
  allocatedCents: 12345,
  monthId: null,
  createdAt: '2026-01-01T00:00:00Z',
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
    // Spent and Remaining both show $0.00 (hardcoded until Epic 3)
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    // Allocated and Remaining both show $50.00
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
});
