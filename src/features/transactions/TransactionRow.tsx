import { useState, useRef } from 'react';
import type { Transaction, Envelope } from '@/lib/types';
import { formatCurrency } from '@/lib/currency';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function formatTxDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface TransactionRowProps {
  transaction: Transaction;
  envelopeMap: Map<number, string>;
  envelopes: Envelope[];
  /** Inline auto-categorization label for the latest import batch, e.g. `-> Groceries via Kroger rule`.
   *  Only present for transactions from the most recent import that were auto-categorized. */
  matchedRuleLabel?: string;
}

type EditableField = 'payee' | 'amount' | 'date' | 'category' | null;

export default function TransactionRow({ transaction, envelopeMap, envelopes, matchedRuleLabel }: TransactionRowProps) {
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [draftValue, setDraftValue] = useState('');
  // P1: prevents onBlur from firing commitEdit after Escape cancels the edit
  const cancelledRef = useRef(false);

  function startEdit(field: EditableField, initialValue: string) {
    setEditingField(field);
    setDraftValue(initialValue);
  }

  function cancelEdit() {
    cancelledRef.current = true;
    setEditingField(null);
    setDraftValue('');
  }

  async function commitEdit(field: EditableField, value?: string) {
    // P1: blur fired after Escape — ignore it
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }

    // P2: validate amount before clearing state so invalid input keeps edit mode active
    if (field === 'amount') {
      const cents = Math.round(parseFloat(value ?? draftValue) * 100);
      if (isNaN(cents)) return;
      setEditingField(null);
      setDraftValue('');
      await useTransactionStore.getState().updateTransaction({ id: transaction.id, amountCents: cents });
      return;
    }

    const val = value ?? draftValue;
    setEditingField(null);
    setDraftValue('');

    if (field === 'payee') {
      await useTransactionStore.getState().updateTransaction({ id: transaction.id, payee: val });
    } else if (field === 'date') {
      await useTransactionStore.getState().updateTransaction({ id: transaction.id, date: val });
    } else if (field === 'category') {
      if (val === 'none') {
        await useTransactionStore.getState().updateTransaction({ id: transaction.id, clearEnvelopeId: true });
      } else {
        await useTransactionStore.getState().updateTransaction({ id: transaction.id, envelopeId: Number(val) });
      }
      await useEnvelopeStore.getState().loadEnvelopes();
    }
  }

  const savingsEnvelopeIds = new Set(envelopes.filter((e) => e.isSavings).map((e) => e.id));
  const isSavingsTx = transaction.envelopeId !== null && savingsEnvelopeIds.has(transaction.envelopeId);

  const category =
    transaction.envelopeId !== null
      ? (envelopeMap.get(transaction.envelopeId) ?? 'Unknown')
      : 'Uncategorized';

  const rowStyle = transaction.isCleared
    ? { color: 'var(--color-text-primary)' }
    : { color: 'var(--color-text-secondary)', opacity: 0.5 };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    borderRadius: '4px',
    padding: '2px 4px',
    font: 'inherit',
    opacity: 1,
  };

  return (
    <tr
      className="type-body border-b"
      style={{ ...rowStyle, borderColor: 'var(--color-border)' }}
    >
      {/* Date cell */}
      <td
        className="px-4 py-2"
        onClick={() => editingField === null && startEdit('date', transaction.date)}
        style={{ cursor: 'text' }}
      >
        {editingField === 'date' ? (
          <input
            type="date"
            value={draftValue}
            style={inputStyle}
            autoFocus
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit('date');
              if (e.key === 'Escape') cancelEdit();
            }}
            onBlur={() => commitEdit('date')}
          />
        ) : (
          formatTxDate(transaction.date)
        )}
      </td>

      {/* Payee cell */}
      <td
        className="px-4 py-2"
        onClick={() => editingField === null && startEdit('payee', transaction.payee)}
        style={{ cursor: 'text' }}
      >
        {editingField === 'payee' ? (
          <input
            type="text"
            value={draftValue}
            style={inputStyle}
            autoFocus
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit('payee');
              if (e.key === 'Escape') cancelEdit();
            }}
            onBlur={() => commitEdit('payee')}
          />
        ) : (
          <>
            {transaction.payee}
            {matchedRuleLabel && (
              <span
                className="type-caption"
                style={{ display: 'block', color: 'var(--color-text-secondary)' }}
                data-testid="matched-rule-label"
              >
                {matchedRuleLabel}
              </span>
            )}
          </>
        )}
      </td>

      {/* Category cell */}
      <td
        className="px-4 py-2"
        onClick={() => editingField === null && setEditingField('category')}
        style={{ cursor: 'pointer' }}
      >
        {editingField === 'category' ? (
          <Select
            value={transaction.envelopeId !== null ? String(transaction.envelopeId) : 'none'}
            onValueChange={(val) => commitEdit('category', val)}
            onOpenChange={(open) => {
              // P3: dropdown closed without selecting — exit category edit mode
              if (!open && editingField === 'category') {
                setEditingField(null);
                setDraftValue('');
              }
            }}
          >
            <SelectTrigger onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {envelopes.map(e => (
                <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          category
        )}
      </td>

      {/* Amount cell */}
      <td
        className="px-4 py-2 text-right"
        style={{ fontVariantNumeric: 'tabular-nums', cursor: 'text' }}
        onClick={() =>
          editingField === null &&
          startEdit('amount', (transaction.amountCents / 100).toFixed(2))
        }
      >
        {editingField === 'amount' ? (
          <input
            type="text"
            value={draftValue}
            style={{ ...inputStyle, textAlign: 'right' }}
            autoFocus
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit('amount');
              if (e.key === 'Escape') cancelEdit();
            }}
            onBlur={() => {
              // Validate before committing on blur; cancel if invalid rather than saving garbage
              const cents = Math.round(parseFloat(draftValue) * 100);
              if (!isNaN(cents)) commitEdit('amount');
              else cancelEdit();
            }}
          />
        ) : (
          <>
            {formatCurrency(transaction.amountCents)}
            {isSavingsTx && (
              <span
                className="type-caption"
                style={{ display: 'block', color: 'var(--color-text-secondary)' }}
                data-testid="savings-direction"
              >
                {transaction.amountCents < 0 ? '↓ deposited' : '↑ withdrew'}
              </span>
            )}
          </>
        )}
      </td>
    </tr>
  );
}
