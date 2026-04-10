import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Envelope, EnvelopeType, EnvelopePriority } from '@/lib/types';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { formatCurrency } from '@/lib/currency';
import BorrowOverlay from './BorrowOverlay';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  deriveEnvelopeState,
  getEnvelopeStateExplanation,
  STATE_COLORS,
  STATE_LABELS,
} from '@/lib/envelopeState';

interface EnvelopeCardProps {
  envelope: Envelope;
}

export default function EnvelopeCard({ envelope }: EnvelopeCardProps) {
  const { deleteEnvelope, isWriting } = useEnvelopeStore();
  const isReadOnly = useSettingsStore((s) => s.isReadOnly);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(envelope.name);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isBorrowOpen, setIsBorrowOpen] = useState(false);
  const [envelopeType, setEnvelopeType] = useState<EnvelopeType>(envelope.type);
  const [editPriority, setEditPriority] = useState<EnvelopePriority>(envelope.priority);

  const inputRef = useRef<HTMLInputElement>(null);
  const suppressBlurRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const handleNameClick = () => {
    if (isReadOnly) return;
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

  const handleEditOpen = () => {
    setEnvelopeType(envelope.type);
    setEditPriority(envelope.priority);
    setIsEditOpen(true);
  };

  const handleEditSave = async () => {
    await useEnvelopeStore.getState().updateEnvelope({
      id: envelope.id,
      envelopeType,
      priority: editPriority,
    });
    if (!useEnvelopeStore.getState().error) {
      setIsEditOpen(false);
    }
  };

  const state = deriveEnvelopeState(envelope.allocatedCents, 0);

  const progressPct = envelope.allocatedCents > 0
    ? Math.min(100, (0 / envelope.allocatedCents) * 100)
    : 0;

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-md"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderLeft: `4px solid ${STATE_COLORS[state]}`,
      }}
      aria-label={`${envelope.name} envelope, ${envelope.type}, ${envelope.priority}, ${STATE_LABELS[state]}`}
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
        {/* Mini progress bar */}
        <div
          className="mt-1 w-14 h-[3px] rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--color-border)' }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressPct}%`,
              backgroundColor: STATE_COLORS[state],
            }}
          />
        </div>
      </div>

      {/* Badges + amounts + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline">{envelope.type}</Badge>
        <Badge variant="outline">{envelope.priority}</Badge>

        {/* State badge + tooltip */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              style={{ borderColor: STATE_COLORS[state], color: STATE_COLORS[state] }}
            >
              {STATE_LABELS[state]}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {getEnvelopeStateExplanation(envelope.type, state)}
          </TooltipContent>
        </Tooltip>

        {/* Labeled amounts */}
        <div className="flex flex-col items-end text-right gap-0.5 shrink-0">
          <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>Allocated</span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
            {formatCurrency(envelope.allocatedCents)}
          </span>
          <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>Spent</span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
            {formatCurrency(0)}
          </span>
          <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>Remaining</span>
          <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
            {formatCurrency(envelope.allocatedCents)}
          </span>
        </div>

        {/* Borrow button — visible when caution or overspent and not read-only */}
        {(state === 'caution' || state === 'overspent') && !isReadOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setIsBorrowOpen(true)}
          >
            Borrow
          </Button>
        )}

        {/* ⋯ action menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={isReadOnly}
              aria-label="Envelope actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleEditOpen}>
              Edit
            </DropdownMenuItem>
            {!envelope.isSavings && (
              <DropdownMenuItem
                onClick={() =>
                  useEnvelopeStore.getState().updateEnvelope({ id: envelope.id, isSavings: true })
                }
              >
                Set as Savings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setIsDeleteOpen(true)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

      {/* Borrow overlay */}
      <BorrowOverlay
        targetEnvelope={envelope}
        open={isBorrowOpen}
        onClose={() => setIsBorrowOpen(false)}
      />

      {/* Edit dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {envelope.name}</DialogTitle>
            <DialogDescription>
              Change the type and priority for this envelope.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="type-label" style={{ color: 'var(--color-text-muted)' }}>
                Type
              </label>
              <Select value={envelopeType} onValueChange={(v) => setEnvelopeType(v as EnvelopeType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Rolling">Rolling</SelectItem>
                  <SelectItem value="Bill">Bill</SelectItem>
                  <SelectItem value="Goal">Goal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="type-label" style={{ color: 'var(--color-text-muted)' }}>
                Priority
              </label>
              <Select value={editPriority} onValueChange={(v) => setEditPriority(v as EnvelopePriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Need">Need</SelectItem>
                  <SelectItem value="Should">Should</SelectItem>
                  <SelectItem value="Want">Want</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex flex-row gap-2 justify-end">
            <Button variant="ghost" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={isWriting}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
