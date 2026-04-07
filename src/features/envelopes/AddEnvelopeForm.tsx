import { useState } from 'react';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import type { EnvelopeType, EnvelopePriority } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AddEnvelopeFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AddEnvelopeForm({ onSuccess, onCancel }: AddEnvelopeFormProps) {
  const { isWriting } = useEnvelopeStore();
  const [name, setName] = useState('');
  const [envelopeType, setEnvelopeType] = useState<EnvelopeType>('Rolling');
  const [priority, setPriority] = useState<EnvelopePriority>('Need');

  const handleSave = async () => {
    if (!name.trim()) return;
    await useEnvelopeStore.getState().createEnvelope({
      name: name.trim(),
      envelopeType,
      priority,
      allocatedCents: 0,
    });
    if (!useEnvelopeStore.getState().error) {
      onSuccess();
    }
  };

  return (
    <div
      className="flex flex-col gap-3 p-3 rounded-md"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <Input
        placeholder="Envelope name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />

      <div className="flex gap-2">
        <Select value={envelopeType} onValueChange={(v) => setEnvelopeType(v as EnvelopeType)}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Rolling">Rolling</SelectItem>
            <SelectItem value="Bill">Bill</SelectItem>
            <SelectItem value="Goal">Goal</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={(v) => setPriority(v as EnvelopePriority)}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Need">Need</SelectItem>
            <SelectItem value="Should">Should</SelectItem>
            <SelectItem value="Want">Want</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={handleSave}
          disabled={isWriting || !name.trim()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
