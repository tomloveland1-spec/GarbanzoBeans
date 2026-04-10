# Story 6.5: Income Timing Confirmation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want to confirm my expected pay dates for the new month,
So that my allocation flow knows when income arrives and can reflect that in envelope funding status.

## Acceptance Criteria

1. **AC1: Income timing step renders pay dates with expected amounts**
   - Given Turn the Month is at step 3 (monthStatus = `closing:step-3`)
   - When the income timing step renders
   - Then Tom's pay dates for the new month are shown, derived from settings `payFrequency` and `payDates`; the expected income amount (sum of income_entries distributed across pay dates) is displayed alongside each date; if no pay frequency is configured, an empty list is shown with a "no income configured" message

2. **AC2: Confirming without changes advances to step 4 atomically**
   - Given Tom confirms the income timing without changes
   - When confirmation occurs via `confirm_income_timing` command
   - Then the default pay dates and amounts are recorded in `month_income_timing` for the current month_id; `months.status` advances to `closing:step-4` in a single atomic transaction; the stepper moves to step 4

3. **AC3: Adjusting an income date or amount stores the new value for the new month only**
   - Given Tom edits an income date or amount inline and confirms
   - When he confirms
   - Then the adjusted values are stored in `month_income_timing` for this month_id only; the `settings` table is NOT modified; the step advances to `closing:step-4` atomically

4. **AC4: Re-loading step 3 shows previously confirmed or edited values**
   - Given the user navigates back to step 3 after confirming
   - When the income timing component re-mounts
   - Then `get_income_timing_suggestions` returns the previously stored `month_income_timing` records (if any), not the settings defaults; edits persist correctly across back/forward navigation

## Tasks / Subtasks

- [x] Task 1: Create migration `011_month_income_timing.sql` (AC: 1, 2, 3, 4)
  - [x] 1.1: Create `src-tauri/migrations/011_month_income_timing.sql`:
    ```sql
    -- Migration 011: Month income timing — pay dates and expected amounts for a closing month
    -- One row per pay date per closing month (month_id references the CURRENT closing month)
    -- pay_date: ISO 'YYYY-MM-DD' in the NEW month (the one being opened after close)
    -- amount_cents: expected income for this pay date (may be 0 if not configured)
    -- UNIQUE(month_id, pay_date) prevents duplicate pay date rows per month
    CREATE TABLE IF NOT EXISTS month_income_timing (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      month_id     INTEGER NOT NULL,
      pay_date     TEXT    NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      label        TEXT,
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(month_id, pay_date)
    );
    ```
  - [x] 1.2: Verify `src-tauri/src/migrations.rs` will auto-pick up the new file (it reads all `*.sql` files from the migrations directory in numeric order — no manual registration needed).

