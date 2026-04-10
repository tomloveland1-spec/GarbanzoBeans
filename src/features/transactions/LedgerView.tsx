import { useState, useMemo } from 'react';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { formatCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TransactionRow from './TransactionRow';
import AddTransactionForm from './AddTransactionForm';
import UnknownMerchantQueue from './UnknownMerchantQueue';
import OFXImporter from './OFXImporter';
import TransactionDetailPanel from './TransactionDetailPanel';

function formatImportDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function cutoffDateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

interface MetricCardProps {
  label: string;
  value: number;
  /** When true, forces positive color. When false, forces negative color. When undefined, colors by sign. */
  forcePositive?: boolean;
  testId?: string;
}

function MetricCard({ label, value, forcePositive, testId }: MetricCardProps) {
  let color: string;
  if (forcePositive === true) {
    color = 'var(--color-positive)';
  } else if (forcePositive === false) {
    color = 'var(--color-negative)';
  } else {
    color =
      value > 0
        ? 'var(--color-positive)'
        : value < 0
          ? 'var(--color-negative)'
          : 'var(--color-text-secondary)';
  }

  return (
    <div
      className="flex flex-col gap-1 px-4 py-3 rounded-md flex-1"
      style={{ backgroundColor: 'var(--color-bg-surface)' }}
      data-testid={testId}
    >
      <div className="type-label" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </div>
      <div
        style={{ fontSize: '18px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color }}
      >
        {formatCurrency(value)}
      </div>
    </div>
  );
}

const PERIOD_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '45', label: 'Last 45 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last year' },
  { value: 'all', label: 'All time' },
] as const;

type PeriodValue = (typeof PERIOD_OPTIONS)[number]['value'];

export default function LedgerView() {
  const transactions = useTransactionStore((s) => s.transactions);
  const importResult = useTransactionStore((s) => s.importResult);
  const envelopes = useEnvelopeStore((s) => s.envelopes);
  const isReadOnly = useSettingsStore((s) => s.isReadOnly);

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [period, setPeriod] = useState<PeriodValue>('45');

  const envelopeMap = new Map(envelopes.map((e) => [e.id, e.name]));

  const clearedBalance = transactions
    .filter((t) => t.isCleared)
    .reduce((sum, t) => sum + t.amountCents, 0);

  const workingBalance = transactions.reduce((sum, t) => sum + t.amountCents, 0);

  const inflow = transactions
    .filter((t) => t.amountCents > 0)
    .reduce((sum, t) => sum + t.amountCents, 0);

  const outflow = transactions
    .filter((t) => t.amountCents < 0)
    .reduce((sum, t) => sum + t.amountCents, 0);

  const filteredTransactions = useMemo(() => {
    let result = transactions;

    if (period !== 'all') {
      const cutoff = cutoffDateStr(parseInt(period));
      result = result.filter((t) => t.date >= cutoff);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((t) => t.payee.toLowerCase().includes(q));
    }

    if (uncategorizedOnly) {
      result = result.filter((t) => t.envelopeId === null);
    }

    return result;
  }, [transactions, search, uncategorizedOnly, period]);

  const selectedTransaction =
    selectedId !== null ? (transactions.find((t) => t.id === selectedId) ?? null) : null;

  const importDateLabel = importResult ? formatImportDate(importResult.latestDate) : null;

  const hasActiveFilters = search.trim() !== '' || uncategorizedOnly || period !== 'all';

  function handleRowSelect(id: number) {
    setSelectedId((prev) => (prev === id ? null : id));
    setShowAddForm(false);
  }

  const queueIds = [
    ...new Set([
      ...(importResult?.uncategorizedIds ?? []),
      ...(importResult?.conflictedIds ?? []),
    ]),
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Summary cards */}
      <div
        className="flex-shrink-0 px-6 py-3 flex gap-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <MetricCard label="Cleared" value={clearedBalance} testId="balance-cleared" />
        <MetricCard label="Working" value={workingBalance} testId="balance-working" />
        <MetricCard label="Inflow" value={inflow} forcePositive={true} />
        <MetricCard label="Outflow" value={outflow} forcePositive={false} />
      </div>

      {/* Page header */}
      <div
        className="flex-shrink-0 px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex flex-col gap-0.5">
          <span className="type-caption" style={{ color: 'var(--color-text-secondary)' }}>
            {hasActiveFilters
              ? `${filteredTransactions.length} of ${transactions.length} transactions`
              : `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`}
            {importDateLabel ? ` · Imported ${importDateLabel}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <OFXImporter />
          <Button
            variant="outline"
            onClick={() => {
              setShowAddForm(true);
              setSelectedId(null);
            }}
            disabled={showAddForm || isReadOnly}
          >
            Add Transaction
          </Button>
        </div>
      </div>

      {/* Unknown merchant queue — shown after import when transactions need manual categorization */}
      {queueIds.length > 0 && (
        <UnknownMerchantQueue
          queueIds={queueIds}
          transactions={transactions}
          envelopes={envelopes}
          conflictedIds={importResult?.conflictedIds ?? []}
        />
      )}

      {/* Controls toolbar */}
      <div
        className="flex-shrink-0 px-6 py-2 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <Input
          placeholder="Search payee…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: '240px' }}
        />
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodValue)}
          className="type-label"
          style={{
            background: 'var(--color-bg-surface)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '5px 8px',
            cursor: 'pointer',
          }}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label
          className="flex items-center gap-1.5 type-label"
          style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={uncategorizedOnly}
            onChange={(e) => setUncategorizedOnly(e.target.checked)}
            style={{ accentColor: 'var(--color-interactive)' }}
          />
          Uncategorized only
        </label>
      </div>

      {/* Add Transaction inline form */}
      {showAddForm && (
        <AddTransactionForm
          onSuccess={() => setShowAddForm(false)}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Workspace: table + detail pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Table area */}
        <div className="flex-1 overflow-y-auto">
          {transactions.length === 0 ? (
            <div
              className="flex items-center justify-center h-full type-body"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              No transactions yet — use Import OFX to get started
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div
              className="flex items-center justify-center h-full type-body"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              No transactions match your filters
            </div>
          ) : (
            <table className="w-full border-collapse" aria-label="Transactions">
              <thead>
                <tr
                  className="type-label"
                  style={{
                    color: 'var(--color-text-secondary)',
                    backgroundColor: 'var(--color-bg-app)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <th
                    scope="col"
                    className="text-left px-4 py-2 font-medium"
                    style={{ borderBottom: '1px solid var(--color-border)', width: '80px' }}
                  >
                    Date
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-2 font-medium"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    Payee
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-2 font-medium"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    Category
                  </th>
                  <th
                    scope="col"
                    className="text-left px-4 py-2 font-medium"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    Memo
                  </th>
                  <th
                    scope="col"
                    className="text-center px-4 py-2 font-medium"
                    style={{ borderBottom: '1px solid var(--color-border)', width: '72px' }}
                  >
                    Cleared
                  </th>
                  <th
                    scope="col"
                    className="text-right px-4 py-2 font-medium"
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((t) => {
                  const ruleSubstring = importResult?.categorizedAnnotations?.[String(t.id)];
                  const matchedRuleLabel =
                    ruleSubstring && t.envelopeId !== null
                      ? `-> ${envelopeMap.get(t.envelopeId) ?? 'Unknown'} via ${ruleSubstring} rule`
                      : undefined;
                  return (
                    <TransactionRow
                      key={t.id}
                      transaction={t}
                      envelopeMap={envelopeMap}
                      envelopes={envelopes}
                      matchedRuleLabel={matchedRuleLabel}
                      isSelected={selectedId === t.id}
                      onSelect={() => handleRowSelect(t.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail pane — anchored to right edge of workspace */}
        {selectedTransaction && (
          <TransactionDetailPanel
            transaction={selectedTransaction}
            envelopes={envelopes}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
