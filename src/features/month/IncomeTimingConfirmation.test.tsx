import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { IncomeTimingSuggestion } from '@/lib/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import IncomeTimingConfirmation from './IncomeTimingConfirmation';

const mockSuggestions: IncomeTimingSuggestion[] = [
  { payDate: '2026-05-01', amountCents: 300000, label: 'Paycheck 1' },
  { payDate: '2026-05-15', amountCents: 300000, label: 'Paycheck 2' },
];

describe('IncomeTimingConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    vi.mocked(invoke).mockReturnValue(new Promise(() => { /* never resolves */ }));
    render(
      <IncomeTimingConfirmation
        monthId={1}
        year={2026}
        month={4}
        onEntriesChange={vi.fn()}
      />
    );
    expect(screen.getByText('Loading income timing...')).toBeTruthy();
  });

  it('renders list of pay dates with amounts', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockSuggestions);
    render(
      <IncomeTimingConfirmation
        monthId={1}
        year={2026}
        month={4}
        onEntriesChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('2026-05-01')).toBeTruthy();
      expect(screen.getByText('2026-05-15')).toBeTruthy();
      expect(screen.getByText('Paycheck 1')).toBeTruthy();
      expect(screen.getByText('Paycheck 2')).toBeTruthy();
    });
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs[0].value).toBe('3000.00');
    expect(inputs[1].value).toBe('3000.00');
  });

  it('calls onEntriesChange on initial load', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockSuggestions);
    const onEntriesChange = vi.fn();
    render(
      <IncomeTimingConfirmation
        monthId={1}
        year={2026}
        month={4}
        onEntriesChange={onEntriesChange}
      />
    );
    await waitFor(() => {
      expect(onEntriesChange).toHaveBeenCalledWith([
        { payDate: '2026-05-01', amountCents: 300000, label: 'Paycheck 1' },
        { payDate: '2026-05-15', amountCents: 300000, label: 'Paycheck 2' },
      ]);
    });
  });

  it('calls onEntriesChange when user edits amount', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockSuggestions);
    const onEntriesChange = vi.fn();
    render(
      <IncomeTimingConfirmation
        monthId={1}
        year={2026}
        month={4}
        onEntriesChange={onEntriesChange}
      />
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Income amount for 2026-05-01')).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText('Income amount for 2026-05-01'), { target: { value: '1500.00' } });
    expect(onEntriesChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ payDate: '2026-05-01', amountCents: 150000 }),
      ])
    );
  });

  it('shows empty state when no income configured', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    render(
      <IncomeTimingConfirmation
        monthId={1}
        year={2026}
        month={4}
        onEntriesChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('No income configured. Continue to proceed.')).toBeTruthy();
    });
  });

  it('shows error on fetch failure', async () => {
    vi.mocked(invoke).mockRejectedValueOnce({ message: 'DB error occurred' });
    render(
      <IncomeTimingConfirmation
        monthId={1}
        year={2026}
        month={4}
        onEntriesChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('DB error occurred')).toBeTruthy();
    });
  });
});
