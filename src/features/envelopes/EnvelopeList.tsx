import { useState } from 'react';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { Button } from '@/components/ui/button';
import EnvelopeCard from './EnvelopeCard';
import AddEnvelopeForm from './AddEnvelopeForm';

export default function EnvelopeList() {
  const { envelopes, isWriting, error } = useEnvelopeStore();
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="flex flex-col gap-2 p-4">
      {envelopes.map((envelope) => (
        <EnvelopeCard key={envelope.id} envelope={envelope} />
      ))}

      {showAddForm && (
        <AddEnvelopeForm
          onSuccess={() => setShowAddForm(false)}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <Button
        variant="outline"
        className="mt-2"
        onClick={() => setShowAddForm(true)}
        disabled={isWriting || showAddForm}
      >
        Add Envelope
      </Button>

      {error && (
        <p className="text-sm mt-1" style={{ color: '#ff5555' }}>
          {error.message}
        </p>
      )}
    </div>
  );
}