- [x] Task 2: Add Rust structs and commands to `src-tauri/src/commands/mod.rs` (AC: 1, 2, 3, 4)
  - [x] 2.1: After the `BillDateEntry`/`ConfirmBillDatesInput` structs (approximately after line 2900), add the three new income timing structs:
    ```rust
    #[derive(Debug, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct IncomeTimingSuggestion {
        /// ISO 'YYYY-MM-DD' date in the NEW (upcoming) month
        pub pay_date: String,
        /// Expected income amount in cents for this pay date
        pub amount_cents: i64,
        /// Optional label (e.g., "Paycheck 1", "Paycheck 2")
        pub label: Option<String>,
    }

    #[derive(Debug, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct IncomeTimingEntry {
        pub pay_date: String,
        pub amount_cents: i64,
        pub label: Option<String>,
    }

    #[derive(Debug, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ConfirmIncomeTimingInput {
        pub month_id: i64,
        /// Full list of pay dates for the new month (may be empty if no income configured)
        pub entries: Vec<IncomeTimingEntry>,
    }
    ```

  - [x] 2.2: Add helper function `days_in_month` immediately after the `ConfirmIncomeTimingInput` struct definition (keep it local to the commands module, not public):
    ```rust
    fn days_in_month(year: i32, month: i32) -> i32 {
        match month {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            2 => {
                // Leap year: divisible by 4, except centuries unless divisible by 400
                if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) { 29 } else { 28 }
            }
            _ => 31,
        }
    }
    ```

  - [x] 2.3: After `confirm_bill_dates` Tauri wrapper (after line ~3421, immediately before `#[cfg(test)]`), add `get_income_timing_suggestions_inner`:
    ```rust
    fn get_income_timing_suggestions_inner(
        conn: &rusqlite::Connection,
        month_id: i64,
    ) -> Result<Vec<IncomeTimingSuggestion>, AppError> {
        // If timing already confirmed for this month, return stored values
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM month_income_timing WHERE month_id = ?1",
            rusqlite::params![month_id],
            |row| row.get(0),
        )?;
        if count > 0 {
            let mut stmt = conn.prepare(
                "SELECT pay_date, amount_cents, label FROM month_income_timing \
                 WHERE month_id = ?1 ORDER BY pay_date ASC",
            )?;
            let rows = stmt.query_map(rusqlite::params![month_id], |row| {
                Ok(IncomeTimingSuggestion {
                    pay_date: row.get(0)?,
                    amount_cents: row.get(1)?,
                    label: row.get(2)?,
                })
            })?;
            let mut result = Vec::new();
            for row in rows { result.push(row?); }
            return Ok(result);
        }

        // No stored timing yet — derive suggestions from settings + income_entries
        // Get current month year/month to compute NEW month
        let (curr_year, curr_month): (i32, i32) = conn.query_row(
            "SELECT year, month FROM months WHERE id = ?1",
            rusqlite::params![month_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError {
                code: "MONTH_NOT_FOUND".to_string(),
                message: format!("No month found with id {}", month_id),
            },
            other => AppError::from(other),
        })?;

        let (new_year, new_month) = if curr_month == 12 {
            (curr_year + 1, 1i32)
        } else {
            (curr_year, curr_month + 1)
        };

        // Get settings pay_frequency and pay_dates
        let settings_row: Option<(Option<String>, Option<String>)> = conn.query_row(
            "SELECT pay_frequency, pay_dates FROM settings WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).optional()?;

        let (pay_frequency, pay_dates_json) = match settings_row {
            Some((freq, dates)) => (freq, dates),
            None => (None, None),
        };

        // Parse pay_dates JSON — expected format: ["1", "15"] (day-of-month numbers)
        let pay_days: Vec<i32> = match pay_dates_json {
            Some(ref json) => {
                serde_json::from_str::<Vec<String>>(json)
                    .unwrap_or_default()
                    .iter()
                    .filter_map(|s| s.parse::<i32>().ok())
                    .collect()
            }
            None => vec![],
        };

        if pay_days.is_empty() || pay_frequency.is_none() {
            return Ok(vec![]);
        }

        // Get total income from income_entries
        let total_income: i64 = conn.query_row(
            "SELECT COALESCE(SUM(amount_cents), 0) FROM income_entries",
            [],
            |row| row.get(0),
        )?;

        let max_day = days_in_month(new_year, new_month);
        let n = pay_days.len() as i64;
        let per_pay = if n > 0 { total_income / n } else { 0 };
        let remainder = if n > 0 { total_income % n } else { 0 };

        let mut suggestions = Vec::new();
        for (i, &day) in pay_days.iter().enumerate() {
            let clamped = day.min(max_day).max(1);
            let pay_date = format!(
                "{:04}-{:02}-{:02}",
                new_year, new_month, clamped
            );
            let label = if pay_days.len() > 1 {
                Some(format!("Paycheck {}", i + 1))
            } else {
                None
            };
            // Last pay date gets any remainder cents
            let amount = if i == pay_days.len() - 1 {
                per_pay + remainder
            } else {
                per_pay
            };
            suggestions.push(IncomeTimingSuggestion { pay_date, amount_cents: amount, label });
        }
        Ok(suggestions)
    }

    #[tauri::command]
    pub fn get_income_timing_suggestions(
        state: State<DbState>,
        month_id: i64,
    ) -> Result<Vec<IncomeTimingSuggestion>, AppError> {
        let conn = state.0.lock().map_err(|_| AppError {
            code: "DB_LOCK_POISON".to_string(),
            message: "Database mutex was poisoned.".to_string(),
        })?;
        get_income_timing_suggestions_inner(&conn, month_id)
    }
    ```

  - [x] 2.4: Immediately after `get_income_timing_suggestions` Tauri wrapper (still before `#[cfg(test)]`), add `confirm_income_timing_inner` and its Tauri wrapper:
    ```rust
    fn confirm_income_timing_inner(
        conn: &rusqlite::Connection,
        input: &ConfirmIncomeTimingInput,
    ) -> Result<Month, AppError> {
        let expected_status = "closing:step-3";
        let next_status = "closing:step-4";

        let tx = conn.unchecked_transaction()?;

        // Guard: verify month is at closing:step-3
        let current: String = tx.query_row(
            "SELECT status FROM months WHERE id = ?1",
            rusqlite::params![input.month_id],
            |row| row.get(0),
        ).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError {
                code: "MONTH_NOT_FOUND".to_string(),
                message: format!("No month found with id {}", input.month_id),
            },
            other => AppError::from(other),
        })?;

        if current != expected_status {
            return Err(AppError {
                code: "INVALID_STEP_TRANSITION".to_string(),
                message: format!(
                    "Expected status '{}' but found '{}'. Step may have already advanced.",
                    expected_status, current
                ),
            });
        }

        // Replace all existing timing records for this month
        tx.execute(
            "DELETE FROM month_income_timing WHERE month_id = ?1",
            rusqlite::params![input.month_id],
        )?;

        for entry in &input.entries {
            tx.execute(
                "INSERT INTO month_income_timing (month_id, pay_date, amount_cents, label, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, datetime('now'))",
                rusqlite::params![
                    input.month_id,
                    entry.pay_date,
                    entry.amount_cents,
                    entry.label,
                ],
            )?;
        }

        // Advance step 3 → 4 atomically
        tx.execute(
            "UPDATE months SET status = ?1 WHERE id = ?2",
            rusqlite::params![next_status, input.month_id],
        )?;

        let m = tx.query_row(
            "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE id = ?1",
            rusqlite::params![input.month_id],
            row_to_month,
        )?;
        tx.commit()?;
        Ok(m)
    }

    #[tauri::command]
    pub fn confirm_income_timing(
        state: State<DbState>,
        input: ConfirmIncomeTimingInput,
    ) -> Result<Month, AppError> {
        let conn = state.0.lock().map_err(|_| AppError {
            code: "DB_LOCK_POISON".to_string(),
            message: "Database mutex was poisoned.".to_string(),
        })?;
        confirm_income_timing_inner(&conn, &input)
    }
    ```

  - [x] 2.5: Add Rust unit tests — append inside `mod month_tests` (after the last `test_confirm_bill_dates_wrong_step_errors` test, before the closing `}` of month_tests at line ~4024). First update the `use super::` block at line ~3434 to include new types:
    ```rust
    use super::{IncomeTimingEntry, ConfirmIncomeTimingInput, confirm_income_timing_inner};
    use super::{get_income_timing_suggestions_inner};
    ```
    Tests to add:
    - `test_get_income_timing_suggestions_no_settings` — fresh conn, no settings row → returns empty Vec
    - `test_get_income_timing_suggestions_no_pay_dates` — insert settings with pay_frequency but pay_dates = NULL → returns empty Vec
    - `test_get_income_timing_suggestions_twice_monthly` — insert settings with `pay_frequency = "twice-monthly"`, `pay_dates = '["1","15"]'`; insert income entry of 600000 cents (6000 USD); insert month (year=2026, month=4, status="closing:step-3"); call `get_income_timing_suggestions_inner(&conn, month_id)`; assert 2 results; first = `pay_date: "2026-05-01"`, `amount_cents: 300000`; second = `pay_date: "2026-05-15"`, `amount_cents: 300000`
    - `test_get_income_timing_suggestions_monthly` — insert settings with `pay_frequency = "monthly"`, `pay_dates = '["1"]'`; insert income entry of 500000; insert month (2026, 4); assert 1 result: `pay_date: "2026-05-01"`, `amount_cents: 500000`, `label: None`
    - `test_get_income_timing_suggestions_december_wraps` — insert settings with twice-monthly days ["1","15"]; insert month (2026, 12, "closing:step-3"); assert returned dates are "2027-01-01" and "2027-01-15"
    - `test_get_income_timing_suggestions_day_clamped_to_month_end` — settings with `pay_dates = '["31"]'`; month = (2026, 2, "closing:step-3") → new month is March; assert pay_date = "2026-03-31" (March has 31 days, no clamping needed). Then test with February: month = (2026, 1, ...) → new month is February → clamp day 31 to 28 → assert "2026-02-28"
    - `test_get_income_timing_suggestions_returns_stored_when_exists` — insert month_income_timing record for a month_id; call suggestions; assert it returns stored record (not re-derived from settings); demonstrates idempotency
    - `test_confirm_income_timing_saves_and_advances` — insert month at closing:step-3; call `confirm_income_timing_inner` with two entries; assert month status = closing:step-4; assert two rows in month_income_timing with correct values
    - `test_confirm_income_timing_empty_entries_advances` — empty entries vec; assert step still advances to closing:step-4; no rows in month_income_timing
    - `test_confirm_income_timing_replaces_existing_records` — insert existing month_income_timing rows; call confirm with different entries; assert old rows gone and new rows present; step advances
    - `test_confirm_income_timing_wrong_step_errors` — month at closing:step-2; assert INVALID_STEP_TRANSITION; month status unchanged

    **Helper for inserting income entries in tests:**
    ```rust
    conn.execute(
        "INSERT INTO income_entries (name, amount_cents) VALUES (?1, ?2)",
        rusqlite::params!["Salary", 600000i64],
    ).unwrap();
    ```
    **Helper for inserting settings:**
    ```rust
    conn.execute(
        "INSERT INTO settings (id, pay_frequency, pay_dates) VALUES (1, ?1, ?2)",
        rusqlite::params!["twice-monthly", r#"["1","15"]"#],
    ).unwrap();
    ```
    Use `fresh_conn()` and `insert_month()` helpers already in `month_tests`.

