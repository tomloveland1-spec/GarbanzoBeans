import { useState } from 'react';
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
import { buildPayDates, parsePayDates, type PayFrequency } from '@/lib/pay-dates';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export default function SettingsPage() {
  const { settings, upsertSettings, isWriting, isReadOnly } = useSettingsStore();

  const { payDate1: initialPayDate1, payDate2: initialPayDate2 } = parsePayDates(
    settings?.payFrequency ?? null,
    settings?.payDates ?? null,
  );

  const [payFrequency, setPayFrequency] = useState<PayFrequency>(
    (settings?.payFrequency as PayFrequency) ?? 'monthly',
  );
  const [payDate1, setPayDate1] = useState(initialPayDate1);
  const [payDate2, setPayDate2] = useState(initialPayDate2);
  const [savingsTarget, setSavingsTarget] = useState(settings?.savingsTargetPct ?? 10);

  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<AppError | null>(null);

  // ── Validation ──────────────────────────────────────────────────────────────

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
      ? isNumericDayValid(payDate2) && parseInt(payDate2, 10) !== parseInt(payDate1, 10)
      : true;

  const savingsTargetValid =
    Number.isInteger(savingsTarget) && savingsTarget >= 0 && savingsTarget <= 100;

  const isSaveDisabled = !payDate1Valid || !payDate2Valid || !savingsTargetValid || isWriting || isReadOnly;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleFrequencyChange = (value: PayFrequency) => {
    setPayFrequency(value);
    setPayDate1('');
    setPayDate2('');
    setSaved(false);
  };

  const handleSave = async () => {
    setSaved(false);
    setSaveError(null);
    try {
      await upsertSettings({
        payFrequency,
        payDates: buildPayDates(payFrequency, payDate1, payDate2),
        savingsTargetPct: savingsTarget,
      });
      setSaved(true);
    } catch (err) {
      if (err !== null && typeof err === 'object' && 'message' in err) {
        setSaveError(err as AppError);
      } else {
        setSaveError({ message: String(err) } as AppError);
      }
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="p-6 flex flex-col gap-8 max-w-lg"
      style={{ color: 'var(--color-text-primary)' }}
    >
      <h1 className="type-h1" style={{ color: 'var(--color-text-primary)' }}>
        Settings
      </h1>

      {/* Pay schedule section */}
      <div
        className="rounded-lg p-6 flex flex-col gap-4"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <h2 className="type-h2" style={{ color: 'var(--color-text-primary)' }}>
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
                onChange={() => handleFrequencyChange(value)}
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
              htmlFor="pay-date-1"
              className="type-label"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Pay day
            </label>
            <Select value={payDate1} onValueChange={(v) => { setPayDate1(v); setSaved(false); }}>
              <SelectTrigger id="pay-date-1" data-testid="pay-date-1-input">
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
                htmlFor="pay-date-1-tm"
                className="type-label"
                style={{ color: 'var(--color-text-muted)' }}
              >
                First pay date
              </label>
              <Input
                id="pay-date-1-tm"
                type="number"
                min="1"
                max="28"
                value={payDate1}
                onChange={(e) => { setPayDate1(e.target.value); setSaved(false); }}
                placeholder="e.g. 1"
                data-testid="pay-date-1-input"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label
                htmlFor="pay-date-2-tm"
                className="type-label"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Second pay date
              </label>
              <Input
                id="pay-date-2-tm"
                type="number"
                min="1"
                max="28"
                value={payDate2}
                onChange={(e) => { setPayDate2(e.target.value); setSaved(false); }}
                placeholder="e.g. 15"
                data-testid="pay-date-2-input"
              />
            </div>
          </div>
        )}

        {payFrequency === 'monthly' && (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="pay-date-1"
              className="type-label"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Pay date (day of month)
            </label>
            <Input
              id="pay-date-1"
              type="number"
              min="1"
              max="28"
              value={payDate1}
              onChange={(e) => { setPayDate1(e.target.value); setSaved(false); }}
              placeholder="e.g. 15"
              data-testid="pay-date-1-input"
            />
          </div>
        )}
      </div>

      {/* Savings section */}
      <div
        className="rounded-lg p-6 flex flex-col gap-4"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <h2 className="type-h2" style={{ color: 'var(--color-text-primary)' }}>
          Savings
        </h2>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="savings-target"
            className="type-label"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Savings target (% of income)
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="savings-target"
              type="number"
              min="0"
              max="100"
              step="1"
              value={savingsTarget}
              onChange={(e) => { setSavingsTarget(Number(e.target.value)); setSaved(false); }}
              className="w-24"
              data-testid="savings-target-input"
            />
            <span className="type-body" style={{ color: 'var(--color-text-muted)' }}>
              % of income
            </span>
          </div>
        </div>
      </div>

      {/* Footer: Save button + inline feedback */}
      <div className="flex flex-col gap-2">
        <Button
          onClick={handleSave}
          disabled={isSaveDisabled}
          data-testid="save-settings-button"
        >
          {isWriting ? 'Saving…' : 'Save'}
        </Button>

        {isReadOnly && (
          <p className="type-label" style={{ color: 'var(--color-amber)' }}>
            Read-only: another instance is open. Close it to make changes.
          </p>
        )}
        {saved && !saveError && (
          <p className="type-label" style={{ color: 'var(--color-envelope-green)' }}>
            Settings saved.
          </p>
        )}
        {saveError && (
          <p className="type-label" style={{ color: 'var(--color-red, #ff5555)' }}>
            {saveError.message}
          </p>
        )}
      </div>
    </div>
  );
}
