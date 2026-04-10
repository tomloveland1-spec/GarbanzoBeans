# Story 6.4: Bill Date Confirmation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want to confirm or adjust the bill due dates for the new month before it opens,
So that my Bill envelopes have accurate due dates and the right state colors from day one.

## Acceptance Criteria

1. **AC1: Bill date confirmation step renders all Bill envelopes with suggested due days**
   - Given Turn the Month is at step 2
   - When the bill date confirmation step renders
   - Then all Bill-type (non-savings) envelopes are listed with their suggested due day (day of month, 1–31); suggested value is derived from the last confirmed due day for that envelope (from `bill_due_dates` table); if no historical record exists, the field is blank

2. **AC2: Confirming without changes advances to step 3 atomically**
   - Given Tom confirms without editing any dates
   - When the step commits via `confirm_bill_dates` command
   - Then the existing due days are preserved; `months.status` advances to `closing:step-3` atomically in a single transaction; the stepper moves to step 3

3. **AC3: Editing a bill due date stores the new value atomically with step advance**
   - Given Tom edits a bill due date inline and confirms the step
   - When `confirm_bill_dates` runs
   - Then the new due day is upserted into `bill_due_dates` for that envelope; the prior record (if any) is replaced; the step advances to `closing:step-3` in the same transaction; no partial commit is persisted on failure

4. **AC4: Bill envelope with no historical data shows blank, allows blank confirmation**
   - Given a Bill envelope has no record in `bill_due_dates`
   - When the step renders
   - Then the day input for that envelope is empty with a placeholder; Tom can enter a day or leave it blank and confirm; blank confirms are accepted without error

## Tasks / Subtasks

- [x] Task 1: Create migration `010_bill_due_dates.sql` (AC: 1, 3, 4)
  - [x] 1.1: Create `src-tauri/migrations/010_bill_due_dates.sql`:
    ```sql
    -- Migration 010: Bill due dates — one record per Bill envelope
    -- due_day: day of month the bill is due (1–31)
    -- One row per Bill envelope (UNIQUE envelope_id); upserted each Turn the Month step 2
    CREATE TABLE IF NOT EXISTS bill_due_dates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      envelope_id INTEGER NOT NULL UNIQUE,
      due_day     INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    ```
  - [x] 1.2: Verify `src-tauri/src/migrations.rs` will auto-pick up the new file (it reads all `*.sql` files from the migrations directory in numeric order — no manual registration needed).

