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
  const amountColor = amount >= 0 ? 'var(--color-envelope-green)' : 'var(--color-red)';

  return (
    <tr
      onClick={onSelect}
      className="type-body"
      style={{
        cursor: 'pointer',
        opacity: transaction.isCleared ? undefined : 0.5,
        backgroundColor: isSelected ? 'rgba(192, 245, 0, 0.05)' : undefined,
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* Date */}
      <td className="px-4 py-2" style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
        {formatTxDate(transaction.date)}
      </td>

      {/* Payee */}
      <td className="px-4 py-2" style={{ color: 'var(--color-text-primary)' }}>
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
      </td>

      {/* Category */}
      <td className="px-4 py-2">
        <span
          className="type-caption"
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '12px',
            backgroundColor: isUncategorized
              ? 'rgba(245, 168, 0, 0.13)'
              : 'rgba(255, 255, 255, 0.06)',
            color: isUncategorized ? 'var(--color-amber)' : 'var(--color-text-secondary)',
          }}
        >
          {categoryName}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-2 text-center" style={{ width: '60px' }}>
        {transaction.isCleared ? (
          <span style={{ color: 'var(--color-envelope-green)', fontSize: '12px' }}>✓</span>
        ) : (
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px', opacity: 0.4 }}>
            ○
          </span>
        )}
      </td>

      {/* Amount */}
      <td
        className="px-4 py-2 text-right"
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
