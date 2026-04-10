import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { BillDateSuggestion } from '@/lib/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import BillDateConfirmation from './BillDateConfirmation';

const mockSuggestions: BillDateSuggestion[] = [
  { envelopeId: 1, envelopeName: 'Rent', dueDay: 1 },
  { envelopeId: 2, envelopeName: 'Internet', dueDay: null },
];

describe('BillDateConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    vi.mocked(invoke).mockReturnValue(new Promise(() => { /* never resolves */ }));
    render(
      <BillDateConfirmation
        year={2026}
        month={4}
        onDatesChange={vi.fn()}
      />
    );
    expect(screen.getByText('Loading bill dates...')).toBeTruthy();
  });

  it('renders list of bill envelopes', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockSuggestions);
    render(
      <BillDateConfirmation
        year={2026}
        month={4}
        onDatesChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeTruthy();
      expect(screen.getByText('Internet')).toBeTruthy();
    });
  });

  it('prefills existing due_day values', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([
      { envelopeId: 1, envelopeName: 'Rent', dueDay: 15 },
    ]);
    render(
      <BillDateConfirmation
        year={2026}
        month={4}
        onDatesChange={vi.fn()}
      />
    );
    await waitFor(() => {
      const input = screen.getByLabelText('Due day for Rent') as HTMLInputElement;
      expect(input.value).toBe('15');
    });
  });

  it('shows empty input for null dueDay', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([
      { envelopeId: 2, envelopeName: 'Internet', dueDay: null },
    ]);
    render(
      <BillDateConfirmation
        year={2026}
        month={4}
        onDatesChange={vi.fn()}
      />
    );
    await waitFor(() => {
      const input = screen.getByLabelText('Due day for Internet') as HTMLInputElement;
      expect(input.value).toBe('');
    });
  });

  it('calls onDatesChange on initial load', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockSuggestions);
    const onDatesChange = vi.fn();
    render(
      <BillDateConfirmation
        monthId={1}
        year={2026}
        month={4}
        onDatesChange={onDatesChange}
      />
    );
    await waitFor(() => {
      expect(onDatesChange).toHaveBeenCalledWith([
        { envelopeId: 1, dueDay: 1 },
        { envelopeId: 2, dueDay: null },
      ]);
    });
  });

  it('calls onDatesChange when user edits a value', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockSuggestions);
    const onDatesChange = vi.fn();
    render(
      <BillDateConfirmation
        monthId={1}
        year={2026}
        month={4}
        onDatesChange={onDatesChange}
      />
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Due day for Rent')).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText('Due day for Rent'), { target: { value: '5' } });
    expect(onDatesChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ envelopeId: 1, dueDay: 5 }),
      ])
    );
  });

  it('shows empty state when no bill envelopes', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    render(
      <BillDateConfirmation
        year={2026}
        month={4}
        onDatesChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('No Bill envelopes to confirm.')).toBeTruthy();
    });
  });

  it('shows error on fetch failure', async () => {
    vi.mocked(invoke).mockRejectedValueOnce({ message: 'DB error occurred' });
    render(
      <BillDateConfirmation
        year={2026}
        month={4}
        onDatesChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('DB error occurred')).toBeTruthy();
    });
  });
});
