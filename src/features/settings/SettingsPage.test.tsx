import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Settings } from '@/lib/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { useSettingsStore } from '@/stores/useSettingsStore';
import SettingsPage from './SettingsPage';

// ── Shared fixture ────────────────────────────────────────────────────────────

const mockSettings: Settings = {
  id: 1,
  budgetName: 'Test Budget',
  startMonth: '2026-04',
  payFrequency: 'monthly',
  payDates: '"15"',
  savingsTargetPct: 10,
  dataFolderPath: '/tmp/gb',
  onboardingComplete: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function mockStore(overrides?: Partial<Settings>, storeOverrides?: { isReadOnly?: boolean }) {
  const upsertSettings = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useSettingsStore).mockReturnValue({
    settings: { ...mockSettings, ...overrides },
    upsertSettings,
    isWriting: false,
    isReadOnly: storeOverrides?.isReadOnly ?? false,
    error: null,
    loadSettings: vi.fn(),
    setReadOnly: vi.fn(),
    checkSentinel: vi.fn(),
  });
  return { upsertSettings };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SettingsPage', () => {
  it('pre-populates pay frequency from store settings', () => {
    mockStore({ payFrequency: 'bi-weekly', payDates: '"Mon"' });
    render(<SettingsPage />);

    const biWeeklyRadio = screen.getByTestId('pay-frequency-bi-weekly') as HTMLInputElement;
    expect(biWeeklyRadio.checked).toBe(true);
  });

  it('pre-populates savings target from store settings', () => {
    mockStore({ savingsTargetPct: 20 });
    render(<SettingsPage />);

    const input = screen.getByTestId('savings-target-input') as HTMLInputElement;
    expect(input.value).toBe('20');
  });

  it('Save button calls upsertSettings with correct payload', async () => {
    const { upsertSettings } = mockStore({ payFrequency: 'monthly', payDates: '"15"', savingsTargetPct: 10 });
    render(<SettingsPage />);

    // Change savings target to make form dirty
    const savingsInput = screen.getByTestId('savings-target-input');
    fireEvent.change(savingsInput, { target: { value: '25' } });

    const saveButton = screen.getByTestId('save-settings-button');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(upsertSettings).toHaveBeenCalledWith({
        payFrequency: 'monthly',
        payDates: '"15"',
        savingsTargetPct: 25,
        budgetName: 'Test Budget',
        startMonth: '2026-04',
        onboardingComplete: true,
      });
    });
  });

  it('shows inline "Settings saved." message after successful save', async () => {
    const { upsertSettings } = mockStore({ payFrequency: 'monthly', payDates: '"15"', savingsTargetPct: 10 });
    upsertSettings.mockResolvedValue(undefined);
    render(<SettingsPage />);

    // Change savings target to make form dirty (required to enable Save)
    const savingsInput = screen.getByTestId('savings-target-input');
    fireEvent.change(savingsInput, { target: { value: '20' } });

    fireEvent.click(screen.getByTestId('save-settings-button'));

    await waitFor(() => {
      expect(screen.getByText('Settings saved.')).toBeInTheDocument();
    });
  });

  it('shows friendly error message when upsertSettings rejects', async () => {
    const { upsertSettings } = mockStore({ payFrequency: 'monthly', payDates: '"15"', savingsTargetPct: 10 });
    upsertSettings.mockRejectedValue({ code: 'DB_ERROR', message: 'Write failed' });
    render(<SettingsPage />);

    // Change savings target to make form dirty (required to enable Save)
    const savingsInput = screen.getByTestId('savings-target-input');
    fireEvent.change(savingsInput, { target: { value: '20' } });

    fireEvent.click(screen.getByTestId('save-settings-button'));

    await waitFor(() => {
      expect(screen.getByText('Failed to save settings. Please try again.')).toBeInTheDocument();
    });
  });

  it('disables Save button and shows read-only message when isReadOnly is true', () => {
    mockStore({ payFrequency: 'monthly', payDates: '"15"', savingsTargetPct: 10 }, { isReadOnly: true });
    render(<SettingsPage />);

    expect(screen.getByTestId('save-settings-button')).toBeDisabled();
    expect(
      screen.getByText(/read-only: another instance is open/i),
    ).toBeInTheDocument();
  });

  it('does not show read-only message when isReadOnly is false', () => {
    mockStore({ payFrequency: 'monthly', payDates: '"15"', savingsTargetPct: 10 }, { isReadOnly: false });
    render(<SettingsPage />);

    expect(
      screen.queryByText(/read-only: another instance is open/i),
    ).not.toBeInTheDocument();
  });

  it('Save button is disabled on initial render (no changes made)', () => {
    const { upsertSettings } = mockStore();
    render(<SettingsPage />);
    expect(screen.getByTestId('save-settings-button')).toBeDisabled();
    expect(upsertSettings).not.toHaveBeenCalled();
  });

  it('pre-populates Budget Name input from store settings', () => {
    mockStore({ budgetName: 'My Budget' });
    render(<SettingsPage />);
    const input = screen.getByTestId('budget-name-input') as HTMLInputElement;
    expect(input.value).toBe('My Budget');
  });

  it('pre-populates Start Month from store settings', () => {
    mockStore({ startMonth: '2025-12' });
    render(<SettingsPage />);
    expect(screen.getByTestId('start-month-select')).toHaveTextContent('December 2025');
  });

  it('changing Budget Name enables Save button', () => {
    mockStore();
    render(<SettingsPage />);
    expect(screen.getByTestId('save-settings-button')).toBeDisabled();

    fireEvent.change(screen.getByTestId('budget-name-input'), {
      target: { value: 'Updated Budget' },
    });
    expect(screen.getByTestId('save-settings-button')).not.toBeDisabled();
  });

  it('Save payload includes updated budgetName and preserves onboardingComplete', async () => {
    const { upsertSettings } = mockStore({ onboardingComplete: true });
    render(<SettingsPage />);

    fireEvent.change(screen.getByTestId('budget-name-input'), {
      target: { value: 'New Name' },
    });
    fireEvent.click(screen.getByTestId('save-settings-button'));

    await waitFor(() => {
      expect(upsertSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          budgetName: 'New Name',
          onboardingComplete: true,
        }),
      );
    });
  });

  it('re-mounting after store change shows new saved values, not prior local edits', () => {
    const { rerender } = render(<SettingsPage />);

    // Simulate store update: savings target changed to 30
    vi.mocked(useSettingsStore).mockReturnValue({
      settings: { ...mockSettings, savingsTargetPct: 30 },
      upsertSettings: vi.fn(),
      isWriting: false,
      isReadOnly: false,
      error: null,
      loadSettings: vi.fn(),
      setReadOnly: vi.fn(),
      checkSentinel: vi.fn(),
    });

    // Re-mount the component (unmount + mount)
    rerender(<div />);
    rerender(<SettingsPage />);

    const input = screen.getByTestId('savings-target-input') as HTMLInputElement;
    expect(input.value).toBe('30');
  });
});
