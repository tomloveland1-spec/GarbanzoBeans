import { useState, useEffect } from 'react';
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

interface AddTransactionFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AddTransactionForm({ onSuccess, onCancel }: AddTransactionFormProps) {
  const isWriting = useTransactionStore(s => s.isWriting);
  const envelopes = useEnvelopeStore(s => s.envelopes);

  const today = new Date().toISOString().slice(0, 10);

  const [payee, setPayee] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState<string>('none');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  async function handleSave() {
    const amountCents = Math.round(parseFloat(amountStr) * 100);
    if (!amountStr.trim() || isNaN(amountCents)) {
      setAmountError('Enter a valid amount (e.g. -12.34)');
      return;
    }
    setAmountError(null);
    setSaveError(null);

    await useTransactionStore.getState().createTransaction({
      payee,
      amountCents,
      date,
      envelopeId: category === 'none' ? null : Number(category),
      isCleared: false,
    });

    const state = useTransactionStore.getState();
    if (!state.error) {
      onSuccess();
    } else {
      setSaveError(state.error.message);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSave();
  }

  return (
    <div
      className="flex flex-col gap-3 p-3"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div className="flex gap-2 items-start flex-wrap">
        <Input
          placeholder="Payee"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          style={{ flex: '1 1 160px', minWidth: 0 }}
        />

        <div style={{ flex: '0 0 140px' }}>
          <Input
            placeholder="Amount (e.g. -12.34)"
            value={amountStr}
            onChange={(e) => { setAmountStr(e.target.value); setAmountError(null); }}
            onKeyDown={handleKeyDown}
            style={{ textAlign: 'right', width: '100%' }}
          />
          {amountError && (
            <div
              className="type-caption mt-1"
              style={{ color: 'var(--color-text-danger, #f87171)' }}
            >
              {amountError}
            </div>
          )}
        </div>

        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: '0 0 140px' }}
        />

        <div style={{ flex: '0 0 160px' }}>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger style={{ width: '100%' }}>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {envelopes.map(e => (
                <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={isWriting}>
            Save
          </Button>
        </div>
      </div>

      {saveError && (
        <div
          className="type-caption"
          style={{ color: 'var(--color-text-danger, #f87171)' }}
        >
          {saveError}
        </div>
      )}
    </div>
  );
}
