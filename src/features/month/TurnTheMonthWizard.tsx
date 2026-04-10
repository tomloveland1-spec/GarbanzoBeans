import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMonthStore } from '@/stores/useMonthStore';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import TurnTheMonthStepper from './TurnTheMonthStepper';
import CloseoutSummary from './CloseoutSummary';
import BillDateConfirmation from './BillDateConfirmation';
import IncomeTimingConfirmation from './IncomeTimingConfirmation';
import EnvelopeFillFlow from './EnvelopeFillFlow';
import type { BillDateEntry, IncomeTimingEntry } from '@/lib/types';

const TOTAL_STEPS = 4;
const STEP_TITLES: Record<number, string> = {
  1: 'Last Month in Review',
  2: 'Confirm Bill Dates',
  3: 'Income Timing',
  4: 'Fill Envelopes',
};

function StepContent({
  step,
  monthId,
  year,
  month,
  onDatesChange,
  onEntriesChange,
  onAllocationsChange,
}: {
  step: number;
  monthId: number;
  year: number;
  month: number;
  onDatesChange?: (dates: BillDateEntry[]) => void;
  onEntriesChange?: (entries: IncomeTimingEntry[]) => void;
  onAllocationsChange?: (allocs: Array<{ id: number; allocatedCents: number }>) => void;
}) {
  if (step === 1) {
    return <CloseoutSummary monthId={monthId} year={year} month={month} />;
  }
  if (step === 2) {
    return (
      <BillDateConfirmation
        year={year}
        month={month}
        onDatesChange={onDatesChange ?? (() => {})}
      />
    );
  }
  if (step === 3) {
    return (
      <IncomeTimingConfirmation
        monthId={monthId}
        year={year}
        month={month}
        onEntriesChange={onEntriesChange ?? (() => {})}
      />
    );
  }
  if (step === 4) {
    return (
      <EnvelopeFillFlow
        monthId={monthId}
        onAllocationsChange={onAllocationsChange ?? (() => {})}
      />
    );
  }
  return null;
}

export default function TurnTheMonthWizard() {
  const navigate = useNavigate();
  const { monthStatus, advanceStep, closeMonth, confirmBillDates, confirmIncomeTiming, isWriting, error, currentMonth } = useMonthStore();

  // DB step derived from monthStatus (e.g., 'closing:step-2' → 2)
  const dbStep = monthStatus.startsWith('closing:step-')
    ? parseInt(monthStatus.replace('closing:step-', ''), 10)
    : 1;

  // viewStep: purely visual navigation — user can go back without regressing DB
  const [viewStep, setViewStep] = useState<number>(dbStep);

  // pendingBillDates: populated by BillDateConfirmation on mount and on edit
  const [pendingBillDates, setPendingBillDates] = useState<BillDateEntry[]>([]);

  // pendingIncomeEntries: populated by IncomeTimingConfirmation on mount and on edit
  const [pendingIncomeEntries, setPendingIncomeEntries] = useState<IncomeTimingEntry[]>([]);

  // pendingAllocations: populated by EnvelopeFillFlow on every change
  const [pendingAllocations, setPendingAllocations] = useState<Array<{ id: number; allocatedCents: number }>>([]);

  // When DB advances (advanceStep resolves), sync viewStep forward
  useEffect(() => {
    setViewStep((prev) => Math.max(prev, dbStep));
  }, [dbStep]);

  const handleContinue = async () => {
    if (isWriting) return;
    if (!monthStatus.startsWith('closing:step-')) return;
    if (viewStep < dbStep) {
      // Catching up to DB state — no Tauri command needed, just advance view
      setViewStep((v) => v + 1);
      return;
    }
    // At DB frontier — actually advance state machine
    try {
      if (dbStep === TOTAL_STEPS) {
        await closeMonth(pendingAllocations);
        // Refresh envelopes so Budget screen shows new allocated states
        await useEnvelopeStore.getState().loadEnvelopes();
        navigate({ to: '/' });
      } else if (dbStep === 2) {
        await confirmBillDates(pendingBillDates);
      } else if (dbStep === 3) {
        await confirmIncomeTiming(pendingIncomeEntries);
      } else {
        await advanceStep(dbStep);
      }
    } catch {
      // error is set in store by action
    }
  };

  const handleBack = () => {
    setViewStep((v) => Math.max(1, v - 1));
  };

  const isFinalStep = viewStep === TOTAL_STEPS;

  return (
    <TurnTheMonthStepper
      currentStep={viewStep}
      totalSteps={TOTAL_STEPS}
      stepTitle={STEP_TITLES[viewStep] ?? ''}
      onBack={viewStep > 1 ? handleBack : undefined}
      onContinue={handleContinue}
      isFinalStep={isFinalStep}
      isWriting={isWriting}
    >
      <StepContent
        step={viewStep}
        monthId={currentMonth?.id ?? 0}
        year={currentMonth?.year ?? 0}
        month={currentMonth?.month ?? 0}
        onDatesChange={setPendingBillDates}
        onEntriesChange={setPendingIncomeEntries}
        onAllocationsChange={setPendingAllocations}
      />
      {error && (
        <p
          className="type-label"
          style={{ color: 'var(--color-danger, #ff5555)', marginTop: '1rem', textAlign: 'center' }}
        >
          {error}
        </p>
      )}
    </TurnTheMonthStepper>
  );
}
