import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CloseoutSummary as CloseoutSummaryData, AppError } from '@/lib/types';
import { useSavingsStore } from '@/stores/useSavingsStore';
import { formatCurrency } from '@/lib/currency';

interface Props {
  monthId: number;
  year: number;
  month: number;
}

export default function CloseoutSummary({ monthId, year, month }: Props) {
  const [data, setData] = useState<CloseoutSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Runway data from savings store (already loaded by main screen; reload if needed for crash recovery)
  const runway = useSavingsStore((s) => s.runway());
  const runwayDelta = useSavingsStore((s) => s.runwayDelta());
  const loadReconciliations = useSavingsStore((s) => s.loadReconciliations);
  const loadAvgMonthlyEssentialSpend = useSavingsStore((s) => s.loadAvgMonthlyEssentialSpend);

  const monthLabel = `${year}-${String(month).padStart(2, '0')}`;

  useEffect(() => {
    if (monthId === 0) return;
    // Fetch closeout summary from Rust
    invoke<CloseoutSummaryData>('get_closeout_summary', { input: { monthId } })
      .then(setData)
      .catch((e) => setFetchError((e as AppError).message ?? 'Failed to load summary'))
      .finally(() => setLoading(false));

    // Ensure savings store is hydrated (for crash recovery when store is cold)
    loadReconciliations();
    loadAvgMonthlyEssentialSpend();
  }, [monthId, loadReconciliations, loadAvgMonthlyEssentialSpend]);

  if (loading) {
    return (
      <div className="py-8 text-center type-body" style={{ color: 'var(--color-text-secondary)' }}>
        Loading summary...
      </div>
    );
  }

  if (fetchError || !data) {
    return (
      <div className="py-8 text-center type-body" style={{ color: 'var(--color-danger, #ff5555)' }}>
        {fetchError ?? 'Could not load summary.'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-4 px-2">
      {/* Month label */}
      <p className="type-label" style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
        {monthLabel}
      </p>

      {/* Drift detection note — appears first if present (informational, not a warning) */}
      {data.driftEnvelopeName && (
        <p className="type-body" style={{ color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          {data.driftEnvelopeName} has run over budget 2 months in a row — worth adjusting the target?
        </p>
      )}

      {/* Budget result */}
      <div className="flex flex-col gap-1">
        <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>Budget</span>
        {data.stayedInBudget ? (
          <span className="type-body" style={{ color: 'var(--color-accent)' }}>
            Stayed in budget
          </span>
        ) : (
          <span className="type-body" style={{ color: 'var(--color-danger, #ff5555)' }}>
            {formatCurrency(data.overspendCents)} over budget
          </span>
        )}
      </div>

      {/* Savings flow */}
      <div className="flex flex-col gap-1">
        <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>Savings this month</span>
        <span className="type-body" style={{ color: data.savingsFlowCents > 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
          {data.savingsFlowCents > 0
            ? `${formatCurrency(data.savingsFlowCents)} deposited`
            : data.savingsFlowCents < 0
              ? `${formatCurrency(Math.abs(data.savingsFlowCents))} withdrawn`
              : 'No savings activity this month'}
        </span>
      </div>

      {/* Runway */}
      <div className="flex flex-col gap-1">
        <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>Runway</span>
        <span className="type-body" style={{ color: 'var(--color-text-primary)' }}>
          {runway} {runway === 1 ? 'month' : 'months'}
          {runwayDelta !== null && runwayDelta !== 0 && (
            <span style={{ color: runwayDelta > 0 ? 'var(--color-accent)' : 'var(--color-danger, #ff5555)' }}>
              {' '}({runwayDelta > 0 ? '+' : ''}{runwayDelta} {Math.abs(runwayDelta) === 1 ? 'month' : 'months'})
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
