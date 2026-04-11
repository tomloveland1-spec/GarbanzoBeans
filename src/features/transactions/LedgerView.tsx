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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import AddTransactionForm from './AddTransactionForm';
import OFXImporter from './OFXImporter';

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

interface DraftFields {
  payee: string;
  amountStr: string;
  date: string;
  category: string; // envelope id as string, or 'none'
  memo: string;
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

// ─── LedgerView ──────────────────────────────────────────────────────────────

export default function LedgerView() {
  const transactions = useTransactionStore((s) => s.transactions);
  const importResult = useTransactionStore((s) => s.importResult);
  const envelopes = useEnvelopeStore((s) => s.envelopes);
  const isReadOnly = useSettingsStore((s) => s.isReadOnly);

  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState('');
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [period, setPeriod] = useState<PeriodValue>('45');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);

  // ── Inline editing state ──
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftFields | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const importDateLabel = importResult ? formatImportDate(importResult.latestDate) : null;

  // ── Edit handlers ──

  function handleRowClick(row: TxRow) {
    if (isReadOnly) return;
    if (editingRowId === row.id) return;
    setEditingRowId(row.id);
    setDraft({
      payee: row.payee,
      amountStr: (row.amountCents / 100).toFixed(2),
      date: row.date,
      category: row.envelopeId !== null ? String(row.envelopeId) : 'none',
      memo: row.memo ?? '',
    });
    setDraftError(null);
  }

  function handleCancel() {
    setEditingRowId(null);
    setDraft(null);
    setDraftError(null);
  }

  async function handleSave() {
    if (!draft || editingRowId === null) return;
    const amountCents = Math.round(parseFloat(draft.amountStr) * 100);
    if (isNaN(amountCents)) {
      setDraftError('Enter a valid amount (e.g. -12.34)');
      return;
    }
    setIsSaving(true);
    setDraftError(null);

    const clearEnvelopeId = draft.category === 'none';
    const envelopeId = draft.category !== 'none' ? Number(draft.category) : undefined;

    await useTransactionStore.getState().updateTransaction({
      id: editingRowId,
      payee: draft.payee,
      amountCents,
      date: draft.date,
      ...(clearEnvelopeId
        ? { clearEnvelopeId: true }
        : envelopeId !== undefined
          ? { envelopeId }
          : {}),
      memo: draft.memo.trim() || null,
    });

    const storeState = useTransactionStore.getState();
    if (storeState.error) {
      setDraftError(storeState.error.message);
      setIsSaving(false);
      return;
    }

    if (envelopeId !== undefined || clearEnvelopeId) {
      await useEnvelopeStore.getState().loadEnvelopes().catch(() => {});
    }

    setEditingRowId(null);
    setDraft(null);
    setIsSaving(false);
  }

  async function handleClearedToggle(
    id: number,
    current: boolean,
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    if (isReadOnly) return;
    await useTransactionStore.getState().updateTransaction({ id, isCleared: !current });
  }

  // ── Column definitions ────────────────────────────────────────────────────
  // Defined inside the component so cell renderers close over edit state.

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
      cell: ({ row }) => {
        if (editingRowId === row.original.id && draft) {
          return (
            <Input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => d && { ...d, date: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              style={{ minWidth: '130px' }}
            />
          );
        }
        return (
          <span style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
            {formatTxDate(row.getValue('date'))}
          </span>
        );
      },
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
      cell: ({ row }) => {
        if (editingRowId === row.original.id && draft) {
          return (
            <div
              className="flex flex-col gap-1 min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              <Input
                value={draft.payee}
                onChange={(e) => setDraft((d) => d && { ...d, payee: e.target.value })}
                placeholder="Payee"
              />
              <textarea
                value={draft.memo}
                onChange={(e) => setDraft((d) => d && { ...d, memo: e.target.value })}
                placeholder="Memo (optional)"
                rows={2}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  background: 'var(--color-bg-app)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  color: 'var(--color-text-primary)',
                  padding: '4px 8px',
                  font: 'inherit',
                  fontSize: '13px',
                  lineHeight: '1.5',
                }}
              />
            </div>
          );
        }
        return (
          <div className="min-w-0">
            <div className="truncate font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {row.getValue('payee')}
            </div>
            {row.original.memo && (
              <span
                className="type-caption block truncate"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {row.original.memo}
              </span>
            )}
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
        );
      },
    },
    {
      accessorKey: 'categoryName',
      header: 'Category',
      cell: ({ row }) => {
        if (editingRowId === row.original.id && draft) {
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Select
                value={draft.category}
                onValueChange={(val) => setDraft((d) => d && { ...d, category: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {envelopes.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        return (
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
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'isCleared',
      header: 'Cleared',
      cell: ({ row }) => (
        <span
          className="flex justify-center select-none"
          style={{
            cursor: isReadOnly ? 'default' : 'pointer',
            color: 'var(--color-text-secondary)',
            fontSize: row.original.isCleared ? '13px' : '11px',
            opacity: row.original.isCleared ? 0.7 : 0.3,
          }}
          onClick={(e) => handleClearedToggle(row.original.id, row.original.isCleared, e)}
          aria-label={row.original.isCleared ? 'Mark uncleared' : 'Mark cleared'}
        >
          {row.original.isCleared ? '✓' : '○'}
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
        if (editingRowId === row.original.id && draft) {
          return (
            <div
              className="flex flex-col gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Input
                value={draft.amountStr}
                onChange={(e) => {
                  setDraft((d) => d && { ...d, amountStr: e.target.value });
                  setDraftError(null);
                }}
                style={{
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: '90px',
                }}
              />
              {draftError && (
                <span className="type-caption" style={{ color: 'var(--color-red)' }}>
                  {draftError}
                </span>
              )}
            </div>
          );
        }
        const amount = row.getValue('amountCents') as number;
        const color = amount >= 0 ? 'var(--color-positive)' : 'var(--color-negative)';
        return (
          <div
            className="text-right"
            style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color }}
          >
            {formatCurrency(amount)}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: () => null,
      cell: ({ row }) => {
        if (editingRowId !== row.original.id) return null;
        return (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? '…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isSaving}>
              ×
            </Button>
          </div>
        );
      },
      enableSorting: false,
    },
  ];

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

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
          {importDateLabel && (
            <span className="type-caption" style={{ color: 'var(--color-text-secondary)' }}>
              Imported {importDateLabel}
            </span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          <OFXImporter />
          <Button
            variant="outline"
            onClick={() => setShowAddForm(true)}
            disabled={showAddForm || isReadOnly}
          >
            Add Transaction
          </Button>
        </div>
      </div>

      {/* Add Transaction inline form */}
      {showAddForm && (
        <AddTransactionForm
          onSuccess={() => setShowAddForm(false)}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Table */}
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
                    onClick={() => handleRowClick(row.original)}
                    className="type-body cursor-pointer"
                    style={{
                      opacity: row.original.isCleared ? undefined : 0.55,
                      backgroundColor:
                        editingRowId === row.original.id
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
    </div>
  );
}
