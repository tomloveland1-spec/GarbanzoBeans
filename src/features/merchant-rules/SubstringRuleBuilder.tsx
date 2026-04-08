import { useState, useEffect, useRef } from 'react';

interface SubstringRuleBuilderProps {
  payee: string;
  envelopeName: string | null;
  selectedSubstring: string;
  onSubstringChange: (s: string) => void;
}

export default function SubstringRuleBuilder({
  payee,
  envelopeName,
  selectedSubstring,
  onSubstringChange,
}: SubstringRuleBuilderProps) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Ref mirrors drag state so the global mouseup handler always reads current
  // values without needing to re-register on every state change.
  const dragStateRef = useRef({ isSelecting: false, dragStart: null as number | null, dragEnd: null as number | null });

  // Derive committed selection range from selectedSubstring by scanning payee
  // We also track drag in-progress range for live highlight during drag
  const activeStart = dragStart !== null && dragEnd !== null ? Math.min(dragStart, dragEnd) : null;
  const activeEnd = dragStart !== null && dragEnd !== null ? Math.max(dragStart, dragEnd) : null;

  // When not dragging, derive highlight from committed selectedSubstring
  function isHighlighted(index: number): boolean {
    if (isSelecting && activeStart !== null && activeEnd !== null) {
      return index >= activeStart && index <= activeEnd;
    }
    if (!isSelecting && selectedSubstring) {
      const start = payee.indexOf(selectedSubstring);
      if (start === -1) return false;
      return index >= start && index <= start + selectedSubstring.length - 1;
    }
    return false;
  }

  // Global mouseup to end drag even if mouse leaves component.
  // Reads from dragStateRef so the handler never captures stale state,
  // and the effect only re-registers when payee or the callback changes.
  useEffect(() => {
    function handleGlobalMouseUp() {
      const { isSelecting: sel, dragStart: ds, dragEnd: de } = dragStateRef.current;
      if (sel && ds !== null && de !== null) {
        const lo = Math.min(ds, de);
        const hi = Math.max(ds, de);
        onSubstringChange(payee.slice(lo, hi + 1));
      }
      dragStateRef.current.isSelecting = false;
      setIsSelecting(false);
    }
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [payee, onSubstringChange]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onSubstringChange(payee);
    }
  }

  return (
    <div>
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          userSelect: 'none',
          cursor: 'text',
          display: 'inline-block',
          color: 'var(--color-text-primary)',
        }}
        data-testid="payee-spans-container"
      >
        {payee.split('').map((char, index) => {
          const highlighted = isHighlighted(index);
          return (
            <span
              key={index}
              data-index={index}
              onMouseDown={(e) => {
                e.preventDefault();
                dragStateRef.current = { isSelecting: true, dragStart: index, dragEnd: index };
                setDragStart(index);
                setDragEnd(index);
                setIsSelecting(true);
              }}
              onMouseMove={() => {
                if (isSelecting) {
                  dragStateRef.current.dragEnd = index;
                  setDragEnd(index);
                }
              }}
              style={
                highlighted
                  ? {
                      background: 'var(--color-lime)',
                      color: 'var(--color-neutral-black)',
                    }
                  : undefined
              }
            >
              {char}
            </span>
          );
        })}
      </div>
      {selectedSubstring && envelopeName !== null && (
        <div
          className="type-caption"
          style={{ color: 'var(--color-text-secondary)' }}
          data-testid="rule-preview"
        >
          Match: {selectedSubstring} → {envelopeName}
        </div>
      )}
    </div>
  );
}