- [x] Task 3: Register new commands in `src-tauri/src/lib.rs` (AC: 1, 2, 3)
  - [x] 3.1: In `src-tauri/src/lib.rs`, in the `invoke_handler!` macro, after `commands::confirm_bill_dates,` add:
    ```rust
    commands::get_income_timing_suggestions,
    commands::confirm_income_timing,
    ```

- [x] Task 4: Add TypeScript interfaces to `src/lib/types.ts` (AC: 1, 2, 3, 4)
  - [x] 4.1: Append after the `ConfirmBillDatesInput` interface (at the end of the file):
    ```typescript
    // Returned by get_income_timing_suggestions — one entry per pay date.
    export interface IncomeTimingSuggestion {
      payDate: string;        // ISO 'YYYY-MM-DD' in the new month
      amountCents: number;    // expected income for this pay date (cents)
      label: string | null;   // e.g. "Paycheck 1", null if single payday
    }

    // Single income timing entry — used in ConfirmIncomeTimingInput.
    export interface IncomeTimingEntry {
      payDate: string;
      amountCents: number;
      label: string | null;
    }

    // Input for confirm_income_timing Tauri command.
    export interface ConfirmIncomeTimingInput {
      monthId: number;
      entries: IncomeTimingEntry[];  // may be empty if no income configured
    }
    ```

