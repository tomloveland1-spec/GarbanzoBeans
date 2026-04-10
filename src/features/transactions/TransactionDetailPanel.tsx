import { useState, useEffect } from 'react';
import type { Transaction, Envelope } from '@/lib/types';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TransactionDetailPanelProps {
  transaction: Transaction;
  envelopes: Envelope[];
  onClose: () => void;
}

export default function TransactionDetailPanel({ transaction, envelopes, onClose }: TransactionDetailPanelProps) {
  const [payee, setPayee] = useState(transaction.payee);
  const [amountStr, setAmountStr] = useState((transaction.amountCents / 100).toFixed(2));
  const [date, setDate] = useState(transaction.date);
  const [category, setCategory] = useState<string>(
    transaction.envelopeId !== null ? String(transaction.envelopeId) : 'none'
  );
  const [isCleared, setIsCleared] = useState(transaction.isCleared);
  const [memo, setMemo] = useState(transaction.memo ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when selected transaction changes
  useEffect(() => {
    setPayee(transaction.payee);
    setAmountStr((transaction.amountCents / 100).toFixed(2));
    setDate(transaction.date);
    setCategory(transaction.envelopeId !== null ? String(transaction.envelopeId) : 'none');
    setIsCleared(transaction.isCleared);
    setMemo(transaction.memo ?? '');
    setError(null);
  }, [transaction.id]);

  async function handleSave() {
    const amountCents = Math.round(parseFloat(amountStr) * 100);
    if (isNaN(amountCents)) {
      setError('Enter a valid amount (e.g. -12.34)');
      return;
    }
    setIsSaving(true);
    setError(null);

    const prevEnvelopeId = transaction.envelopeId;
    const clearEnvelopeId = category === 'none' && prevEnvelopeId !== null;
    const envelopeId = category !== 'none' ? Number(category) : undefined;

    await useTransactionStore.getState().updateTransaction({
      id: transaction.id,
      payee,
      amountCents,
      date,
      isCleared,
      ...(clearEnvelopeId ? { clearEnvelopeId: true } : envelopeId !== undefined ? { envelopeId } : {}),
      memo: memo.trim() || null,
    });

    if (envelopeId !== undefined || clearEnvelopeId) {
      await useEnvelopeStore.getState().loadEnvelopes().catch(() => {});
    }

    const state = useTransactionStore.getState();
    if (state.error) {
      setError(state.error.message);
    }
    setIsSaving(false);
  }

  return (
    <div
      className="flex flex-col shrink-0"
      style={{
        width: '340px',
        borderLeft: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-surface)',
        overflowY: 'auto',
      }}
      data-testid="transaction-detail-panel"
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="type-h2" style={{ color: 'var(--color-text-primary)' }}>
          Transaction
        </span>
        <button
          onClick={onClose}
          className="type-body"
          style={{ color: 'var(--color-text-secondary)', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Form fields */}
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <label className="type-label" style={{ color: 'var(--color-text-secondary)' }}>
            Date
          </label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="type-label" style={{ color: 'var(--color-text-secondary)' }}>
            Payee
          </label>
          <Input
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="type-label" style={{ color: 'var(--color-text-secondary)' }}>
            Amount
          </label>
          <Input
            value={amountStr}
            onChange={(e) => { setAmountStr(e.target.value); setError(null); }}
            style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="type-label" style={{ color: 'var(--color-text-secondary)' }}>
            Category
          </label>
          <Select value={category} onValueChange={setCategory}>
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

        <label
          className="flex items-center gap-2 type-body"
          style={{ color: 'var(--color-text-primary)', cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={isCleared}
            onChange={(e) => setIsCleared(e.target.checked)}
            style={{ accentColor: 'var(--color-interactive)' }}
          />
          Cleared
        </label>

        <div className="flex flex-col gap-1">
          <label className="type-label" style={{ color: 'var(--color-text-secondary)' }}>
            Memo
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Optional note…"
            rows={3}
            style={{
              width: '100%',
              resize: 'vertical',
              background: 'var(--color-bg-app)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              color: 'var(--color-text-primary)',
              padding: '6px 10px',
              font: 'inherit',
              fontSize: '14px',
              lineHeight: '1.5',
            }}
          />
        </div>

        {error && (
          <div className="type-caption" style={{ color: 'var(--color-red)' }}>
            {error}
          </div>
        )}

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
