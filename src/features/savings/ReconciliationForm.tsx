import { useState, useEffect, useRef } from 'react';
import { useSavingsStore } from '@/stores/useSavingsStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { formatCurrency } from '@/lib/currency';

export default function ReconciliationForm() {
  const { reconciliations, isWriting, error, recordReconciliation, currentTrackedBalance } =
    useSavingsStore();
  const { isReadOnly } = useSettingsStore();

  const [dollarValue, setDollarValue] = useState('');
  const [note, setNote] = useState('');

  const trackedBalance = currentTrackedBalance();
  const showTrackedBalance = reconciliations.length > 0;

  const wasWritingRef = useRef(false);
  useEffect(() => {
    if (wasWritingRef.current && !isWriting && error === null) {
      setDollarValue('');
      setNote('');
    }
    wasWritingRef.current = isWriting;
  }, [isWriting, error]);

  const handleSubmit = () => {
    const cents = Math.round(parseFloat(dollarValue) * 100);
    if (isNaN(cents) || cents < 0) return;
    recordReconciliation(cents, note.trim() || undefined);
  };

  return (
    <div className="flex flex-col gap-2">
      {showTrackedBalance && (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Current tracked balance: {formatCurrency(trackedBalance)}
        </p>
      )}
      <div className="flex items-center gap-1">
        <span style={{ color: 'var(--color-text-secondary)' }}>$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={dollarValue}
          onChange={(e) => setDollarValue(e.target.value)}
          disabled={isReadOnly || isWriting}
          className="border rounded px-2 py-1 bg-transparent text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
        />
      </div>
      <input
        type="text"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={isReadOnly || isWriting}
        className="border rounded px-2 py-1 bg-transparent text-sm"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
      />
      <button
        onClick={handleSubmit}
        disabled={isReadOnly || isWriting}
        className="px-3 py-1 rounded text-sm font-semibold"
        style={{ backgroundColor: '#C0F500', color: '#111214' }}
      >
        Save Balance
      </button>
      {error && (
        <p className="text-sm" style={{ color: 'var(--color-destructive, #ef4444)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
