import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useIncomeStore } from '@/stores/useIncomeStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/currency';
import type { IncomeEntry, Envelope } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCents(value: string): number | null {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

// ── Income Row ────────────────────────────────────────────────────────────────

interface IncomeRowProps {
  entry: IncomeEntry;
  onDelete: (id: number) => void;
}

function IncomeRow({ entry, onDelete }: IncomeRowProps) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 rounded-md"
      style={{ backgroundColor: 'rgba(192, 245, 0, 0.06)', border: '1px solid rgba(192, 245, 0, 0.15)' }}
    >
      <span className="type-body" style={{ color: 'var(--color-text-primary)' }}>
        {entry.name}
      </span>
      <div className="flex items-center gap-3">
        <span className="type-body font-medium" style={{ color: 'var(--color-sidebar-active)' }}>
          {formatCurrency(entry.amountCents)}
        </span>
        <button
          aria-label={`Delete ${entry.name}`}
          onClick={() => onDelete(entry.id)}
          className="type-label hover:opacity-80"
          style={{ color: 'var(--color-text-muted)' }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Add Income Form ───────────────────────────────────────────────────────────

interface AddIncomeFormProps {
  onAdd: (name: string, amountCents: number) => void;
}

function AddIncomeForm({ onAdd }: AddIncomeFormProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    const cents = parseCents(amount);
    if (cents === null) {
      setError('Enter a valid amount (e.g. 2500.00).');
      return;
    }
    onAdd(name.trim(), cents);
    setName('');
    setAmount('');
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          placeholder="Name (e.g. 1st Paycheck)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1"
          data-testid="income-name-input"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        <Input
          placeholder="Amount (e.g. 2500.00)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-36"
          data-testid="income-amount-input"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        <Button
          variant="outline"
          onClick={handleSubmit}
          data-testid="add-income-button"
        >
          Add
        </Button>
      </div>
      {error && (
        <p className="type-label" style={{ color: '#ff5555' }} data-testid="add-income-error">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Envelope Allocation Row ───────────────────────────────────────────────────

interface DraftEntry {
  value: string;       // raw string the user is typing
  cents: number | null; // parsed cents, null if invalid
  touched: boolean;    // whether the field has been blurred
}

interface EnvelopeAllocationRowProps {
  envelope: Envelope;
  draft: DraftEntry;
  onChange: (id: number, value: string) => void;
  onBlur: (id: number) => void;
}

function EnvelopeAllocationRow({ envelope, draft, onChange, onBlur }: EnvelopeAllocationRowProps) {
  const isInvalid = draft.touched && draft.cents === null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className="type-body truncate"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {envelope.name}
          </span>
          <span
            className="type-label shrink-0 px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: 'var(--color-text-muted)',
            }}
          >
            {envelope.type}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>$</span>
          <Input
            value={draft.value}
            onChange={(e) => onChange(envelope.id, e.target.value)}
            onBlur={() => onBlur(envelope.id)}
            className={`w-28 text-right ${isInvalid ? 'border-red-500' : ''}`}
            style={isInvalid ? { borderColor: '#ff5555' } : undefined}
            data-testid={`allocation-input-${envelope.id}`}
          />
        </div>
      </div>
      {isInvalid && (
        <p
          className="type-label text-right"
          style={{ color: '#ff5555' }}
          data-testid={`allocation-error-${envelope.id}`}
        >
          Enter a valid amount (0 or more).
        </p>
      )}
    </div>
  );
}

// ── Allocation Page ───────────────────────────────────────────────────────────

export default function AllocationPage() {
  const navigate = useNavigate();
  const { envelopes, isWriting: isAllocating, error: allocationError, allocateEnvelopes } = useEnvelopeStore();
  const { entries: incomeEntries, createIncomeEntry, deleteIncomeEntry } = useIncomeStore();

  const [drafts, setDrafts] = useState<Map<number, DraftEntry>>(() => {
    const m = new Map<number, DraftEntry>();
    for (const env of envelopes) {
      m.set(env.id, {
        value: (env.allocatedCents / 100).toFixed(2),
        cents: env.allocatedCents,
        touched: false,
      });
    }
    return m;
  });

  const handleDraftChange = (id: number, value: string) => {
    setDrafts((prev) => {
      const m = new Map(prev);
      const current = m.get(id);
      if (current) {
        m.set(id, { ...current, value });
      }
      return m;
    });
  };

  const handleDraftBlur = (id: number) => {
    setDrafts((prev) => {
      const m = new Map(prev);
      const current = m.get(id);
      if (current) {
        const cents = parseCents(current.value);
        m.set(id, { ...current, cents, touched: true });
      }
      return m;
    });
  };

  // Derived totals — parse live from d.value so the running total updates as the user types
  const totalIncomeCents = incomeEntries.reduce((sum, e) => sum + e.amountCents, 0);

  const totalAllocatedCents = Array.from(drafts.values()).reduce((sum, d) => {
    const live = parseCents(d.value);
    return sum + (live ?? 0);
  }, 0);

  const overageCents = totalAllocatedCents - totalIncomeCents;
  const isOver = overageCents > 0;

  const hasValidationErrors = Array.from(drafts.values()).some(
    (d) => d.touched && d.cents === null,
  );

  const canConfirm = !isOver && !hasValidationErrors && !isAllocating;

  const handleAddIncome = (name: string, amountCents: number) => {
    createIncomeEntry({ name, amountCents });
  };

  const handleConfirm = async () => {
    // Touch all fields to reveal any unblurred validation errors
    setDrafts((prev) => {
      const m = new Map(prev);
      for (const [id, draft] of m.entries()) {
        m.set(id, { ...draft, cents: parseCents(draft.value), touched: true });
      }
      return m;
    });

    // Re-check after touching all — bail if any invalid
    const allValid = Array.from(drafts.values()).every((d) => {
      const cents = parseCents(d.value);
      return cents !== null;
    });
    if (!allValid || isOver) return;

    const allocations = Array.from(drafts.entries())
      .map(([id, d]) => ({ id, allocatedCents: parseCents(d.value)! }));

    await allocateEnvelopes(allocations);

    // Navigate back on success (no error in store means success)
    if (!useEnvelopeStore.getState().error) {
      navigate({ to: '/' });
    }
  };

  // Empty state
  if (envelopes.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-4 px-8"
        data-testid="allocation-empty-state"
      >
        <p className="type-body text-center" style={{ color: 'var(--color-text-muted)' }}>
          Add envelopes on the Budget screen before allocating.
        </p>
        <Button variant="ghost" onClick={() => navigate({ to: '/' })}>
          ← Back to Budget
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="shrink-0 px-4 py-3 border-b flex items-center gap-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Button
          variant="ghost"
          className="text-sm px-2"
          onClick={() => navigate({ to: '/' })}
          data-testid="allocation-cancel"
        >
          ← Cancel
        </Button>
        <h2 className="type-h2" style={{ color: 'var(--color-text-primary)' }}>
          Monthly Allocation
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">

        {/* ── Income Section ── */}
        <section className="flex flex-col gap-3" data-testid="income-section">
          <div className="flex items-baseline justify-between">
            <h3 className="type-label uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Income
            </h3>
            <span
              className="type-body font-semibold"
              style={{ color: 'var(--color-sidebar-active)' }}
              data-testid="available-to-allocate"
            >
              Available to Allocate: {formatCurrency(totalIncomeCents)}
            </span>
          </div>

          {incomeEntries.length > 0 && (
            <div className="flex flex-col gap-2">
              {incomeEntries.map((entry) => (
                <IncomeRow
                  key={entry.id}
                  entry={entry}
                  onDelete={deleteIncomeEntry}
                />
              ))}
            </div>
          )}

          <AddIncomeForm onAdd={handleAddIncome} />
        </section>

        {/* Divider */}
        <div className="border-t" style={{ borderColor: 'var(--color-border)' }} />

        {/* ── Envelope Allocation Section ── */}
        <section className="flex flex-col gap-3" data-testid="envelope-allocation-section">
          <div className="flex items-baseline justify-between">
            <h3 className="type-label uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Envelopes
            </h3>
            <span
              className="type-label"
              style={{ color: isOver ? '#ff5555' : 'var(--color-text-muted)' }}
              data-testid="allocated-total"
            >
              Allocated: {formatCurrency(totalAllocatedCents)}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {envelopes.map((env) => {
              const draft = drafts.get(env.id) ?? {
                value: (env.allocatedCents / 100).toFixed(2),
                cents: env.allocatedCents,
                touched: false,
              };
              return (
                <EnvelopeAllocationRow
                  key={env.id}
                  envelope={env}
                  draft={draft}
                  onChange={handleDraftChange}
                  onBlur={handleDraftBlur}
                />
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <div
        className="shrink-0 border-t px-4 py-4 flex flex-col gap-2"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {isOver && (
          <p
            className="type-label text-center"
            style={{ color: '#ff5555' }}
            data-testid="overage-message"
          >
            Over budget by {formatCurrency(overageCents)}
          </p>
        )}

        {allocationError && (
          <p
            className="type-label text-center"
            style={{ color: '#ff5555' }}
            data-testid="allocation-error"
          >
            Failed to save allocations. Please try again.
          </p>
        )}

        <Button
          onClick={handleConfirm}
          disabled={!canConfirm}
          data-testid="confirm-allocation-button"
        >
          {isAllocating ? 'Saving…' : 'Confirm Allocation'}
        </Button>
      </div>
    </div>
  );
}