- [x] Task 2: Add Rust structs and commands to `src-tauri/src/commands/mod.rs` (AC: 1, 2, 3, 4)
  - [x] 2.1: After the `CloseoutSummary` struct (after line ~2876, before `fn row_to_month`), add:
    ```rust
    #[derive(Debug, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct BillDateSuggestion {
        /// Envelope id
        pub envelope_id: i64,
        /// Envelope display name
        pub envelope_name: String,
        /// Day of month the bill is due (1–31), or None if no record in bill_due_dates
        pub due_day: Option<i32>,
    }

    #[derive(Debug, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct BillDateEntry {
        pub envelope_id: i64,
        /// Some(day) → upsert; None → delete existing record for this envelope
        pub due_day: Option<i32>,
    }

    #[derive(Debug, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ConfirmBillDatesInput {
        pub month_id: i64,
        /// Full list of Bill envelopes with their new or unchanged due days
        pub dates: Vec<BillDateEntry>,
    }
    ```

  - [x] 2.2: After `get_closeout_summary` Tauri command (after line ~3278, immediately before `#[cfg(test)]`), add `get_bill_date_suggestions_inner`:
    ```rust
    fn get_bill_date_suggestions_inner(
        conn: &rusqlite::Connection,
    ) -> Result<Vec<BillDateSuggestion>, AppError> {
        let mut stmt = conn.prepare(
            "SELECT e.id, e.name, b.due_day \
             FROM envelopes e \
             LEFT JOIN bill_due_dates b ON e.id = b.envelope_id \
             WHERE e.type = 'Bill' AND e.is_savings = 0 \
             ORDER BY e.name ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(BillDateSuggestion {
                envelope_id: row.get(0)?,
                envelope_name: row.get(1)?,
                due_day: row.get(2)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    #[tauri::command]
    pub fn get_bill_date_suggestions(
        state: State<DbState>,
    ) -> Result<Vec<BillDateSuggestion>, AppError> {
        let conn = state.0.lock().map_err(|_| AppError {
            code: "DB_LOCK_POISON".to_string(),
            message: "Database mutex was poisoned.".to_string(),
        })?;
        get_bill_date_suggestions_inner(&conn)
    }
    ```

  - [x] 2.3: Immediately after `get_bill_date_suggestions` Tauri command (still before `#[cfg(test)]`), add `confirm_bill_dates_inner` and its Tauri wrapper:
    ```rust
    fn confirm_bill_dates_inner(
        conn: &rusqlite::Connection,
        input: &ConfirmBillDatesInput,
    ) -> Result<Month, AppError> {
        let expected_status = "closing:step-2";
        let next_status = "closing:step-3";

        let tx = conn.unchecked_transaction()?;

        // Guard: verify month is at closing:step-2
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

        // Upsert or delete each bill due date entry
        for entry in &input.dates {
            match entry.due_day {
                Some(day) => {
                    tx.execute(
                        "INSERT INTO bill_due_dates (envelope_id, due_day, updated_at) \
                         VALUES (?1, ?2, datetime('now')) \
                         ON CONFLICT(envelope_id) DO UPDATE SET \
                           due_day = excluded.due_day, \
                           updated_at = excluded.updated_at",
                        rusqlite::params![entry.envelope_id, day],
                    )?;
                }
                None => {
                    tx.execute(
                        "DELETE FROM bill_due_dates WHERE envelope_id = ?1",
                        rusqlite::params![entry.envelope_id],
                    )?;
                }
            }
        }

        // Advance step 2 → 3 atomically
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
    pub fn confirm_bill_dates(
        state: State<DbState>,
        input: ConfirmBillDatesInput,
    ) -> Result<Month, AppError> {
        let conn = state.0.lock().map_err(|_| AppError {
            code: "DB_LOCK_POISON".to_string(),
            message: "Database mutex was poisoned.".to_string(),
        })?;
        confirm_bill_dates_inner(&conn, &input)
    }
    ```

  - [x] 2.4: Add Rust unit tests to the `month_tests` module. Add these to the `use super::` block at the top of `month_tests`:
    ```rust
    use super::{BillDateEntry, ConfirmBillDatesInput, confirm_bill_dates_inner};
    use super::{get_bill_date_suggestions_inner};
    use super::{CreateEnvelopeInput};  // already imported, reuse
    ```
    Tests to add (append inside `mod month_tests`):
    - `test_get_bill_date_suggestions_empty` — fresh conn (no envelopes) → returns empty Vec
    - `test_get_bill_date_suggestions_filters_bill_only` — insert Rolling + Bill + Goal envelopes → only the Bill envelope appears in suggestions
    - `test_get_bill_date_suggestions_returns_due_day` — insert Bill envelope + `bill_due_dates` row with `due_day = 15` → `due_day = Some(15)` in result
    - `test_get_bill_date_suggestions_null_when_no_record` — insert Bill envelope without bill_due_dates entry → `due_day = None` in result
    - `test_confirm_bill_dates_saves_and_advances` — insert month at `closing:step-2`; insert Bill envelope; call `confirm_bill_dates_inner` with `due_day = Some(15)`; assert bill_due_dates row exists with `due_day = 15`; assert month status = `closing:step-3`
    - `test_confirm_bill_dates_upserts_existing` — existing `bill_due_dates` row with `due_day = 10`; call with `due_day = Some(20)`; verify updated to 20
    - `test_confirm_bill_dates_null_deletes_record` — existing `bill_due_dates` row; call with `due_day = None`; verify row is deleted; step still advances
    - `test_confirm_bill_dates_empty_list_advances_step` — empty `dates` vec; assert step advances to `closing:step-3` without touching bill_due_dates
    - `test_confirm_bill_dates_wrong_step_errors` — month at `closing:step-1`; call `confirm_bill_dates_inner`; assert `INVALID_STEP_TRANSITION` error; assert month status unchanged

    **Helper pattern for inserting bill_due_dates in tests:**
    ```rust
    conn.execute(
        "INSERT INTO bill_due_dates (envelope_id, due_day) VALUES (?1, ?2)",
        rusqlite::params![envelope_id, 15i32],
    ).unwrap();
    ```
    Use `fresh_conn()` and `insert_month()` helpers already in `month_tests` (reuse existing helpers).

