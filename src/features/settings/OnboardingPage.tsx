import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { AppError } from '@/lib/types';
import { buildPayDates, type PayFrequency } from '@/lib/pay-dates';

// ── Types ────────────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2 | 3 | 4; // 0 = welcome, 1–4 = wizard steps

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate the past 12 months as YYYY-MM strings, newest first. */
function pastTwelveMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear().toString();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${yyyy}-${mm}`);
  }
  return months;
}

// ── Step Shell ────────────────────────────────────────────────────────────────

interface StepShellProps {
  step: 1 | 2 | 3 | 4;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
}

function StepShell({
  step,
  onBack,
  onNext,
  nextLabel = 'Next',
  nextDisabled = false,
  isLoading = false,
  children,
}: StepShellProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Step counter */}
      <div className="flex justify-end px-8 pt-6">
        <span
          className="type-label"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Step {step} of 4
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6 max-w-md mx-auto w-full">
        {children}
      </div>

      {/* Navigation */}
      <div className="flex justify-between px-8 pb-8">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={nextDisabled || isLoading}>
          {isLoading ? 'Saving…' : nextLabel}
        </Button>
      </div>
    </div>
  );
}

// ── Step 1: Budget Name + Start Month ─────────────────────────────────────────

interface Step1Props {
  budgetName: string;
  onBudgetNameChange: (v: string) => void;
  startMonth: string;
  onStartMonthChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}

function BudgetNameStep({
  budgetName,
  onBudgetNameChange,
  startMonth,
  onStartMonthChange,
  onBack,
  onNext,
}: Step1Props) {
  const months = pastTwelveMonths();

  return (
    <StepShell
      step={1}
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!budgetName.trim() || !startMonth}
    >
      <div className="w-full flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2
            className="type-h2"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Name your budget
          </h2>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="budget-name"
              className="type-label"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Budget name
            </label>
            <Input
              id="budget-name"
              data-testid="budget-name-input"
              value={budgetName}
              onChange={(e) => onBudgetNameChange(e.target.value)}
              placeholder="e.g. Tom's Budget"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="start-month"
              className="type-label"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Budget start month
            </label>
            <Select value={startMonth} onValueChange={onStartMonthChange}>
              <SelectTrigger id="start-month" data-testid="start-month-select">
                <SelectValue placeholder="Select month…" />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </StepShell>
  );
}

// ── Step 2: Data Folder ───────────────────────────────────────────────────────

interface Step2Props {
  dataFolderPath: string;
  onDataFolderPathChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}

function DataFolderStep({
  dataFolderPath,
  onDataFolderPathChange,
  onBack,
  onNext,
}: Step2Props) {
  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select GarbanzoBeans data folder',
    });
    if (selected && typeof selected === 'string') {
      onDataFolderPathChange(selected);
    }
  };

  return (
    <StepShell
      step={2}
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!dataFolderPath}
    >
      <div className="w-full flex flex-col gap-4">
        <h2
          className="type-h2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Choose a data folder
        </h2>
        <p
          className="type-body"
          style={{ color: 'var(--color-text-muted)' }}
        >
          GarbanzoBeans stores your budget data locally. Pick a folder you control — ideally inside a location you back up.
        </p>

        <Button variant="outline" onClick={handleBrowse} data-testid="browse-button">
          Browse…
        </Button>

        {dataFolderPath && (
          <div
            className="rounded-md px-3 py-2 type-label break-all"
            style={{
              backgroundColor: 'rgba(192, 245, 0, 0.06)',
              color: 'var(--color-text-primary)',
              border: '1px solid rgba(192, 245, 0, 0.2)',
            }}
            data-testid="selected-folder-path"
          >
            {dataFolderPath}
          </div>
        )}
      </div>
    </StepShell>
  );
}

// ── Step 3: Pay Frequency ─────────────────────────────────────────────────────

interface Step3Props {
  payFrequency: PayFrequency;
  onPayFrequencyChange: (v: PayFrequency) => void;
  payDate1: string;
  onPayDate1Change: (v: string) => void;
  payDate2: string;
  onPayDate2Change: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}

function PayFrequencyStep({
  payFrequency,
  onPayFrequencyChange,
  payDate1,
  onPayDate1Change,
  payDate2,
  onPayDate2Change,
  onBack,
  onNext,
}: Step3Props) {
  const isNumericDayValid = (v: string) => {
    const n = parseInt(v, 10);
    return v !== '' && n >= 1 && n <= 28;
  };

  const payDate1Valid =
    payFrequency === 'weekly' || payFrequency === 'bi-weekly'
      ? !!payDate1
      : isNumericDayValid(payDate1);

  const payDate2Valid =
    payFrequency === 'twice-monthly'
      ? isNumericDayValid(payDate2) && payDate2 !== payDate1
      : true;

  const isNextDisabled = !payDate1Valid || !payDate2Valid;

  return (
    <StepShell
      step={3}
      onBack={onBack}
      onNext={onNext}
      nextDisabled={isNextDisabled}
    >
      <div className="w-full flex flex-col gap-6">
        <h2
          className="type-h2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Pay schedule
        </h2>

        {/* Frequency radio group */}
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Pay frequency">
          {(
            [
              ['weekly', 'Weekly'],
              ['bi-weekly', 'Bi-weekly'],
              ['twice-monthly', 'Twice a month'],
              ['monthly', 'Monthly'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex items-center gap-3 cursor-pointer"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <input
                type="radio"
                name="pay-frequency"
                value={value}
                checked={payFrequency === value}
                onChange={() => {
                  onPayFrequencyChange(value);
                  onPayDate1Change('');
                  onPayDate2Change('');
                }}
                data-testid={`pay-frequency-${value}`}
              />
              <span className="type-body">{label}</span>
            </label>
          ))}
        </div>

        {/* Conditional pay date inputs */}
        {(payFrequency === 'weekly' || payFrequency === 'bi-weekly') && (
          <div className="flex flex-col gap-1.5">
            <label
              className="type-label"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Pay day
            </label>
            <Select value={payDate1} onValueChange={onPayDate1Change}>
              <SelectTrigger data-testid="pay-date-1-select">
                <SelectValue placeholder="Select day…" />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map((day) => (
                  <SelectItem key={day} value={day}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {payFrequency === 'twice-monthly' && (
          <div className="flex gap-4">
            <div className="flex flex-col gap-1.5 flex-1">
              <label
                className="type-label"
                style={{ color: 'var(--color-text-muted)' }}
              >
                First pay date
              </label>
              <Input
                type="number"
                min="1"
                max="28"
                value={payDate1}
                onChange={(e) => onPayDate1Change(e.target.value)}
                placeholder="e.g. 1"
                data-testid="pay-date-1-input"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label
                className="type-label"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Second pay date
              </label>
              <Input
                type="number"
                min="1"
                max="28"
                value={payDate2}
                onChange={(e) => onPayDate2Change(e.target.value)}
                placeholder="e.g. 15"
                data-testid="pay-date-2-input"
              />
            </div>
          </div>
        )}

        {payFrequency === 'monthly' && (
          <div className="flex flex-col gap-1.5">
            <label
              className="type-label"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Pay date (day of month)
            </label>
            <Input
              type="number"
              min="1"
              max="28"
              value={payDate1}
              onChange={(e) => onPayDate1Change(e.target.value)}
              placeholder="e.g. 15"
              data-testid="pay-date-1-input"
            />
          </div>
        )}
      </div>
    </StepShell>
  );
}

// ── Step 4: Savings Target ────────────────────────────────────────────────────

interface Step4Props {
  savingsTarget: number;
  onSavingsTargetChange: (v: number) => void;
  onBack: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  error: AppError | null;
}

function SavingsTargetStep({
  savingsTarget,
  onSavingsTargetChange,
  onBack,
  onConfirm,
  isLoading,
  error,
}: Step4Props) {
  const isInvalid = savingsTarget < 0 || savingsTarget > 100 || !Number.isInteger(savingsTarget);

  return (
    <StepShell
      step={4}
      onBack={onBack}
      onNext={onConfirm}
      nextLabel="Confirm"
      nextDisabled={isInvalid}
      isLoading={isLoading}
    >
      <div className="w-full flex flex-col gap-4">
        <h2
          className="type-h2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Savings target
        </h2>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="savings-target"
            className="type-label"
            style={{ color: 'var(--color-text-muted)' }}
          >
            What percentage of income do you want to save?
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="savings-target"
              type="number"
              min="0"
              max="100"
              step="1"
              value={savingsTarget}
              onChange={(e) => onSavingsTargetChange(Number(e.target.value))}
              className="w-24"
              data-testid="savings-target-input"
            />
            <span
              className="type-body"
              style={{ color: 'var(--color-text-muted)' }}
            >
              % of income
            </span>
          </div>
        </div>

        {error && (
          <p
            className="type-label"
            style={{ color: 'var(--color-red, #ff5555)' }}
            data-testid="onboarding-error"
          >
            {error.message}
          </p>
        )}
      </div>
    </StepShell>
  );
}

// ── Onboarding Page ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { upsertSettings, isWriting } = useSettingsStore();

  const [step, setStep] = useState<Step>(0);
  const [error, setError] = useState<AppError | null>(null);

  // Step 1 state
  const [budgetName, setBudgetName] = useState('');
  const [startMonth, setStartMonth] = useState('');

  // Step 2 state
  const [dataFolderPath, setDataFolderPath] = useState('');

  // Step 3 state
  const [payFrequency, setPayFrequency] = useState<PayFrequency>('monthly');
  const [payDate1, setPayDate1] = useState('');
  const [payDate2, setPayDate2] = useState('');

  // Step 4 state
  const [savingsTarget, setSavingsTarget] = useState(10);

  const handleFinalConfirm = async () => {
    setError(null);
    try {
      await upsertSettings({
        budgetName,
        startMonth,
        payFrequency,
        payDates: buildPayDates(payFrequency, payDate1, payDate2),
        savingsTargetPct: savingsTarget,
        dataFolderPath,
        onboardingComplete: true,
      });
      await invoke('init_data_folder', { dataFolderPath });
      await navigate({ to: '/' });
    } catch (err) {
      setError(err as AppError);
    }
  };

  // ── Welcome screen ──
  if (step === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-8 gap-8 max-w-md mx-auto w-full">
        <div className="flex flex-col gap-4 text-center">
          <h1
            className="type-h1 font-bold"
            style={{ color: 'var(--color-sidebar-active)' }}
          >
            GarbanzoBeans
          </h1>
          <p
            className="type-body"
            style={{ color: 'var(--color-text-muted)' }}
            data-testid="welcome-description"
          >
            A personal budget app that keeps your envelopes, ledger, and savings runway in one place.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => setStep(1)}
          data-testid="get-started-button"
        >
          Get Started
        </Button>
      </div>
    );
  }

  // ── Step 1 ──
  if (step === 1) {
    return (
      <BudgetNameStep
        budgetName={budgetName}
        onBudgetNameChange={setBudgetName}
        startMonth={startMonth}
        onStartMonthChange={setStartMonth}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
      />
    );
  }

  // ── Step 2 ──
  if (step === 2) {
    return (
      <DataFolderStep
        dataFolderPath={dataFolderPath}
        onDataFolderPathChange={setDataFolderPath}
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
      />
    );
  }

  // ── Step 3 ──
  if (step === 3) {
    return (
      <PayFrequencyStep
        payFrequency={payFrequency}
        onPayFrequencyChange={setPayFrequency}
        payDate1={payDate1}
        onPayDate1Change={setPayDate1}
        payDate2={payDate2}
        onPayDate2Change={setPayDate2}
        onBack={() => setStep(2)}
        onNext={() => setStep(4)}
      />
    );
  }

  // ── Step 4 ──
  return (
    <SavingsTargetStep
      savingsTarget={savingsTarget}
      onSavingsTargetChange={setSavingsTarget}
      onBack={() => setStep(3)}
      onConfirm={handleFinalConfirm}
      isLoading={isWriting}
      error={error}
    />
  );
}
