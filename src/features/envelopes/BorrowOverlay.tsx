import { useState, useEffect } from 'react';
import type { Envelope, EnvelopePriority, BorrowInput } from '@/lib/types';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { formatCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface BorrowOverlayProps {
  targetEnvelope: Envelope;
  open: boolean;
  onClose: () => void;
}

const PRIORITY_ORDER: Record<EnvelopePriority, number> = { Want: 0, Should: 1, Need: 2 };

export default function BorrowOverlay({ targetEnvelope, open, onClose }: BorrowOverlayProps) {
  const { envelopes, borrowError, borrowFromEnvelope } = useEnvelopeStore();

  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [amountValue, setAmountValue] = useState('');
  const [step, setStep] = useState<'select' | 'confirm-savings'>('select');
  // Snapshot of "new savings balance" captured at transition time to avoid
  // showing a double-decremented value after the optimistic store update fires.
  const [savingsNewBalance, setSavingsNewBalance] = useState<number | null>(null);

  // P3: Clear stale borrowError from a previous session when the overlay opens.
  useEffect(() => {
    if (open) {
      useEnvelopeStore.setState({ borrowError: null });
    }
  }, [open]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedSourceId(null);
      setAmountValue('');
      setStep('select');
      setSavingsNewBalance(null);
      onClose();
    }
  };

  // Filter: funded envelopes that are not the target
  const fundedSources = envelopes.filter(
    (e) => e.allocatedCents > 0 && e.id !== targetEnvelope.id
  );
  const regularSources = fundedSources
    .filter((e) => !e.isSavings)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const savingsSource = fundedSources.find((e) => e.isSavings);

  const selectedSource = selectedSourceId !== null
    ? fundedSources.find((e) => e.id === selectedSourceId) ?? null
    : null;

  const parsedCents = Math.round(parseFloat(amountValue) * 100);
  const amountValid = Number.isFinite(parsedCents) && parsedCents > 0;
  // P5: track zero/negative input separately for a validation message
  const amountIsZeroOrNegative = amountValue !== '' && Number.isFinite(parsedCents) && parsedCents <= 0;
  const amountExceedsSource = selectedSource !== null && amountValid && parsedCents > selectedSource.allocatedCents;
  const borrowDisabled = selectedSource === null || !amountValid || amountExceedsSource;

  const handleBorrowClick = async () => {
    if (borrowDisabled || selectedSource === null) return;

    if (selectedSource.isSavings) {
      // P4: Snapshot the new balance before the optimistic store update can fire,
      // so the confirmation screen shows the correct value throughout.
      setSavingsNewBalance(selectedSource.allocatedCents - parsedCents);
      setStep('confirm-savings');
      return;
    }

    const input: BorrowInput = {
      sourceEnvelopeId: selectedSource.id,
      targetEnvelopeId: targetEnvelope.id,
      amountCents: parsedCents,
    };
    await borrowFromEnvelope(input);
    if (!useEnvelopeStore.getState().borrowError) {
      handleOpenChange(false);
    }
  };

  const handleSavingsConfirm = async () => {
    if (selectedSource === null) return;
    const input: BorrowInput = {
      sourceEnvelopeId: selectedSource.id,
      targetEnvelopeId: targetEnvelope.id,
      amountCents: parsedCents,
    };
    await borrowFromEnvelope(input);
    if (!useEnvelopeStore.getState().borrowError) {
      handleOpenChange(false);
    }
  };

  const handleSavingsCancel = () => {
    setSavingsNewBalance(null);
    setStep('select');
  };

  const renderSourceRow = (env: Envelope) => (
    <button
      key={env.id}
      onClick={() => { setSelectedSourceId(env.id); setAmountValue(''); }}
      className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors"
      style={{
        backgroundColor: selectedSourceId === env.id
          ? 'var(--color-accent-lime-dim, rgba(192,245,0,0.12))'
          : 'var(--color-bg-elevated, transparent)',
        border: `1px solid ${selectedSourceId === env.id ? 'var(--color-accent-lime, #C0F500)' : 'var(--color-border)'}`,
        color: 'var(--color-text-primary)',
      }}
    >
      <span className="font-medium">{env.name}</span>
      <span className="tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
        {formatCurrency(env.allocatedCents)}
      </span>
    </button>
  );

  if (step === 'confirm-savings' && selectedSource !== null) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrow {formatCurrency(parsedCents)} from Savings</DialogTitle>
            <DialogDescription>
              New savings balance: {formatCurrency(savingsNewBalance ?? (selectedSource.allocatedCents - parsedCents))}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            This is exactly what it&apos;s for.
          </p>
          {borrowError && (
            <p className="text-sm" style={{ color: 'var(--color-state-overspent, #ef4444)' }}>
              {borrowError.message}
            </p>
          )}
          <DialogFooter className="flex flex-row justify-between gap-2">
            <Button variant="ghost" onClick={handleSavingsCancel}>
              Cancel
            </Button>
            <Button onClick={handleSavingsConfirm}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Borrow into {targetEnvelope.name}</DialogTitle>
          <DialogDescription>
            Select an envelope to borrow from and enter the amount.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {fundedSources.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-muted)' }}>
              No funded envelopes to borrow from.
            </p>
          ) : (
            <>
              {regularSources.map(renderSourceRow)}

              {savingsSource && (
                <>
                  <div
                    className="my-1 border-t"
                    style={{ borderColor: 'var(--color-border)' }}
                    aria-label="Savings separator"
                  />
                  {renderSourceRow(savingsSource)}
                </>
              )}
            </>
          )}
        </div>

        {selectedSource !== null && (
          <div className="flex flex-col gap-2 mt-1">
            <Input
              type="number"
              placeholder="Amount"
              value={amountValue}
              min={0.01}
              max={selectedSource.allocatedCents / 100}
              step={0.01}
              onChange={(e) => setAmountValue(e.target.value)}
            />
            {amountIsZeroOrNegative && (
              <p className="text-xs" style={{ color: 'var(--color-state-overspent, #ef4444)' }}>
                Amount must be greater than zero.
              </p>
            )}
            {amountValid && !amountExceedsSource && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Borrowing {formatCurrency(parsedCents)} → {targetEnvelope.name}: {formatCurrency(targetEnvelope.allocatedCents + parsedCents)}
              </p>
            )}
            {amountExceedsSource && (
              <p className="text-xs" style={{ color: 'var(--color-state-overspent, #ef4444)' }}>
                Amount exceeds available balance ({formatCurrency(selectedSource.allocatedCents)})
              </p>
            )}
          </div>
        )}

        {borrowError && (
          <p className="text-sm" style={{ color: 'var(--color-state-overspent, #ef4444)' }}>
            {borrowError.message}
          </p>
        )}

        {/* P6: justify-between to match savings confirmation footer (UX-DR16) */}
        <DialogFooter className="flex flex-row justify-between gap-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleBorrowClick} disabled={borrowDisabled}>
            Borrow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
