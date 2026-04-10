import { useEffect } from 'react';

interface TurnTheMonthStepperProps {
  currentStep: number;
  totalSteps: number;
  stepTitle: string;
  onBack?: () => void;
  onContinue: () => void;
  isFinalStep: boolean;
  isWriting: boolean;
  children: React.ReactNode;
}

export default function TurnTheMonthStepper({
  currentStep,
  totalSteps,
  stepTitle,
  onBack,
  onContinue,
  isFinalStep,
  isWriting,
  children,
}: TurnTheMonthStepperProps) {
  // Block Escape key — must use explicit Back/Continue (UX-DR9)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'var(--color-bg-app)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: '560px' }}>
        {/* Step counter */}
        <p
          className="type-label"
          style={{ color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}
        >
          Step {currentStep} of {totalSteps}
        </p>

        {/* Step title */}
        <h2
          className="type-heading-sm"
          style={{ color: 'var(--color-text-primary)', marginBottom: '2rem' }}
        >
          {stepTitle}
        </h2>

        {/* Content slot */}
        <div style={{ overflowY: 'auto', marginBottom: '2rem' }}>
          {children}
        </div>

        {/* Navigation buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          {onBack !== undefined && (
            <button
              onClick={onBack}
              disabled={isWriting}
              style={{
                border: '1px solid var(--color-accent)',
                color: 'var(--color-accent)',
                background: 'transparent',
                padding: '0.5rem 1.25rem',
                borderRadius: '6px',
                cursor: isWriting ? 'not-allowed' : 'pointer',
                opacity: isWriting ? 0.5 : 1,
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={onContinue}
            disabled={isWriting}
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-bg-app)',
              border: 'none',
              padding: '0.5rem 1.25rem',
              borderRadius: '6px',
              cursor: isWriting ? 'not-allowed' : 'pointer',
              opacity: isWriting ? 0.5 : 1,
              fontWeight: 600,
            }}
          >
            {isFinalStep ? 'Close Month' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