- [x] Task 5: Add `confirmIncomeTiming` action to `src/stores/useMonthStore.ts` (AC: 2, 3)
  - [x] 5.1: In `src/stores/useMonthStore.ts`:
    - Add `IncomeTimingEntry, ConfirmIncomeTimingInput` to the type import line:
      ```typescript
      import type { Month, MonthStatus, AdvanceTurnTheMonthStepInput, CloseMonthInput, AppError, BillDateEntry, ConfirmBillDatesInput, IncomeTimingEntry, ConfirmIncomeTimingInput } from '@/lib/types';
      ```
    - Add `confirmIncomeTiming` to the `MonthState` interface:
      ```typescript
      confirmIncomeTiming: (entries: IncomeTimingEntry[]) => Promise<void>;
      ```
    - Add the action implementation after `confirmBillDates`:
      ```typescript
      confirmIncomeTiming: async (entries: IncomeTimingEntry[]) => {
        const { currentMonth } = get();
        if (!currentMonth) return;
        set({ isWriting: true });
        try {
          const input: ConfirmIncomeTimingInput = {
            monthId: currentMonth.id,
            entries,
          };
          const updated = await invoke<Month>('confirm_income_timing', { input });
          set({
            currentMonth: updated,
            monthStatus: updated.status as MonthStatus,
            isWriting: false,
            error: null,
          });
        } catch (e) {
          const err = e as AppError;
          set({ isWriting: false, error: err.message ?? 'Failed to confirm income timing' });
          throw e;
        }
      },
      ```