- [x] Task 3: Register new commands in `src-tauri/src/lib.rs` (AC: 1, 2, 3)
  - [x] 3.1: In `src-tauri/src/lib.rs`, in the `invoke_handler!` macro, add after `commands::get_closeout_summary,`:
    ```rust
    commands::get_bill_date_suggestions,
    commands::confirm_bill_dates,
    ```

- [x] Task 4: Add TypeScript interfaces to `src/lib/types.ts` (AC: 1, 2, 3, 4)
  - [x] 4.1: Append after the `CloseoutSummary` interface (at the end of the file):
    ```typescript
    // Returned by get_bill_date_suggestions — one entry per Bill envelope.
    export interface BillDateSuggestion {
      envelopeId: number;
      envelopeName: string;
      dueDay: number | null;  // day of month (1–31), null = no historical record
    }

    // Single bill date entry — used in ConfirmBillDatesInput.
    export interface BillDateEntry {
      envelopeId: number;
      dueDay: number | null;  // Some = upsert; null = delete existing record
    }

    // Input for confirm_bill_dates Tauri command.
    export interface ConfirmBillDatesInput {
      monthId: number;
      dates: BillDateEntry[];
    }
    ```

- [x] Task 5: Add `confirmBillDates` action to `src/stores/useMonthStore.ts` (AC: 2, 3)
  - [x] 5.1: In `src/stores/useMonthStore.ts`:
    - Add `BillDateEntry, ConfirmBillDatesInput` to the type import line:
      ```typescript
      import type { Month, MonthStatus, AdvanceTurnTheMonthStepInput, CloseMonthInput, AppError, BillDateEntry, ConfirmBillDatesInput } from '@/lib/types';
      ```
    - Add `confirmBillDates` to the `MonthState` interface:
      ```typescript
      confirmBillDates: (dates: BillDateEntry[]) => Promise<void>;
      ```
    - Add the action implementation after `advanceStep`:
      ```typescript
      confirmBillDates: async (dates: BillDateEntry[]) => {
        const { currentMonth } = get();
        if (!currentMonth) return;
        set({ isWriting: true });
        try {
          const input: ConfirmBillDatesInput = {
            monthId: currentMonth.id,
            dates,
          };
          const updated = await invoke<Month>('confirm_bill_dates', { input });
          set({
            currentMonth: updated,
            monthStatus: updated.status as MonthStatus,
            isWriting: false,
            error: null,
          });
        } catch (e) {
          const err = e as AppError;
          set({ isWriting: false, error: err.message ?? 'Failed to confirm bill dates' });
          throw e;
        }
      },
      ```

