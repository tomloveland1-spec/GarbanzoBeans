import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Envelope } from '@/lib/types';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { formatCurrency } from '@/lib/currency';
import { Badge } from '@/components/ui/badge';
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

interface EnvelopeCardProps {
  envelope: Envelope;
}

export default function EnvelopeCard({ envelope }: EnvelopeCardProps) {
  const { deleteEnvelope, isWriting } = useEnvelopeStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(envelope.name);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const suppressBlurRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const handleNameClick = () => {
    setEditValue(envelope.name);
    setIsEditing(true);
  };

  const handleNameBlur = () => {
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false;
      return;
    }
    if (editValue.trim() && editValue.trim() !== envelope.name) {
      useEnvelopeStore.getState().updateEnvelope({ id: envelope.id, name: editValue.trim() });
    }
    setIsEditing(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      suppressBlurRef.current = true;
      setEditValue(envelope.name);
      setIsEditing(false);
      e.preventDefault();
    }
  };

  const handleDelete = async () => {
    await deleteEnvelope(envelope.id);
    if (!useEnvelopeStore.getState().error) {
      setIsDeleteOpen(false);
    }
  };

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-md"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
      }}
      aria-label={`${envelope.name} envelope, ${envelope.type}, ${envelope.priority}`}
    >
      {/* Name — inline editable */}
      <div className="flex-1 min-w-0 mr-3">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            className="h-7 py-0 text-sm"
          />
        ) : (
          <button
            onClick={handleNameClick}
            className="text-sm font-medium truncate text-left w-full cursor-text"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {envelope.name}
          </button>
        )}
      </div>

      {/* Badges + amount + settings */}
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline">{envelope.type}</Badge>
        <Badge variant="outline">{envelope.priority}</Badge>
        <span
          className="text-sm tabular-nums w-20 text-right"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {formatCurrency(envelope.allocatedCents)}
        </span>

        {/* Settings affordance */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setIsDeleteOpen(true)}
          aria-label="Envelope settings"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {envelope.name}</DialogTitle>
            <DialogDescription>
              This envelope and its allocation will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-2 justify-end">
            <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isWriting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
