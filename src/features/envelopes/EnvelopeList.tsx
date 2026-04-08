import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Button } from '@/components/ui/button';
import EnvelopeCard from './EnvelopeCard';
import AddEnvelopeForm from './AddEnvelopeForm';

export default function EnvelopeList() {
  const navigate = useNavigate();
  const { envelopes, isWriting, error } = useEnvelopeStore();
  const isReadOnly = useSettingsStore((s) => s.isReadOnly);
  const [showAddForm, setShowAddForm] = useState(false);

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

      {envelopes.map((envelope) => (
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