- [x] Task 6: Create `BillDateConfirmation.tsx` component (AC: 1, 2, 3, 4)
  - [x] 6.1: Create `src/features/month/BillDateConfirmation.tsx`:
    ```typescript
    import { useState, useEffect } from 'react';
    import { invoke } from '@tauri-apps/api/core';
    import type { BillDateSuggestion, BillDateEntry, AppError } from '@/lib/types';

    interface Props {
      monthId: number;
      year: number;
      month: number;
      onDatesChange: (dates: BillDateEntry[]) => void;
    }

    export default function BillDateConfirmation({ year, month, onDatesChange }: Props) {
      const [suggestions, setSuggestions] = useState<BillDateSuggestion[]>([]);
      const [localDays, setLocalDays] = useState<Map<number, number | null>>(new Map());
      const [loading, setLoading] = useState(true);
      const [fetchError, setFetchError] = useState<string | null>(null);

      const monthLabel = `${year}-${String(month).padStart(2, '0')}`;

      useEffect(() => {
        invoke<BillDateSuggestion[]>('get_bill_date_suggestions')
          .then((data) => {
            setSuggestions(data);
            const map = new Map(data.map((s) => [s.envelopeId, s.dueDay]));
            setLocalDays(map);
            // Notify wizard of initial state so it has data ready for Continue
            onDatesChange(data.map((s) => ({ envelopeId: s.envelopeId, dueDay: s.dueDay })));
          })
          .catch((e) => setFetchError((e as AppError).message ?? 'Failed to load bill dates'))
          .finally(() => setLoading(false));
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      const handleDayChange = (envelopeId: number, value: string) => {
        const parsed = value === '' ? null : parseInt(value, 10);
        const clamped =
          parsed !== null && !isNaN(parsed)
            ? Math.min(31, Math.max(1, parsed))
            : null;
        const newMap = new Map(localDays);
        newMap.set(envelopeId, clamped);
        setLocalDays(newMap);
        onDatesChange(
          suggestions.map((s) => ({
            envelopeId: s.envelopeId,
            dueDay: newMap.get(s.envelopeId) ?? null,
          }))
        );
      };

      if (loading) {
        return (
          <div className="py-8 text-center type-body" style={{ color: 'var(--color-text-secondary)' }}>
            Loading bill dates...
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
            No Bill envelopes to confirm.
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-6 py-4 px-2">
          <p className="type-label" style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
            {monthLabel}
          </p>
          {suggestions.map((s) => (
            <div key={s.envelopeId} className="flex items-center justify-between gap-4">
              <span className="type-body" style={{ color: 'var(--color-text-primary)' }}>
                {s.envelopeName}
              </span>
              <input
                type="number"
                min={1}
                max={31}
                value={localDays.get(s.envelopeId) ?? ''}
                placeholder="—"
                onChange={(e) => handleDayChange(s.envelopeId, e.target.value)}
                aria-label={`Due day for ${s.envelopeName}`}
                className="type-body"
                style={{
                  width: '4rem',
                  background: 'var(--color-bg-card)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  padding: '0.25rem 0.5rem',
                  textAlign: 'center',
                }}
              />
            </div>
          ))}
        </div>
      );
    }
    ```

- [x] Task 7: Update `TurnTheMonthWizard.tsx` to integrate step 2 (AC: 2, 3)
  - [x] 7.1: In `src/features/month/TurnTheMonthWizard.tsx`:
    - Add imports:
      ```typescript
      import BillDateConfirmation from './BillDateConfirmation';
      import type { BillDateEntry } from '@/lib/types';
      ```
    - Update `StepContent` signature to accept optional `onDatesChange`:
      ```typescript
      function StepContent({
        step,
        monthId,
        year,
        month,
        onDatesChange,
      }: {
        step: number;
        monthId: number;
        year: number;
        month: number;
        onDatesChange?: (dates: BillDateEntry[]) => void;
      }) {
        if (step === 1) {
          return <CloseoutSummary monthId={monthId} year={year} month={month} />;
        }
        if (step === 2) {
          return (
            <BillDateConfirmation
              monthId={monthId}
              year={year}
              month={month}
              onDatesChange={onDatesChange ?? (() => {})}
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
      - Add state: `const [pendingBillDates, setPendingBillDates] = useState<BillDateEntry[]>([]);`
      - Destructure `confirmBillDates` from store: `const { monthStatus, advanceStep, closeMonth, confirmBillDates, isWriting, error, currentMonth } = useMonthStore();`
      - Replace `handleContinue` with step-2-aware version:
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
              // viewStep synced by useEffect above
            } else {
              await advanceStep(dbStep);
            }
          } catch {
            // error is set in store by confirmBillDates/advanceStep/closeMonth
          }
        };
        ```
      - Update `StepContent` render to pass `onDatesChange`:
        ```typescript
        <StepContent
          step={viewStep}
          monthId={currentMonth?.id ?? 0}
          year={currentMonth?.year ?? 0}
          month={currentMonth?.month ?? 0}
          onDatesChange={setPendingBillDates}
        />
        ```
    - No other changes to `TurnTheMonthWizard` — the stepper shell, handleBack, Stepper props remain unchanged.

