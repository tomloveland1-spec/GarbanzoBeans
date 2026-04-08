import { useState } from 'react';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { formatCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import TransactionRow from './TransactionRow';
import AddTransactionForm from './AddTransactionForm';
import UnknownMerchantQueue from './UnknownMerchantQueue';

function formatImportDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function LedgerView() {
  const transactions = useTransactionStore(s => s.transactions);
  const importResult = useTransactionStore(s => s.importResult);
  const envelopes = useEnvelopeStore(s => s.envelopes);
  const [showAddForm, setShowAddForm] = useState(false);

  const envelopeMap = new Map(envelopes.map(e => [e.id, e.name]));

  const clearedBalance = transactions
    .filter(t => t.isCleared)
    .reduce((sum, t) => sum + t.amountCents, 0);

  const workingBalance = transactions
    .reduce((sum, t) => sum + t.amountCents, 0);

  const importDateLabel = importResult ? formatImportDate(importResult.latestDate) : null;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Sticky header */}
      <div
        className="flex-shrink-0 px-4 py-3 border-b"
        style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex gap-8 items-start justify-between">
          <div className="flex gap-8">
          <div data-testid="balance-cleared">
            <div className="type-label" style={{ color: 'var(--color-text-secondary)' }}>Cleared</div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--color-text-primary)',
              }}
            >
              {formatCurrency(clearedBalance)}
            </div>
          </div>
          <div data-testid="balance-working">
            <div className="type-label" style={{ color: 'var(--color-text-secondary)' }}>Working</div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--color-text-primary)',
              }}
            >
              {formatCurrency(workingBalance)}
            </div>
          </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowAddForm(true)}
            disabled={showAddForm}
          >
            Add Transaction
          </Button>
        </div>
        {importResult !== null && (
          <div
            className="type-caption mt-1"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {importDateLabel
              ? `Import — ${importDateLabel} — ${importResult.count} transactions`
              : `Import — ${importResult.count} transactions`}
          </div>
        )}
      </div>

      {/* Unknown merchant queue — shown after import when transactions need manual categorization */}
      {(() => {
        const queueIds = [
          ...new Set([
            ...(importResult?.uncategorizedIds ?? []),
            ...(importResult?.conflictedIds ?? []),
          ]),
        ];
        return queueIds.length > 0 ? (
          <UnknownMerchantQueue
            queueIds={queueIds}
            transactions={transactions}
            envelopes={envelopes}
            conflictedIds={importResult?.conflictedIds ?? []}
          />
        ) : null;
      })()}

      {/* Add Transaction inline form */}
      {showAddForm && (
        <AddTransactionForm
          onSuccess={() => setShowAddForm(false)}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Scrollable transaction list */}
      <div className="flex-1 overflow-y-auto">
        {transactions.length === 0 ? (
          <div
            className="flex items-center justify-center h-full type-body"
            style={{ color: 'var(--color-text-muted)' }}
          >
            No transactions yet — import an OFX file above to get started
          </div>
        ) : (
          <table className="w-full border-collapse" aria-label="Transactions">
            <thead>
              <tr className="type-label" style={{ color: 'var(--color-text-secondary)' }}>
                <th
                  scope="col"
                  className="text-left px-4 py-2 font-medium"
                  style={{ borderBottom: '1px solid var(--color-border)' }}
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
                  className="text-right px-4 py-2 font-medium"
                  style={{ borderBottom: '1px solid var(--color-border)', fontVariantNumeric: 'tabular-nums' }}
                >
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => {
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
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
