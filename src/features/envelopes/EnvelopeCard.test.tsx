import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EnvelopeCard from './EnvelopeCard';
import type { Envelope } from '@/lib/types';

// Mock the store
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

  const useEnvelopeStore = vi.fn(() => store);
  useEnvelopeStore.getState = vi.fn(() => store);

  return { useEnvelopeStore };
});

import { useEnvelopeStore } from '@/stores/useEnvelopeStore';

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

describe('EnvelopeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    const store = useEnvelopeStore.getState();
    (store.updateEnvelope as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (store.deleteEnvelope as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    // Reset isWriting
    (useEnvelopeStore as ReturnType<typeof vi.fn>).mockReturnValue({
      ...store,
      isWriting: false,
    });
  });

  it('renders name, type, priority, and formatted amount', () => {
    const envelope = makeEnvelope();
    render(<EnvelopeCard envelope={envelope} />);

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Rolling')).toBeInTheDocument();
    expect(screen.getByText('Need')).toBeInTheDocument();
    expect(screen.getByText('$123.45')).toBeInTheDocument();
  });

  it('clicking name activates edit mode (Input appears)', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    render(<EnvelopeCard envelope={envelope} />);

    await user.click(screen.getByText('Groceries'));

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Groceries');
  });

  it('pressing Escape in edit mode restores original name without calling store', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    render(<EnvelopeCard envelope={envelope} />);

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
    render(<EnvelopeCard envelope={envelope} />);

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
    render(<EnvelopeCard envelope={envelope} />);

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

  it('clicking ⋯ button opens delete confirmation dialog', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    render(<EnvelopeCard envelope={envelope} />);

    await user.click(screen.getByRole('button', { name: 'Envelope settings' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Groceries')).toBeInTheDocument();
  });

  it('clicking Ghost Cancel in dialog does not call deleteEnvelope', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope();
    render(<EnvelopeCard envelope={envelope} />);

    await user.click(screen.getByRole('button', { name: 'Envelope settings' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(useEnvelopeStore.getState().deleteEnvelope).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clicking Destructive Delete calls deleteEnvelope(envelope.id)', async () => {
    const user = userEvent.setup();
    const envelope = makeEnvelope({ id: 42 });
    render(<EnvelopeCard envelope={envelope} />);

    await user.click(screen.getByRole('button', { name: 'Envelope settings' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(useEnvelopeStore.getState().deleteEnvelope).toHaveBeenCalledWith(42);
    });
  });
});