- [x] Task 8: Write `BillDateConfirmation.test.tsx` (AC: 1, 2, 3, 4)
  - [x] 8.1: Create `src/features/month/BillDateConfirmation.test.tsx`:
    - Setup: `vi.mock('@tauri-apps/api/core')` with `invoke` mock
    - `shows loading state initially` — render with a pending invoke; assert "Loading bill dates..." text
    - `renders list of bill envelopes` — mock invoke returning two suggestions; assert both envelope names visible
    - `prefills existing due_day values` — mock with `dueDay: 15` → assert input value is 15
    - `shows empty input for null dueDay` — mock with `dueDay: null` → assert input value is '' (empty)
    - `calls onDatesChange on initial load` — provide `onDatesChange` spy; after invoke resolves, verify called with initial suggestions
    - `calls onDatesChange when user edits a value` — after load, fire change event on an input; verify `onDatesChange` called with updated value
    - `shows empty state when no bill envelopes` — mock invoke returning `[]`; assert "No Bill envelopes to confirm." visible
    - `shows error on fetch failure` — mock invoke to reject; assert error text visible
    - **Invoke mock pattern:**
      ```typescript
      vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
      import { invoke } from '@tauri-apps/api/core';
      ```
    - **Suggestion fixture:**
      ```typescript
      const mockSuggestions: BillDateSuggestion[] = [
        { envelopeId: 1, envelopeName: 'Rent', dueDay: 1 },
        { envelopeId: 2, envelopeName: 'Internet', dueDay: null },
      ];
      ```

- [x] Task 9: Update `useMonthStore.test.ts` (AC: 2, 3)
  - [x] 9.1: Add to `src/stores/useMonthStore.test.ts`:
    - Reset state in `beforeEach` to include resetting `confirmBillDates` (store already resets all fields — no change to beforeEach needed)
    - `confirmBillDates: updates monthStatus to closing:step-3` — set store to `closing:step-2`; mock invoke returning `closing:step-3` Month; call `confirmBillDates([])`; assert `monthStatus === 'closing:step-3'`
    - `confirmBillDates: calls confirm_bill_dates Tauri command` — verify `invoke` called with `'confirm_bill_dates'` and correct input shape
    - `confirmBillDates: sets error and re-throws on failure` — mock invoke to reject; assert error set, isWriting reset to false
    - `confirmBillDates: does nothing when currentMonth is null` — store has `currentMonth: null`; assert invoke not called

- [x] Task 10: Update `TurnTheMonthWizard.test.tsx` (AC: 2)
  - [x] 10.1: In `src/features/month/TurnTheMonthWizard.test.tsx`:
    - Add `confirmBillDates: vi.fn().mockResolvedValue(undefined)` to the `useMonthStore` mock (alongside existing `advanceStep`, `closeMonth` mocks)
    - Add `vi.mock('@tauri-apps/api/core', ...)` with a pending invoke (so BillDateConfirmation stays in loading state during wizard-level tests)
    - Add `vi.mock('@/stores/useSavingsStore', ...)` if not already present (needed since CloseoutSummary also loads at step 1)
    - Add test: `Continue on step 2 calls confirmBillDates` — set month to `closing:step-2`; render wizard; click Continue; assert `confirmBillDates` called (not `advanceStep`)
    - Existing tests for step 1 and the wizard shell should continue to pass unchanged

