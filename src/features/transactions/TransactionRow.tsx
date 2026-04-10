import type { Transaction, Envelope } from '@/lib/types';
import { formatCurrency } from '@/lib/currency';

function formatTxDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

interface TransactionRowProps {
  transaction: Transaction;
  envelopeMap: Map<number, string>;
  envelopes: Envelope[];
  /** Inline auto-categorization label for the latest import batch, e.g. `-> Groceries via Kroger rule`.
   *  Only present for transactions from the most recent import that were auto-categorized. */
  matchedRuleLabel?: string;
  isSelected: boolean;
  onSelect: () => void;
}

export default function TransactionRow({ transaction, envelopeMap, envelopes, matchedRuleLabel, isSelected, onSelect }: TransactionRowProps) {
  const savingsEnvelopeIds = new Set(envelopes.filter((e) => e.isSavings).map((e) => e.id));
  const isSavingsTx = transaction.envelopeId !== null && savingsEnvelopeIds.has(transaction.envelopeId);

  const isUncategorized = transaction.envelopeId === null;
  const categoryName = isUncategorized
    ? 'Uncategorized'
    : (envelopeMap.get(transaction.envelopeId!) ?? 'Unknown');

  const amount = transaction.amountCents;
  const amountColor = amount >= 0 ? 'var(--color-positive)' : 'var(--color-negative)';

  return (
    <tr
      onClick={onSelect}
      className="type-body"
      style={{
        cursor: 'pointer',
        opacity: transaction.isCleared ? undefined : 0.55,
        backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.05)' : undefined,
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* Date */}
      <td
        className="px-4 py-3"
        style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', width: '80px' }}
      >
        {formatTxDate(transaction.date)}
      </td>

      {/* Payee — primary text, medium weight */}
      <td className="px-4 py-3 min-w-0" style={{ color: 'var(--color-text-primary)' }}>
        <div style={{ fontWeight: 500 }} className="truncate">
          {transaction.payee}
        </div>
        {matchedRuleLabel && (
          <span
            className="type-caption"
            style={{ display: 'block', color: 'var(--color-text-secondary)', marginTop: '1px' }}
            data-testid="matched-rule-label"
          >
            {matchedRuleLabel}
          </span>
        )}
      </td>

      {/* Category */}
      <td className="px-4 py-3">
        <span
          className="type-caption"
          style={{
            display: 'inline-block',
            padding: '1px 7px',
            borderRadius: '10px',
            backgroundColor: isUncategorized
              ? 'rgba(245, 168, 0, 0.12)'
              : 'rgba(255, 255, 255, 0.05)',
            color: isUncategorized ? 'var(--color-amber)' : 'var(--color-text-secondary)',
          }}
        >
          {categoryName}
        </span>
      </td>

      {/* Memo */}
      <td
        className="px-4 py-3"
        style={{
          color: 'var(--color-text-secondary)',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={transaction.memo ?? undefined}
      >
        {transaction.memo ?? ''}
      </td>

      {/* Cleared — muted indicator */}
      <td className="px-4 py-3 text-center" style={{ width: '72px' }}>
        {transaction.isCleared ? (
          <span
            style={{ color: 'var(--color-text-secondary)', fontSize: '13px', opacity: 0.7 }}
            aria-label="Cleared"
          >
            ✓
          </span>
        ) : (
          <span
            style={{ color: 'var(--color-text-secondary)', fontSize: '11px', opacity: 0.3 }}
            aria-label="Pending"
          >
            ○
          </span>
        )}
      </td>

      {/* Amount — right-aligned, tabular nums */}
      <td
        className="px-4 py-3 text-right"
        style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: amountColor }}
      >
        {formatCurrency(amount)}
        {isSavingsTx && (
          <span
            className="type-caption"
            style={{ display: 'block', color: 'var(--color-text-secondary)' }}
            data-testid="savings-direction"
          >
            {amount < 0 ? 'Savings Deposit' : 'Savings Withdrawal'}
          </span>
        )}
      </td>
    </tr>
  );
}
