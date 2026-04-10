import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SavingsCard from '@/components/gb/SavingsCard';
import type { Envelope } from '@/lib/types';

// ── Store mock ──────────────────────────────────────────────────────────────

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

vi.mock('@/stores/useEnvelopeStore', () => {
  const useEnvelopeStore = Object.assign(vi.fn(() => store), {
    getState: vi.fn(() => store),
  });
  return { useEnvelopeStore };
});

vi.mock('@/stores/useSettingsStore', () => {
  const settingsStore = { isReadOnly: false };
  const useSettingsStore = vi.fn((selector: (s: typeof settingsStore) => unknown) => selector(settingsStore));
  return { useSettingsStore };
});

import { useEnvelopeStore } from '@/stores/useEnvelopeStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

const savingsEnvelope: Envelope = {
  id: 1,
  name: 'ING Savings',
  type: 'Rolling',
  priority: 'Need',
  allocatedCents: 0,
  monthId: null,
  createdAt: '2026-01-01',
  isSavings: true,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SavingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useEnvelopeStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...store,
      isWriting: false,
    });
    vi.mocked(useEnvelopeStore.getState).mockReturnValue({ ...store, error: null });
    mockUpdateEnvelope.mockResolvedValue(undefined);
    mockDeleteEnvelope.mockResolvedValue(undefined);
  });

  it('renders SAVINGS label', () => {
    render(<SavingsCard envelope={savingsEnvelope} />);
    expect(screen.getByText('SAVINGS')).toBeInTheDocument();
  });

  it('renders envelope name', () => {
    render(<SavingsCard envelope={savingsEnvelope} />);
    expect(screen.getByText('ING Savings')).toBeInTheDocument();
  });

  it('does not render a progress bar', () => {
    const { container } = render(<SavingsCard envelope={savingsEnvelope} />);
    // Progress bar in EnvelopeCard is an h-[3px] div — SavingsCard should have none
    const progressBar = container.querySelector('.h-\\[3px\\]');
    expect(progressBar).not.toBeInTheDocument();
  });

  it('does not render a state badge', () => {
    render(<SavingsCard envelope={savingsEnvelope} />);
    // State badges show Funded/Unfunded/Overspent — none should appear
    expect(screen.queryByText('Funded')).not.toBeInTheDocument();
    expect(screen.queryByText('Unfunded')).not.toBeInTheDocument();
    expect(screen.queryByText('Overspent')).not.toBeInTheDocument();
  });

  it('opens dropdown with "Remove Savings Designation" menu item', async () => {
    const user = userEvent.setup();
    render(<SavingsCard envelope={savingsEnvelope} />);

    await user.click(screen.getByRole('button', { name: 'Savings envelope actions' }));
    expect(await screen.findByText('Remove Savings Designation')).toBeInTheDocument();
  });

  it('opens dropdown with "Delete" menu item', async () => {
    const user = userEvent.setup();
    render(<SavingsCard envelope={savingsEnvelope} />);

    await user.click(screen.getByRole('button', { name: 'Savings envelope actions' }));
    expect(await screen.findByText('Delete')).toBeInTheDocument();
  });

  it('does not render a Borrow button', () => {
    render(<SavingsCard envelope={savingsEnvelope} />);
    expect(screen.queryByRole('button', { name: /borrow/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/borrow/i)).not.toBeInTheDocument();
  });

  it('clicking "Remove Savings Designation" calls updateEnvelope with isSavings: false', async () => {
    const user = userEvent.setup();
    render(<SavingsCard envelope={savingsEnvelope} />);

    await user.click(screen.getByRole('button', { name: 'Savings envelope actions' }));
    await user.click(await screen.findByText('Remove Savings Designation'));

    expect(useEnvelopeStore.getState().updateEnvelope).toHaveBeenCalledWith({
      id: 1,
      isSavings: false,
    });
  });
});