- [x] Task 11: Run full test suite (AC: all)
  - [x] 11.1: Run `npm test` — all new BillDateConfirmation component tests pass; all new useMonthStore tests pass; wizard Continue-at-step-2 test passes; no regressions. Pre-existing 13 BorrowOverlay failures and 4 lint errors remain.
  - [x] 11.2: Run `npm run lint` — no new lint errors.
  - [x] 11.3: Run `cargo test` in `src-tauri/` — all 9 new bill date tests pass; all existing month tests pass.

## Dev Notes

### What Already Exists — DO NOT Recreate

| What | Where | Note |
|------|-------|------|
| `TurnTheMonthWizard` | `src/features/month/TurnTheMonthWizard.tsx` | Update `StepContent` and `handleContinue` only; stepper shell and handleBack are unchanged |
| `TurnTheMonthStepper` | `src/features/month/TurnTheMonthStepper.tsx` | Shell — do NOT modify |
| `CloseoutSummary` | `src/features/month/CloseoutSummary.tsx` | Step 1 component — do NOT modify |
| `useMonthStore` | `src/stores/useMonthStore.ts` | Add `confirmBillDates` action; leave all other actions untouched |
| `advance_turn_the_month_step` | `src-tauri/src/commands/mod.rs` | Used for steps 1, 3 — NOT called at step 2; step 2 uses the new `confirm_bill_dates` |
| `row_to_month` | `src-tauri/src/commands/mod.rs` | Standalone helper fn — reuse in `confirm_bill_dates_inner` |
| `month_tests` module | `src-tauri/src/commands/mod.rs` | Existing test module with `fresh_conn()`, `insert_month()` helpers — reuse |
| `formatCurrency` | `src/lib/currency.ts` | Not needed for this story (no currency display) |
| Design tokens | CSS variables | All styling via CSS variables — no hardcoded hex |

### Feature Folder: Use `src/features/month/` NOT `src/features/turn-the-month/`

Architecture doc mentions `src/features/turn-the-month/` and `BillDateConfirmation.tsx`, but the actual project uses `src/features/month/` (confirmed in stories 6.1–6.3). All new files go in `src/features/month/`.

### All Commands in `commands/mod.rs` (Single File)

Architecture mentions separate files (`commands/months.rs`) but the project uses a single `commands/mod.rs` for ALL commands. Add `get_bill_date_suggestions` and `confirm_bill_dates` to `commands/mod.rs`. Do NOT create new command files.

### New Migration is Auto-Registered

`src-tauri/src/migrations.rs` reads all `*.sql` files from the migrations directory and applies them in numeric order. No manual registration is required — just create the file. Verify by checking that `migrations.rs` uses a glob/read approach (search for how migration 009 was picked up).

### `confirm_bill_dates` Replaces `advanceStep(2)` — Critical Wizard Change

At step 2, pressing Continue must call `confirmBillDates` (from the store) instead of `advanceStep(2)`. The `confirm_bill_dates` Rust command advances the step AND saves bill dates atomically. If the wizard also called `advance_turn_the_month_step`, it would fail (double-advance guard).

**Wizard Continue flow by step:**
- Step 1 → `advanceStep(1)` (existing, unchanged)
- Step 2 → `confirmBillDates(pendingBillDates)` (NEW)
- Step 3 → `advanceStep(3)` (future story)
- Step 4 → `closeMonth()` (existing, unchanged)

### `pendingBillDates` Flow in Wizard