- [x] Task 6: Create `IncomeTimingConfirmation.tsx` component (AC: 1, 3, 4)
  - [x] 6.1: Create `src/features/month/IncomeTimingConfirmation.tsx`:
    ```typescript
    import { useState, useEffect } from 'react';
    import { invoke } from '@tauri-apps/api/core';
    import type { IncomeTimingSuggestion, IncomeTimingEntry, AppError } from '@/lib/types';
    import { formatCurrency } from '@/lib/formatCurrency';

    interface Props {
      monthId: number;
      year: number;
      month: number;
      onEntriesChange: (entries: IncomeTimingEntry[]) => void;
    }

    export default function IncomeTimingConfirmation({ monthId, year, month, onEntriesChange }: Props) {
      const [suggestions, setSuggestions] = useState<IncomeTimingSuggestion[]>([]);
      const [localEntries, setLocalEntries] = useState<IncomeTimingEntry[]>([]);
      const [loading, setLoading] = useState(true);
      const [fetchError, setFetchError] = useState<string | null>(null);

      const monthLabel = `${year}-${String(month).padStart(2, '0')}`;

      useEffect(() => {
        invoke<IncomeTimingSuggestion[]>('get_income_timing_suggestions', { monthId })
          .then((data) => {
            setSuggestions(data);
            const entries = data.map((s) => ({
              payDate: s.payDate,
              amountCents: s.amountCents,
              label: s.label,
            }));
            setLocalEntries(entries);
            onEntriesChange(entries);
          })
          .catch((e) => setFetchError((e as AppError).message ?? 'Failed to load income timing'))
          .finally(() => setLoading(false));
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      const handleAmountChange = (index: number, value: string) => {
        const parsed = value === '' ? 0 : Math.round(parseFloat(value) * 100);
        const amount = isNaN(parsed) || parsed < 0 ? 0 : parsed;
        const updated = localEntries.map((e, i) =>
          i === index ? { ...e, amountCents: amount } : e
        );
        setLocalEntries(updated);
        onEntriesChange(updated);
      };

      if (loading) {
        return (
          <div className="py-8 text-center type-body" style={{ color: 'var(--color-text-secondary)' }}>
            Loading income timing...
          </div>
        );
      }

      if (fetchError) {
        return (
          <div className="py-8 text-center type-body" style={{ color: 'var(--color-danger, #ff5555)' }}>
            {fetchError}
          </div>
        );
      }

      if (suggestions.length === 0) {
        return (
          <div className="py-8 text-center type-body" style={{ color: 'var(--color-text-secondary)' }}>
            No income configured. Continue to proceed.
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-6 py-4 px-2">
          <p className="type-label" style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
            {monthLabel}
          </p>
          {localEntries.map((entry, index) => {
            const suggestion = suggestions[index];
            return (
              <div key={entry.payDate} className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="type-body" style={{ color: 'var(--color-text-primary)' }}>
                    {entry.payDate}
                  </span>
                  {entry.label && (
                    <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>
                      {entry.label}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={(entry.amountCents / 100).toFixed(2)}
                  placeholder="0.00"
                  onChange={(e) => handleAmountChange(index, e.target.value)}
                  aria-label={`Income amount for ${entry.payDate}`}
                  className="type-body"
                  style={{
                    width: '6rem',
                    background: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    padding: '0.25rem 0.5rem',
                    textAlign: 'right',
                  }}
                />
              </div>
            );
          })}
        </div>
      );
    }
    ```
    **Important:** `formatCurrency` is imported but only used for display patterns — the input value uses raw decimal. If `formatCurrency` is not available at `@/lib/formatCurrency`, check the actual utility path (look in `src/lib/` for existing format helpers). Do NOT create a new utility — find the existing one.

