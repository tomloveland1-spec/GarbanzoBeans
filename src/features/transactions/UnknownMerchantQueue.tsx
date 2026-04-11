import { useState } from 'react';
import type { Transaction, Envelope } from '@/lib/types';
import { formatCurrency } from '@/lib/currency';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useMerchantRuleStore } from '@/stores/useMerchantRuleStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import SubstringRuleBuilder from '@/features/merchant-rules/SubstringRuleBuilder';

function formatTxDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function sortWithMRU(envelopes: Envelope[], mruIds: number[]): Envelope[] {
  const mruSet = new Set(mruIds);
  const mru = mruIds.map(id => envelopes.find(e => e.id === id)).filter(Boolean) as Envelope[];
  const rest = envelopes.filter(e => !mruSet.has(e.id));
  return [...mru, ...rest];
}

interface UnknownMerchantQueueProps {
  queueIds: number[];
  transactions: Transaction[];
  envelopes: Envelope[];
  conflictedIds: number[];
}

export default function UnknownMerchantQueue({
  queueIds,
  transactions,
  envelopes,
  conflictedIds,
}: UnknownMerchantQueueProps) {
  const [mruIds, setMruIds] = useState<number[]>([]);
  const [assigningId, setAssigningId] = useState<number | null>(null);

  // Rule-builder state
  const [ruleBuilderItemId, setRuleBuilderItemId] = useState<number | null>(null);
  const [pendingEnvelopeId, setPendingEnvelopeId] = useState<number | null>(null);
  const [selectedSubstring, setSelectedSubstring] = useState<string>('');

  if (queueIds.length === 0) return null;

  const conflictedSet = new Set(conflictedIds);
  const txMap = new Map(transactions.map(t => [t.id, t]));
  const queueItems = queueIds.map(id => txMap.get(id)).filter(Boolean) as Transaction[];
  const sortedEnvelopes = sortWithMRU(envelopes, mruIds);

  async function handleAssign(transactionId: number, envelopeId: number) {
    setAssigningId(transactionId);
    try {
      await useTransactionStore.getState().updateTransaction({ id: transactionId, envelopeId });
      await useEnvelopeStore.getState().loadEnvelopes();
      setMruIds(prev => {
        const deduped = [envelopeId, ...prev.filter(id => id !== envelopeId)];
        return deduped.slice(0, 3);
      });
    } finally {
      setAssigningId(null);
    }
  }

  function resetRuleBuilder() {
    setRuleBuilderItemId(null);
    setPendingEnvelopeId(null);
    setSelectedSubstring('');
  }

  async function handleRuleSave(id: number) {
    if (pendingEnvelopeId === null || selectedSubstring === '') return;
    setAssigningId(id);
    try {
      await handleAssign(id, pendingEnvelopeId);
      // handleAssign clears assigningId in its own finally; re-set it so the
      // "Save rule" button stays disabled while createRule is in flight.
      setAssigningId(id);
      await useMerchantRuleStore.getState().createRule({
        payeeSubstring: selectedSubstring,
        envelopeId: pendingEnvelopeId,
      });
    } finally {
      setAssigningId(null);
      resetRuleBuilder();
    }
  }

  async function handleRuleDismiss(id: number) {
    if (pendingEnvelopeId !== null) {
      try {
        await handleAssign(id, pendingEnvelopeId);
      } catch {
        // Assignment failed — keep the rule builder open so the user can retry.
        return;
      }
    }
    resetRuleBuilder();
  }

  return (
    <div
      className="flex-shrink-0 border-b"
      style={{ borderColor: 'var(--color-border)', maxHeight: '40%', display: 'flex', flexDirection: 'column' }}
      data-testid="unknown-merchant-queue"
    >
      <div
        className="type-label px-4 pt-3 pb-2 flex-shrink-0"
        style={{ color: 'var(--color-text-secondary)' }}
        data-testid="queue-header"
      >
        {queueItems.length} transaction{queueItems.length !== 1 ? 's' : ''} need a category
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-3">
        {queueItems.map(tx => {
          const isRuleBuilderMode = ruleBuilderItemId === tx.id;
          const pendingEnvelope = pendingEnvelopeId !== null
            ? envelopes.find(e => e.id === pendingEnvelopeId) ?? null
            : null;
          const saveRuleDisabled =
            selectedSubstring === '' || pendingEnvelopeId === null || assigningId === tx.id;

          return (
            <div key={tx.id} data-testid={`queue-item-${tx.id}`}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  {isRuleBuilderMode ? (
                    <SubstringRuleBuilder
                      payee={tx.payee}
                      envelopeName={pendingEnvelope?.name ?? null}
                      selectedSubstring={selectedSubstring}
                      onSubstringChange={setSelectedSubstring}
                    />
                  ) : (
                    <>
                      <div className="type-body" style={{ color: 'var(--color-text-primary)' }}>
                        {tx.payee}
                      </div>
                      {conflictedSet.has(tx.id) && (
                        <div
                          className="type-caption"
                          style={{ color: 'var(--color-text-secondary)' }}
                          data-testid={`conflict-note-${tx.id}`}
                        >
                          Multiple rules matched — choose manually
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div
                  className="type-body"
                  style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}
                >
                  {formatTxDate(tx.date)}
                </div>
                <div
                  className="type-body"
                  style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--color-text-primary)' }}
                >
                  {formatCurrency(tx.amountCents)}
                </div>
                <Select
                  key={`${tx.id}-${isRuleBuilderMode ? 'rb' : 'normal'}`}
                  onValueChange={(val) => {
                    if (isRuleBuilderMode) {
                      setPendingEnvelopeId(Number(val));
                    } else {
                      handleAssign(tx.id, Number(val));
                    }
                  }}
                  disabled={assigningId === tx.id}
                >
                  <SelectTrigger style={{ width: '160px' }} aria-label={`Category for ${tx.payee}`}>
                    <SelectValue placeholder="Choose category" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedEnvelopes.map(e => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isRuleBuilderMode ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={saveRuleDisabled}
                      onClick={() => handleRuleSave(tx.id)}
                      data-testid={`save-rule-btn-${tx.id}`}
                    >
                      Save rule
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRuleDismiss(tx.id)}
                      data-testid={`dismiss-rule-btn-${tx.id}`}
                    >
                      Dismiss
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRuleBuilderItemId(tx.id);
                      setPendingEnvelopeId(null);
                      setSelectedSubstring('');
                    }}
                    data-testid={`save-as-rule-btn-${tx.id}`}
                  >
                    Save as rule
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