1. Wizard renders `<BillDateConfirmation ... onDatesChange={setPendingBillDates} />`
2. BillDateConfirmation loads suggestions on mount → calls `onDatesChange(initialSuggestions)`
3. Wizard now has `pendingBillDates` = current suggestions (even if Tom doesn't edit anything)
4. Tom edits a day → component calls `onDatesChange(updatedDates)` → wizard updates `pendingBillDates`
5. Tom presses Continue → wizard calls `confirmBillDates(pendingBillDates)`
6. Store invokes `confirm_bill_dates` with `{ monthId, dates: pendingBillDates }`

**Edge case — loading not complete when Tom presses Continue quickly:**
If Tom presses Continue before BillDateConfirmation has loaded (loading state), `pendingBillDates` will be `[]` (initial state). `confirm_bill_dates([])` is valid — it just advances the step without touching bill_due_dates. This is acceptable behavior.

### DB_LOCK_POISON Pattern

Every command acquires the mutex with this exact pattern (copy from existing commands):
```rust
let conn = state.0.lock().map_err(|_| AppError {
    code: "DB_LOCK_POISON".to_string(),
    message: "Database mutex was poisoned.".to_string(),
})?;
```

### SQLite UPSERT Syntax

The `ON CONFLICT(envelope_id) DO UPDATE SET ...` syntax uses `excluded.column_name` to reference the proposed new value:
```sql
INSERT INTO bill_due_dates (envelope_id, due_day, updated_at)
VALUES (?1, ?2, datetime('now'))
ON CONFLICT(envelope_id) DO UPDATE SET
  due_day = excluded.due_day,
  updated_at = excluded.updated_at
```
`excluded` is a SQLite pseudo-table — it holds the values that were proposed in the INSERT but conflicted.

### `is_savings = 0` Filter in `get_bill_date_suggestions`

The query filters `WHERE e.type = 'Bill' AND e.is_savings = 0`. The `is_savings` flag on envelopes marks the single savings account. Bill envelopes are always `is_savings = 0`. The double filter is belt-and-suspenders.

### Design System Token Usage

Use CSS variables — never hardcode hex:
- `var(--color-text-primary)` — envelope names
- `var(--color-text-secondary)` — loading/empty state text
- `var(--color-text-muted)` — month label
- `var(--color-bg-card)` — input background
- `var(--color-border)` — input border
- `var(--color-danger, #ff5555)` — fetch error (fallback hex if token not defined)
- Typography: `type-label`, `type-body` CSS classes

### Pre-existing Test Failures (From Story 6.3)

- **13 `BorrowOverlay.test.tsx` failures** — pre-existing, do NOT investigate
- **4 lint errors** in `OFXImporter.tsx`, `useTransactionStore.ts`, `useUpdateStore.test.ts` — pre-existing, do NOT fix
- Test count baseline from 6.3: Vitest 404 passed, Cargo 114 passed

### Architecture Compliance

- React components do NOT access SQLite directly — all DB via Tauri commands ✓
- Business logic (step guard, atomic upsert) lives in Rust `confirm_bill_dates_inner` ✓
- `confirm_bill_dates` wraps both state machine advance AND data mutation in a single transaction ✓
- Zustand store action calls Tauri command with `invoke<ReturnType>('command_name', { input })` pattern ✓
- Design tokens from CSS variables only — no hardcoded hex ✓

### Review Findings

- [x] [Review][Patch] monthId prop declared but never used in BillDateConfirmation [src/features/month/BillDateConfirmation.tsx — Props interface and TurnTheMonthWizard.tsx call site]
- [x] [Review][Defer] pendingBillDates loses user edits on step back then forward [src/features/month/TurnTheMonthWizard.tsx, BillDateConfirmation.tsx] — deferred, pre-existing
- [x] [Review][Defer] No FK constraint on envelope_id in bill_due_dates [src-tauri/migrations/010_bill_due_dates.sql] — deferred, pre-existing
- [x] [Review][Defer] No backend validation that envelope_id belongs to a Bill type [src-tauri/src/commands/mod.rs — confirm_bill_dates_inner] — deferred, pre-existing
- [x] [Review][Defer] due_day 29–31 accepted for short months without calendar validation [010_bill_due_dates.sql, BillDateConfirmation.tsx] — deferred, pre-existing
- [x] [Review][Defer] dbStep === 2 magic number in handleContinue [src/features/month/TurnTheMonthWizard.tsx:80] — deferred, pre-existing

### References

- Story 6.4 ACs: `_bmad-output/planning-artifacts/epics.md` lines 1157–1181
- Epic 6 overview: `_bmad-output/planning-artifacts/epics.md` line 1079
- ADR-4 (Month lifecycle): `_bmad-output/planning-artifacts/architecture.md` line 81
- Previous story dev notes (6.3): `_bmad-output/implementation-artifacts/6-3-closeout-summary-last-month-in-review.md`
- Existing TurnTheMonthWizard: `src/features/month/TurnTheMonthWizard.tsx`
- Existing useMonthStore: `src/stores/useMonthStore.ts`
- Month commands: `src-tauri/src/commands/mod.rs` (month_tests module, row_to_month helper)
- lib.rs invoke handler: `src-tauri/src/lib.rs` (add new commands after `get_closeout_summary`)
- CloseoutSummary (step 1 pattern to follow): `src/features/month/CloseoutSummary.tsx`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

migrations.rs uses a static MIGRATIONS array (not glob-based auto-discovery); manually registered migration 010 and updated version assertions from 9→10.

### Completion Notes List

All 11 tasks implemented and verified. Migration 010 creates `bill_due_dates` table. Two new Rust commands (`get_bill_date_suggestions`, `confirm_bill_dates`) with 9 unit tests — all pass. New `BillDateConfirmation.tsx` component renders Bill envelopes with inline day inputs, loaded via Tauri, notifies wizard via `onDatesChange`. `useMonthStore` extended with `confirmBillDates` action. `TurnTheMonthWizard` routes step 2 Continue to `confirmBillDates` (not `advanceStep`). Vitest: 419 passed (13 pre-existing BorrowOverlay failures unchanged). Cargo: 123 passed. Lint: 4 pre-existing errors, no new errors.

### File List

- src-tauri/migrations/010_bill_due_dates.sql (new)
- src-tauri/src/migrations.rs (modified — registered migration 010, updated version assertions)
- src-tauri/src/commands/mod.rs (modified — BillDateSuggestion/BillDateEntry/ConfirmBillDatesInput structs, get_bill_date_suggestions_inner, get_bill_date_suggestions, confirm_bill_dates_inner, confirm_bill_dates, 9 new tests in month_tests)
- src-tauri/src/lib.rs (modified — registered get_bill_date_suggestions, confirm_bill_dates commands)
- src/lib/types.ts (modified — BillDateSuggestion, BillDateEntry, ConfirmBillDatesInput interfaces)
- src/stores/useMonthStore.ts (modified — confirmBillDates action, updated imports)
- src/features/month/BillDateConfirmation.tsx (new)
- src/features/month/TurnTheMonthWizard.tsx (modified — integrated BillDateConfirmation at step 2, confirmBillDates in handleContinue)
- src/features/month/BillDateConfirmation.test.tsx (new — 8 tests)
- src/stores/useMonthStore.test.ts (modified — 4 new confirmBillDates tests)
- src/features/month/TurnTheMonthWizard.test.tsx (modified — confirmBillDates mock, 1 new test)

## Change Log

- 2026-04-09: Story 6.4 implemented — bill_due_dates migration, Rust commands (get_bill_date_suggestions, confirm_bill_dates), BillDateConfirmation component, confirmBillDates store action, wizard step 2 integration, 22 new tests (8 component, 9 Rust, 4 store, 1 wizard)
