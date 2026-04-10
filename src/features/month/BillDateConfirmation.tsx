import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { BillDateSuggestion, BillDateEntry, AppError } from '@/lib/types';

interface Props {
  year: number;
  month: number;
  onDatesChange: (dates: BillDateEntry[]) => void;
}

export default function BillDateConfirmation({ year, month, onDatesChange }: Props) {
  const [suggestions, setSuggestions] = useState<BillDateSuggestion[]>([]);
  const [localDays, setLocalDays] = useState<Map<number, number | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const monthLabel = `${year}-${String(month).padStart(2, '0')}`;

  useEffect(() => {
    invoke<BillDateSuggestion[]>('get_bill_date_suggestions')
      .then((data) => {
        setSuggestions(data);
        const map = new Map(data.map((s) => [s.envelopeId, s.dueDay]));
        setLocalDays(map);
        // Notify wizard of initial state so it has data ready for Continue
        onDatesChange(data.map((s) => ({ envelopeId: s.envelopeId, dueDay: s.dueDay })));
      })
      .catch((e) => setFetchError((e as AppError).message ?? 'Failed to load bill dates'))
      .finally(() => setLoading(false));
  }, []);

  const handleDayChange = (envelopeId: number, value: string) => {
    const parsed = value === '' ? null : parseInt(value, 10);
    const clamped =
      parsed !== null && !isNaN(parsed)
        ? Math.min(31, Math.max(1, parsed))
        : null;
    const newMap = new Map(localDays);
    newMap.set(envelopeId, clamped);
    setLocalDays(newMap);
    onDatesChange(
      suggestions.map((s) => ({
        envelopeId: s.envelopeId,
        dueDay: newMap.get(s.envelopeId) ?? null,
      }))
    );
  };

  if (loading) {
    return (
      <div className="py-8 text-center type-body" style={{ color: 'var(--color-text-secondary)' }}>
        Loading bill dates...
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
        No Bill envelopes to confirm.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-4 px-2">
      <p className="type-label" style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
        {monthLabel}
      </p>
      {suggestions.map((s) => (
        <div key={s.envelopeId} className="flex items-center justify-between gap-4">
          <span className="type-body" style={{ color: 'var(--color-text-primary)' }}>
            {s.envelopeName}
          </span>
          <input
            type="number"
            min={1}
            max={31}
            value={localDays.get(s.envelopeId) ?? ''}
            placeholder="—"
            onChange={(e) => handleDayChange(s.envelopeId, e.target.value)}
            aria-label={`Due day for ${s.envelopeName}`}
            className="type-body"
            style={{
              width: '4rem',
              background: 'var(--color-bg-card)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              textAlign: 'center',
            }}
          />
        </div>
      ))}
    </div>
  );
}