- [x] Task 7: Update `TurnTheMonthWizard.tsx` to integrate step 3 (AC: 2, 3)
  - [x] 7.1: In `src/features/month/TurnTheMonthWizard.tsx`:
    - Add imports:
      ```typescript
      import IncomeTimingConfirmation from './IncomeTimingConfirmation';
      import type { BillDateEntry, IncomeTimingEntry } from '@/lib/types';
      ```
    - Update `StepContent` signature to accept optional `onEntriesChange`:
      ```typescript
      function StepContent({
        step,
        monthId,
        year,
        month,
        onDatesChange,
        onEntriesChange,
      }: {
        step: number;
        monthId: number;
        year: number;
        month: number;
        onDatesChange?: (dates: BillDateEntry[]) => void;
        onEntriesChange?: (entries: IncomeTimingEntry[]) => void;
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
        return (
          <div style={{ color: 'var(--color-text-secondary)' }} className="py-8 type-body text-center">
            {STEP_TITLES[step]} — implementation coming in Story 6.{step + 2}
          </div>
        );
      }
      ```
    - In `TurnTheMonthWizard` component body:
      - Add state: `const [pendingIncomeEntries, setPendingIncomeEntries] = useState<IncomeTimingEntry[]>([]);`
      - Destructure `confirmIncomeTiming` from store: `const { monthStatus, advanceStep, closeMonth, confirmBillDates, confirmIncomeTiming, isWriting, error, currentMonth } = useMonthStore();`
      - Replace `handleContinue` with step-3-aware version:
        ```typescript
        const handleContinue = async () => {
          if (isWriting) return;
          if (!monthStatus.startsWith('closing:step-')) return;
          if (viewStep < dbStep) {
            setViewStep((v) => v + 1);
            return;
          }
          try {
            if (dbStep === TOTAL_STEPS) {
              await closeMonth();
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
        ```
      - Update `StepContent` render to pass `onEntriesChange`:
        ```typescript
        <StepContent
          step={viewStep}
          monthId={currentMonth?.id ?? 0}
          year={currentMonth?.year ?? 0}
          month={currentMonth?.month ?? 0}
          onDatesChange={setPendingBillDates}
          onEntriesChange={setPendingIncomeEntries}
        />
        ```
    - No other changes to `TurnTheMonthWizard` — the stepper shell, handleBack, Stepper props, and step 4 placeholder remain unchanged.

- [x] Task 8: Write `IncomeTimingConfirmation.test.tsx` (AC: 1, 3, 4)
  - [x] 8.1: Create `src/features/month/IncomeTimingConfirmation.test.tsx`:
    - Setup: `vi.mock('@tauri-apps/api/core')` with `invoke` mock
    - `shows loading state initially` — render with a pending invoke; assert "Loading income timing..." text
    - `renders list of pay dates with amounts` — mock invoke returning two suggestions (payDate: "2026-05-01", amountCents: 300000, label: "Paycheck 1" and payDate: "2026-05-15", amountCents: 300000, label: "Paycheck 2"); assert both dates and dollar values visible
    - `calls onEntriesChange on initial load` — provide `onEntriesChange` spy; after invoke resolves, verify called with initial entries array matching suggestion data
    - `calls onEntriesChange when user edits amount` — after load, fire change event on an amount input; verify `onEntriesChange` called with updated amountCents
    - `shows empty state when no income configured` — mock invoke returning `[]`; assert "No income configured. Continue to proceed." visible
    - `shows error on fetch failure` — mock invoke to reject; assert error text visible
    - Pattern: follow `BillDateConfirmation.test.tsx` as the template for mock setup and assertion structure.

## Dev Notes

### Architecture & Code Location Guardrails

- **Migrations**: `src-tauri/migrations/011_month_income_timing.sql` — numeric naming, auto-picked up by `migrations.rs` (no registration needed)
- **Rust commands**: Add to `src-tauri/src/commands/mod.rs` AFTER `confirm_bill_dates` Tauri wrapper (~line 3421), BEFORE `#[cfg(test)]` at line 3423
- **Rust tests**: Append inside `mod month_tests` BEFORE its closing `}` (~line 4024)
- **TypeScript types**: `src/lib/types.ts` (append at end)
- **Store**: `src/stores/useMonthStore.ts`
- **Component**: `src/features/month/IncomeTimingConfirmation.tsx` (NEW file)
- **Wizard**: `src/features/month/TurnTheMonthWizard.tsx` (update existing)

### Pattern Established by Story 6.4 (Follow Exactly)

Story 6.4 (bill dates) is the direct template. The income timing implementation mirrors it:

