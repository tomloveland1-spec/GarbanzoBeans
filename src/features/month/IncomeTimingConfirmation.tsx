import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { IncomeTimingSuggestion, IncomeTimingEntry, AppError } from '@/lib/types';

interface Props {
  monthId: number;
  year: number;
  month: number;
  onEntriesChange: (entries: IncomeTimingEntry[]) => void;
}

export default function IncomeTimingConfirmation({ monthId, year, month, onEntriesChange }: Props) {
  const [suggestions, setSuggestions] = useState<IncomeTimingSuggestion[]>([]);
  const [localEntries, setLocalEntries] = useState<IncomeTimingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const monthLabel = `${year}-${String(month).padStart(2, '0')}`;

  useEffect(() => {
    invoke<IncomeTimingSuggestion[]>('get_income_timing_suggestions', { monthId })
      .then((data) => {
        setSuggestions(data);
        const entries = data.map((s) => ({
          payDate: s.payDate,
          amountCents: s.amountCents,
          label: s.label,
        }));
        setLocalEntries(entries);
        onEntriesChange(entries);
      })
      .catch((e) => setFetchError((e as AppError).message ?? 'Failed to load income timing'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAmountChange = (index: number, value: string) => {
    const parsed = value === '' ? 0 : Math.round(parseFloat(value) * 100);
    const amount = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    const updated = localEntries.map((e, i) =>
      i === index ? { ...e, amountCents: amount } : e
    );
    setLocalEntries(updated);
    onEntriesChange(updated);
  };

  if (loading) {
    return (
      <div className="py-8 text-center type-body" style={{ color: 'var(--color-text-secondary)' }}>
        Loading income timing...
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="py-8 text-center type-body" style={{ color: 'var(--color-danger, #ff5555)' }}>
        {fetchError}
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="py-8 text-center type-body" style={{ color: 'var(--color-text-secondary)' }}>
        No income configured. Continue to proceed.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-4 px-2">
      <p className="type-label" style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
        {monthLabel}
      </p>
      {localEntries.map((entry, index) => (
        <div key={entry.payDate} className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="type-body" style={{ color: 'var(--color-text-primary)' }}>
              {entry.payDate}
            </span>
            {entry.label && (
              <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>
                {entry.label}
              </span>
            )}
          </div>
          <input
            type="number"
            min={0}
            step="0.01"
            value={(entry.amountCents / 100).toFixed(2)}
            placeholder="0.00"
            onChange={(e) => handleAmountChange(index, e.target.value)}
            aria-label={`Income amount for ${entry.payDate}`}
            className="type-body"
            style={{
              width: '6rem',
              background: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              textAlign: 'right',
            }}
          />
        </div>
      ))}
    </div>
  );
}
