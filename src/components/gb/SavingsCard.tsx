import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Envelope } from '@/lib/types';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const LIME = '#C0F500';

interface SavingsCardProps {
  envelope: Envelope;
}

export default function SavingsCard({ envelope }: SavingsCardProps) {
  const { deleteEnvelope, isWriting } = useEnvelopeStore();
  const isReadOnly = useSettingsStore((s) => s.isReadOnly);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const handleRemoveSavings = () => {
    useEnvelopeStore.getState().updateEnvelope({ id: envelope.id, isSavings: false });
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
        borderLeft: `4px solid ${LIME}`,
      }}
      aria-label={`${envelope.name} savings envelope`}
    >
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span
          className="type-label"
          style={{ color: LIME, textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          SAVINGS
        </span>
        <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
          {envelope.name}
        </span>
      </div>

      {/* ⋯ action menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Savings envelope actions"
            disabled={isReadOnly}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleRemoveSavings}>
            Remove Savings Designation
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsDeleteOpen(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