| 6.4 Pattern | 6.5 Equivalent |
|---|---|
| `BillDateSuggestion` struct | `IncomeTimingSuggestion` struct |
| `ConfirmBillDatesInput` struct | `ConfirmIncomeTimingInput` struct |
| `get_bill_date_suggestions_inner` | `get_income_timing_suggestions_inner` |
| `confirm_bill_dates_inner` (step-2 → step-3) | `confirm_income_timing_inner` (step-3 → step-4) |
| `BillDateConfirmation.tsx` | `IncomeTimingConfirmation.tsx` |
| `pendingBillDates` state + `onDatesChange` | `pendingIncomeEntries` state + `onEntriesChange` |
| `confirmBillDates` store action | `confirmIncomeTiming` store action |

### Rust `rusqlite::OptionalExtension`

The `conn.query_row(...).optional()` call requires `use rusqlite::OptionalExtension;` in scope. Check if it's already imported at the top of `commands/mod.rs`. If not, add it to the use block at the top of the `get_income_timing_suggestions_inner` function body:
```rust
use rusqlite::OptionalExtension;
```

### No `chrono` Dependency

`chrono` is NOT in Cargo.toml. Use `days_in_month()` helper (Task 2.2) for date clamping. Use SQLite `datetime('now')` for timestamps. Do not add chrono or any new crate dependency.

### `serde_json` for pay_dates Parsing

`serde_json` IS in Cargo.toml. The `pay_dates` field in settings is stored as a JSON string (e.g., `'["1","15"]'`). Parse with `serde_json::from_str::<Vec<String>>`. If parsing fails, treat as empty Vec (graceful degradation).

### Income Amount Display

The `IncomeTimingConfirmation` component displays dollar amounts as editable decimal inputs (e.g., `"300.00"` for 300000 cents). When the user edits and the value is blank, treat as 0 cents. Multiply by 100 to get cents (use `Math.round` to handle floating point). Do NOT use `formatCurrency` for the input value — use raw `(amountCents / 100).toFixed(2)`. The `formatCurrency` import in the component template above should be removed if not used elsewhere in that component.

### `get_income_timing_suggestions` Takes `month_id` as Parameter

Unlike `get_bill_date_suggestions` (which took no args and returned global suggestions), `get_income_timing_suggestions` takes `month_id: i64` as a Tauri command parameter. The component calls it as:
```typescript
invoke<IncomeTimingSuggestion[]>('get_income_timing_suggestions', { monthId })
```
The Rust function signature: `pub fn get_income_timing_suggestions(state: State<DbState>, month_id: i64)`. Tauri automatically deserializes camelCase `monthId` from JS to snake_case `month_id` in Rust via its invoke handler.

### Settings Table Insert (Test Helper)

The `settings` table has many columns; when inserting in tests use:
```rust
conn.execute(
    "INSERT OR IGNORE INTO settings (id, pay_frequency, pay_dates) VALUES (1, ?1, ?2)",
    rusqlite::params!["twice-monthly", r#"["1","15"]"#],
).unwrap();
```
The `INSERT OR IGNORE` avoids conflicts if the table already has a row. Check the actual `settings` schema to ensure this is valid (no NOT NULL constraints on other columns without defaults — migration 001 likely has DEFAULT NULL for most columns).

### TurnTheMonthWizard Step 4 Placeholder

After this story, step 4 ("Fill Envelopes") will still show the placeholder message. The `StepContent` function's final `return` (default case) handles this. Do NOT implement step 4 logic in this story — that is Story 6.6.

### `useMonthStore` Test (`useMonthStore.test.ts`)

The existing `useMonthStore.test.ts` may need updating if it tests the store's action list or shape. Check if it uses snapshot testing or explicitly tests action names. If so, add `confirmIncomeTiming` to the expected interface. Do not break existing tests.

### Previous Story Learnings (from Story 6.4)

- The wizard uses `viewStep` (visual) vs `dbStep` (DB state machine) — never conflate them
- `unchecked_transaction()` is the correct rusqlite transaction API (not `transaction()`)
- Error code `INVALID_STEP_TRANSITION` is the established pattern for wrong-step guards
- The `row_to_month` helper at line ~2905 is already defined and reused by all month commands
- Rust test module is `mod month_tests` with `fresh_conn()` and `insert_month()` helpers at ~line 3437
- `BillDateConfirmation` does NOT take `monthId` as a prop (the actual implementation at line 6-8 of the file shows: `interface Props { year: number; month: number; onDatesChange: ... }`). `IncomeTimingConfirmation` DOES need `monthId` because `get_income_timing_suggestions` requires it.

