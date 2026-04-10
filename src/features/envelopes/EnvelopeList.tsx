import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Button } from '@/components/ui/button';
import EnvelopeCard from './EnvelopeCard';
import AddEnvelopeForm from './AddEnvelopeForm';
import SavingsCard from '@/components/gb/SavingsCard';

export default function EnvelopeList() {
  const navigate = useNavigate();
  const { envelopes, isWriting, error } = useEnvelopeStore();
  const isReadOnly = useSettingsStore((s) => s.isReadOnly);
  const [showAddForm, setShowAddForm] = useState(false);

  const savingsEnvelopes = envelopes.filter((e) => e.isSavings);
  const regularEnvelopes = envelopes.filter((e) => !e.isSavings);

  return (
    <div className="flex flex-col gap-2 p-4">
      {envelopes.length === 0 && !showAddForm && (
        <p
          className="type-body text-center py-8"
          style={{ color: 'var(--color-text-muted)' }}
        >
          No envelopes yet. Add one to start budgeting.
        </p>
      )}

      {savingsEnvelopes.length > 0 && (
        <>
          <span
            className="type-label"
            style={{ color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Savings
          </span>
          {savingsEnvelopes.map((envelope) => (
            <SavingsCard key={envelope.id} envelope={envelope} />
          ))}
        </>
      )}

      {regularEnvelopes.map((envelope) => (
        <EnvelopeCard key={envelope.id} envelope={envelope} />
      ))}

      {showAddForm && (
        <AddEnvelopeForm
          onSuccess={() => setShowAddForm(false)}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <div className="flex gap-2 mt-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => { if (!isReadOnly) setShowAddForm(true); }}
          disabled={isWriting || showAddForm || isReadOnly}
        >
          Add Envelope
        </Button>

        {!isReadOnly && (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate({ to: '/budget/allocate' })}
            disabled={isWriting || showAddForm}
            data-testid="allocate-button"
          >
            Allocate
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm mt-1" style={{ color: '#ff5555' }}>
          {error.message}
        </p>
      )}
    </div>
  );
}
