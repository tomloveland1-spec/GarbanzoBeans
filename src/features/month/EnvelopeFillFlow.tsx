import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { formatCurrency } from '@/lib/currency';
import type { IncomeTimingSuggestion } from '@/lib/types';

interface Props {
  monthId: number;
  onAllocationsChange: (allocs: Array<{ id: number; allocatedCents: number }>) => void;
}

function parseCents(value: string): number | null {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export default function EnvelopeFillFlow({ monthId, onAllocationsChange }: Props) {
  const { envelopes } = useEnvelopeStore();

  const [drafts, setDrafts] = useState<Map<number, string>>(() => {
    const m = new Map<number, string>();
    for (const env of envelopes) {
      m.set(env.id, (env.allocatedCents / 100).toFixed(2));
    }
    return m;
  });
  const [totalIncomeCents, setTotalIncomeCents] = useState(0);
  const [incomeLoading, setIncomeLoading] = useState(true);

  // Seed parent with initial draft values on mount so pendingAllocations is
  // never empty if the user clicks Close Month without editing any input.
  useEffect(() => {
    const allocs: Array<{ id: number; allocatedCents: number }> = [];
    for (const [envId, v] of drafts.entries()) {
      const cents = parseCents(v);
      if (cents !== null) allocs.push({ id: envId, allocatedCents: cents });
    }
    onAllocationsChange(allocs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    invoke<IncomeTimingSuggestion[]>('get_income_timing_suggestions', { monthId })
      .then((suggestions) => {
        const total = suggestions.reduce((sum, s) => sum + s.amountCents, 0);
        setTotalIncomeCents(total);
      })
      .catch(() => { /* income total stays 0 on error */ })
      .finally(() => setIncomeLoading(false));
  }, [monthId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (id: number, value: string) => {
    const updated = new Map(drafts);
    updated.set(id, value);
    setDrafts(updated);

    // Emit valid allocations to parent on every change
    const allocs: Array<{ id: number; allocatedCents: number }> = [];
    for (const [envId, v] of updated.entries()) {
      const cents = parseCents(v);
      if (cents !== null) allocs.push({ id: envId, allocatedCents: cents });
    }
    onAllocationsChange(allocs);
  };

  // Live available income calculation
  const totalAllocatedCents = Array.from(drafts.values()).reduce((sum, v) => {
    const c = parseCents(v);
    return sum + (c ?? 0);
  }, 0);
  const availableCents = totalIncomeCents - totalAllocatedCents;

  const savingsEnvelopes = envelopes.filter((e) => e.isSavings);
  const regularEnvelopes = envelopes.filter((e) => !e.isSavings);

  return (
    <div className="flex flex-col gap-4 py-4 px-2" data-testid="envelope-fill-flow">
      {/* Available income header */}
      <div
        className="flex items-baseline justify-between px-1"
        data-testid="available-income-header"
      >
        <span className="type-label uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          Available Income
        </span>
        <span
          className="type-body font-semibold"
          style={{ color: availableCents >= 0 ? 'var(--color-sidebar-active)' : '#ff5555' }}
          data-testid="available-income-amount"
        >
          {incomeLoading ? '…' : formatCurrency(availableCents)}
        </span>
      </div>

      <div className="border-t" style={{ borderColor: 'var(--color-border)' }} />

      {/* Savings envelope — shown first with distinct lime border */}
      {savingsEnvelopes.map((env) => (
        <div
          key={env.id}
          className="flex flex-col gap-1 rounded-md p-3"
          style={{ border: '1px solid #C0F500' }}
          data-testid={`savings-envelope-row-${env.id}`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="type-label uppercase font-semibold" style={{ color: '#C0F500' }}>
                SAVINGS
              </span>
              <span className="type-body" style={{ color: 'var(--color-text-primary)' }}>
                {env.name}
              </span>
              <span className="type-label italic" style={{ color: 'var(--color-text-secondary)' }}>
                Even $50 keeps your streak alive
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={drafts.get(env.id) ?? '0.00'}
                onChange={(e) => handleChange(env.id, e.target.value)}
                data-testid={`allocation-input-${env.id}`}
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
          </div>
        </div>
      ))}

      {/* Regular envelopes */}
      {regularEnvelopes.map((env) => (
        <div
          key={env.id}
          className="flex items-center justify-between gap-4"
          data-testid={`envelope-row-${env.id}`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="type-body truncate" style={{ color: 'var(--color-text-primary)' }}>
              {env.name}
            </span>
            <span
              className="type-label shrink-0 px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                color: 'var(--color-text-muted)',
              }}
            >
              {env.type}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>$</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={drafts.get(env.id) ?? '0.00'}
              onChange={(e) => handleChange(env.id, e.target.value)}
              data-testid={`allocation-input-${env.id}`}
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
        </div>
      ))}

      {envelopes.length === 0 && (
        <p className="type-body text-center" style={{ color: 'var(--color-text-muted)' }}>
          No envelopes to allocate.
        </p>
      )}
    </div>
  );
}