## Dev Agent Record

### Implementation Plan

Followed Story 6.4 (bill dates) pattern exactly. Added SQL migration 011, Rust structs/commands/tests in commands/mod.rs, registered commands in lib.rs, added TypeScript interfaces, updated useMonthStore with `confirmIncomeTiming` action, created `IncomeTimingConfirmation.tsx` component, updated `TurnTheMonthWizard.tsx` to wire step 3, and wrote 6 component tests.

Key deviation from story spec: `migrations.rs` uses a hardcoded MIGRATIONS array (not auto-discovery), so migration 011 was manually registered there and the migration version assertions were updated from 10 → 11.

### Debug Log

- Fixed test `test_get_income_timing_suggestions_day_clamped_to_month_end`: used (2025, 12) → January 2026 (no clamping), corrected to (2026, 1) → February 2026 (day 31 clamps to 28).

### Completion Notes

- Migration 011 creates `month_income_timing` table with UNIQUE(month_id, pay_date)
- Two new Tauri commands: `get_income_timing_suggestions` (derives from settings or returns stored) and `confirm_income_timing` (atomic step-3 → step-4 transition)
- `migrations.rs` updated with entry 11 and version assertions updated from 10 → 11
- 11 new Rust unit tests cover all income timing scenarios including december wrap, day clamping, stored-value idempotency, replace-on-confirm, and wrong-step guard
- `IncomeTimingConfirmation.tsx` renders inline-editable decimal amount inputs per pay date
- `TurnTheMonthWizard.tsx` wired for step 3 alongside existing step 2 (bill dates)
- 134 Rust tests pass; 431 frontend tests pass (13 pre-existing BorrowOverlay failures unrelated to this story)

## File List

- src-tauri/migrations/011_month_income_timing.sql (new)
- src-tauri/src/migrations.rs (modified — added entry 11, updated version assertions)
- src-tauri/src/commands/mod.rs (modified — structs, helper fn, inner fns, Tauri wrappers, 11 unit tests)
- src-tauri/src/lib.rs (modified — registered 2 new commands)
- src/lib/types.ts (modified — 3 new interfaces)
- src/stores/useMonthStore.ts (modified — `confirmIncomeTiming` action)
- src/features/month/IncomeTimingConfirmation.tsx (new)
- src/features/month/IncomeTimingConfirmation.test.tsx (new)
- src/features/month/TurnTheMonthWizard.tsx (modified — step 3 integration)

## Change Log

- 2026-04-09: Story created for Story 6.5 (income timing confirmation)
- 2026-04-09: Story implemented — migration, Rust commands+tests, TS types, store action, component, wizard wiring, component tests

## Review Findings

### Code Review — 2026-04-09

- [x] [Review][Patch] `pay_days` not sorted before suggestion generation [`src-tauri/src/commands/mod.rs` — `get_income_timing_suggestions_inner`]
- [x] [Review][Defer] `total_income` aggregates all `income_entries` globally with no month scope — deferred, pre-existing design (income_entries is global salary config; no month column in schema) [`src-tauri/src/commands/mod.rs` — `get_income_timing_suggestions_inner`]
- [x] [Review][Defer] No FK constraint on `month_income_timing.month_id` — deferred, pre-existing pattern (project-wide SQLite FK approach) [`src-tauri/migrations/011_month_income_timing.sql`]
- [x] [Review][Defer] `handleAmountChange` silently clamps NaN/negative input to 0 with no UI feedback — deferred, UX improvement (no AC requirement) [`src/features/month/IncomeTimingConfirmation.tsx` — `handleAmountChange`]
- [x] [Review][Defer] Empty entries race: Continue can fire before async fetch resolves, sending `confirmIncomeTiming([])` — deferred, pre-existing pattern (same as story 6-4 BillDateConfirmation) [`src/features/month/TurnTheMonthWizard.tsx`, `src/features/month/IncomeTimingConfirmation.tsx`]
- [x] [Review][Defer] `pay_days` values ≤0 from settings silently clamped to 1st of month — deferred, settings validation gap from prior story [`src-tauri/src/commands/mod.rs` — `get_income_timing_suggestions_inner`]

## Status

done
