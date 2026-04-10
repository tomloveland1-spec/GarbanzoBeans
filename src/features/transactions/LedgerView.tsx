import { useState, useMemo } from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { Transaction } from '@/lib/types';
import { formatCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import AddTransactionForm from './AddTransactionForm';
import UnknownMerchantQueue from './UnknownMerchantQueue';
import OFXImporter from './OFXImporter';
import TransactionDetailPanel from './TransactionDetailPanel';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTxDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

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
  return d.toISOString().split('T')[0]!;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type TxRow = Transaction & {
  categoryName: string;
  isUncategorized: boolean;
  isSavingsTx: boolean;
  matchedRuleLabel?: string;
};

// ─── Column definitions ──────────────────────────────────────────────────────

const columns: ColumnDef<TxRow>[] = [
  {
    accessorKey: 'date',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Date
        <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
      </Button>
    ),
    cell: ({ row }) => (
      <span style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
        {formatTxDate(row.getValue('date'))}
      </span>
    ),
  },
  {
    accessorKey: 'payee',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Payee
        <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {row.getValue('payee')}
        </div>
        {row.original.matchedRuleLabel && (
          <span
            className="type-caption block"
            style={{ color: 'var(--color-text-secondary)' }}
            data-testid="matched-rule-label"
          >
            {row.original.matchedRuleLabel}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'categoryName',
    header: 'Category',
    cell: ({ row }) => (
      <span
        className="type-caption"
        style={{
          display: 'inline-block',
          padding: '1px 7px',
          borderRadius: '10px',
          backgroundColor: row.original.isUncategorized
            ? 'rgba(245, 168, 0, 0.12)'
            : 'rgba(255, 255, 255, 0.05)',
          color: row.original.isUncategorized
            ? 'var(--color-amber)'
            : 'var(--color-text-secondary)',
        }}
      >
        {row.getValue('categoryName')}
      </span>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'memo',
    header: 'Memo',
    cell: ({ row }) => {
      const memo: string | null = row.getValue('memo');
      return (
        <span
          className="block truncate"
          style={{ color: 'var(--color-text-secondary)', maxWidth: '200px' }}
          title={memo ?? undefined}
        >
          {memo ?? ''}
        </span>
      );
    },
    enableSorting: false,
  },
  {
    accessorKey: 'isCleared',
    header: 'Cleared',
    cell: ({ row }) =>
      row.getValue('isCleared') ? (
        <span
          className="flex justify-center"
          style={{ color: 'var(--color-text-secondary)', fontSize: '13px', opacity: 0.7 }}
          aria-label="Cleared"
        >
          ✓
        </span>
      ) : (
        <span
          className="flex justify-center"
          style={{ color: 'var(--color-text-secondary)', fontSize: '11px', opacity: 0.3 }}
          aria-label="Pending"
        >
          ○
        </span>
      ),
    enableSorting: false,
  },
  {
    accessorKey: 'amountCents',
    header: ({ column }) => (
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="-mr-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Amount
          <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
        </Button>
      </div>
    ),
    cell: ({ row }) => {
      const amount = row.getValue('amountCents') as number;
      const color = amount >= 0 ? 'var(--color-positive)' : 'var(--color-negative)';
      return (
        <div
          className="text-right"
          style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color }}
        >
          {formatCurrency(amount)}
          {row.original.isSavingsTx && (
            <span
              className="type-caption block"
              style={{ color: 'var(--color-text-secondary)' }}
              data-testid="savings-direction"
            >
              {amount < 0 ? 'Savings Deposit' : 'Savings Withdrawal'}
            </span>
          )}
        </div>
      );
    },
  },
];

// ─── MetricCard ──────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number;
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
      <div style={{ fontSize: '18px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color }}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

// ─── Period filter ────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '45', label: 'Last 45 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last year' },
  { value: 'all', label: 'All time' },
] as const;

type PeriodValue = (typeof PERIOD_OPTIONS)[number]['value'];

// ─── LedgerView ──────────────────────────────────────────────────────────────

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
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);

  const envelopeMap = useMemo(
    () => new Map(envelopes.map((e) => [e.id, e.name])),
    [envelopes]
  );

  const savingsEnvelopeIds = useMemo(
    () => new Set(envelopes.filter((e) => e.isSavings).map((e) => e.id)),
    [envelopes]
  );

  // ── Summary metrics (always over full transaction set) ──
  const clearedBalance = useMemo(
    () => transactions.filter((t) => t.isCleared).reduce((s, t) => s + t.amountCents, 0),
    [transactions]
  );
  const workingBalance = useMemo(
    () => transactions.reduce((s, t) => s + t.amountCents, 0),
    [transactions]
  );
  // ── Filtered + enriched rows ──
  const tableData = useMemo<TxRow[]>(() => {
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

    return result.map((t) => {
      const isUncategorized = t.envelopeId === null;
      const ruleSubstring = importResult?.categorizedAnnotations?.[String(t.id)];
      return {
        ...t,
        categoryName: isUncategorized
          ? 'Uncategorized'
          : (envelopeMap.get(t.envelopeId!) ?? 'Unknown'),
        isUncategorized,
        isSavingsTx: t.envelopeId !== null && savingsEnvelopeIds.has(t.envelopeId),
        matchedRuleLabel:
          ruleSubstring && t.envelopeId !== null
            ? `-> ${envelopeMap.get(t.envelopeId) ?? 'Unknown'} via ${ruleSubstring} rule`
            : undefined,
      };
    });
  }, [transactions, period, search, uncategorizedOnly, envelopeMap, savingsEnvelopeIds, importResult]);

  const hasActiveFilters = search.trim() !== '' || uncategorizedOnly || period !== 'all';
  const importDateLabel = importResult ? formatImportDate(importResult.latestDate) : null;

  const selectedTransaction =
    selectedId !== null ? (transactions.find((t) => t.id === selectedId) ?? null) : null;

  const queueIds = [
    ...new Set([
      ...(importResult?.uncategorizedIds ?? []),
      ...(importResult?.conflictedIds ?? []),
    ]),
  ];

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function handleRowSelect(id: number) {
    setSelectedId((prev) => (prev === id ? null : id));
    setShowAddForm(false);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Summary cards */}
      <div
        className="flex-shrink-0 px-6 py-3 flex gap-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <MetricCard label="Cleared" value={clearedBalance} testId="balance-cleared" />
        <MetricCard label="Working" value={workingBalance} testId="balance-working" />
      </div>

      {/* Toolbar */}
      <div
        className="flex-shrink-0 px-6 py-3 flex items-center justify-between gap-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {/* Left: filters */}
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search payee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: '220px' }}
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
          <span className="type-caption" style={{ color: 'var(--color-text-secondary)' }}>
            {hasActiveFilters
              ? `${tableData.length} of ${transactions.length} transactions`
              : `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`}
            {importDateLabel ? ` · Imported ${importDateLabel}` : ''}
          </span>
        </div>

        {/* Right: actions */}
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

      {/* Unknown merchant queue */}
      {queueIds.length > 0 && (
        <UnknownMerchantQueue
          queueIds={queueIds}
          transactions={transactions}
          envelopes={envelopes}
          conflictedIds={importResult?.conflictedIds ?? []}
        />
      )}

      {/* Add Transaction inline form */}
      {showAddForm && (
        <AddTransactionForm
          onSuccess={() => setShowAddForm(false)}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Workspace: table + detail pane */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {transactions.length === 0 ? (
            <div
              className="flex items-center justify-center h-full type-body"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              No transactions yet — use Import OFX to get started
            </div>
          ) : (
            <Table aria-label="Transactions">
              <TableHeader
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  backgroundColor: 'var(--color-bg-app)',
                }}
              >
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="type-label"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="text-center type-body"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      No transactions match your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      onClick={() => handleRowSelect(row.original.id)}
                      className="type-body cursor-pointer"
                      style={{
                        opacity: row.original.isCleared ? undefined : 0.55,
                        backgroundColor:
                          selectedId === row.original.id
                            ? 'rgba(255, 255, 255, 0.05)'
                            : undefined,
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>

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
