import { useEffect, useState } from 'react';
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
import { pastTwelveMonths, formatMonthLabel } from '@/lib/date-utils';

// ── Types ────────────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2 | 3; // 0 = welcome, 1–3 = wizard steps

const ONBOARDING_STORAGE_KEY = 'onboarding-state';

// ── Illustrations ─────────────────────────────────────────────────────────────

function WelcomeIllustration() {
  return (
    <div data-testid="step-illustration" className="flex flex-col items-center">
      <svg viewBox="0 0 80 80" width="80" height="80" fill="none" aria-hidden="true">
        <circle cx="40" cy="40" r="36" stroke="var(--color-sidebar-active)" strokeWidth="2" opacity="0.25" />
        <circle cx="40" cy="40" r="24" fill="rgba(192,245,0,0.08)" />
        <text
          x="40" y="47"
          textAnchor="middle"
          fill="var(--color-sidebar-active)"
          fontSize="18"
          fontWeight="700"
          fontFamily="Roboto, sans-serif"
        >
          GB
        </text>
      </svg>
    </div>
  );
}

function BudgetIllustration() {
  return (
    <div data-testid="step-illustration" className="flex flex-col items-center gap-2 text-center">
      <svg viewBox="0 0 80 56" width="80" height="56" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="78" height="54" rx="4"
          stroke="var(--color-sidebar-active)" strokeWidth="2"
          fill="rgba(192,245,0,0.06)" />
        <path d="M1 8 L40 30 L79 8"
          stroke="var(--color-sidebar-active)" strokeWidth="2" />
      </svg>
      <p className="type-label" style={{ color: 'var(--color-text-muted)', maxWidth: '22rem' }}>
        Your budget is personal — give it a name and pick the month it starts.
      </p>
    </div>
  );
}

function DataFolderIllustration() {
  return (
    <div data-testid="step-illustration" className="flex flex-col items-center gap-2 text-center">
      <svg viewBox="0 0 80 64" width="80" height="64" fill="none" aria-hidden="true">
        {/* Folder body */}
        <path
          d="M4 20 L4 56 Q4 60 8 60 L72 60 Q76 60 76 56 L76 24 Q76 20 72 20 L44 20 L36 12 L8 12 Q4 12 4 16 Z"
          stroke="var(--color-sidebar-active)" strokeWidth="2"
          fill="rgba(192,245,0,0.06)"
        />
        {/* Lock shackle */}
        <path d="M34 36 L34 31 Q34 26 40 26 Q46 26 46 31 L46 36"
          stroke="var(--color-sidebar-active)" strokeWidth="1.5" fill="none" />
        {/* Lock body */}
        <rect x="30" y="35" width="20" height="14" rx="2"
          stroke="var(--color-sidebar-active)" strokeWidth="1.5"
          fill="rgba(192,245,0,0.1)" />
      </svg>
      <p className="type-label" style={{ color: 'var(--color-text-muted)', maxWidth: '22rem' }}>
        Your data lives on your device — no cloud, no subscription, no sharing.
      </p>
    </div>
  );
}

function SavingsIllustration() {
  return (
    <div data-testid="step-illustration" className="flex flex-col items-center gap-2 text-center">
      <svg viewBox="0 0 100 58" width="100" height="58" fill="none" aria-hidden="true">
        {/* Background track */}
        <path d="M 10 55 A 40 40 0 0 1 90 55"
          stroke="rgba(192,245,0,0.15)" strokeWidth="8" strokeLinecap="round" />
        {/* Filled arc — ~65% */}
        <path d="M 10 55 A 40 40 0 0 1 74 23"
          stroke="var(--color-sidebar-active)" strokeWidth="8" strokeLinecap="round" />
        {/* Progress dot */}
        <circle cx="74" cy="23" r="4" fill="var(--color-sidebar-active)" />
      </svg>
      <p className="type-label" style={{ color: 'var(--color-text-muted)', maxWidth: '22rem' }}>
        Set a savings goal — GarbanzoBeans tracks your runway month by month.
      </p>
    </div>
  );
}

// ── Step Shell ────────────────────────────────────────────────────────────────

interface StepShellProps {
  step: 1 | 2 | 3;
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
    <div className="flex flex-col h-full items-center justify-center px-8">
      <div className="w-full max-w-md flex flex-col gap-4">

        {/* Step counter — right-aligned within centered block */}
        <div className="flex justify-end">
          <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>
            Step {step} of 3
          </span>
        </div>

        {/* Form content */}
        {children}

        {/* Nav — part of the centered block, not pinned at viewport bottom */}
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onNext} disabled={nextDisabled || isLoading}>
            {isLoading ? 'Saving…' : nextLabel}
          </Button>
        </div>
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
      <BudgetIllustration />
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
              <SelectContent side="bottom">
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatMonthLabel(m)}
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
      <DataFolderIllustration />
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

// ── Step 3: Savings Target ────────────────────────────────────────────────────

interface Step3Props {
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
}: Step3Props) {
  const isInvalid = savingsTarget < 0 || savingsTarget > 100 || !Number.isInteger(savingsTarget);

  return (
    <StepShell
      step={3}
      onBack={onBack}
      onNext={onConfirm}
      nextLabel="Confirm"
      nextDisabled={isInvalid}
      isLoading={isLoading}
    >
      <SavingsIllustration />
      <div className="w-full flex flex-col gap-4">
        <h2
          className="type-h2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Set your savings goal
        </h2>
        <p
          className="type-body"
          style={{ color: 'var(--color-text-muted)' }}
        >
          We'll track your progress each month — this is a goal, not a hard limit.
        </p>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="savings-target"
            className="type-label"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Target savings percentage
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
  const [savingsTarget, setSavingsTarget] = useState(10);

  // Restore from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.step > 0 && parsed.step <= 3) {
          setStep(parsed.step);
          setBudgetName(parsed.budgetName ?? '');
          setStartMonth(parsed.startMonth ?? '');
          setDataFolderPath(parsed.dataFolderPath ?? '');
          setSavingsTarget(parsed.savingsTarget ?? 10);
        }
      } catch {
        // Ignore parse errors — start fresh
      }
    }
  }, []);

  // Persist state to sessionStorage on any change
  useEffect(() => {
    sessionStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ step, budgetName, startMonth, dataFolderPath, savingsTarget }),
    );
  }, [step, budgetName, startMonth, dataFolderPath, savingsTarget]);

  const handleFinalConfirm = async () => {
    setError(null);
    try {
      await upsertSettings({
        budgetName,
        startMonth,
        savingsTargetPct: savingsTarget,
        dataFolderPath,
        onboardingComplete: true,
      });
      await invoke('init_data_folder', { dataFolderPath });
      sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
      await navigate({ to: '/' });
    } catch (err) {
      setError(err as AppError);
    }
  };

  // ── Welcome screen ──
  if (step === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-8 gap-8 max-w-md mx-auto w-full">
        <WelcomeIllustration />
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
  return (
    <SavingsTargetStep
      savingsTarget={savingsTarget}
      onSavingsTargetChange={setSavingsTarget}
      onBack={() => setStep(2)}
      onConfirm={handleFinalConfirm}
      isLoading={isWriting}
      error={error}
    />
  );
}
