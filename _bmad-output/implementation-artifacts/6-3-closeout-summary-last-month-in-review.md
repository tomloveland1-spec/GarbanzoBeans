# Story 6.3: Closeout Summary — Last Month in Review

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want to see a summary of last month's budget performance, savings flow, and runway change before closing it,
So that I understand how the month went and can make informed decisions for the next one.

## Acceptance Criteria

1. **AC1: Closeout summary displays budget result, savings flow, and runway change**
   - Given Turn the Month opens at step 1
   - When the closeout summary step renders
   - Then it displays: overall budget result (stayed in budget or total overspend), net savings flow for the month (positive = saved, negative = drew down), runway change (delta from prior to current savings balance)

2. **AC2: Drift detection note for 2+ consecutive months overspent**
   - Given the same envelope has been over budget for 2 or more consecutive months
   - When the closeout summary renders
   - Then a single plain-language observational note appears above the envelope list: "[Envelope Name] has run over budget 2 months in a row — worth adjusting the target?"; presented as information, not a warning; no modal, no animation

3. **AC3: Drift note dismissed on confirmation; no forced action**
   - Given the drift detection note is shown
   - When Tom confirms the step (presses Continue)
   - Then the observation is dismissed naturally; no action is forced; Tom proceeds to step 2

4. **AC4: Step advance on confirmation**
   - Given Tom confirms the closeout summary step
   - When the `advance_turn_the_month_step` command runs
   - Then the month status advances to `closing:step-2` atomically; the stepper moves to step 2

## Tasks / Subtasks

- [x] Task 1: Add `get_closeout_summary` Rust command (AC: 1, 2)
  - [x] 1.1: In `src-tauri/src/commands/mod.rs`, add structs after the `BeginTurnTheMonthInput` struct (after line ~2847):
    ```rust
    #[derive(Debug, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct CloseoutSummaryInput {
        pub month_id: i64,
    }

    #[derive(Debug, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct CloseoutSummary {
        /// Sum of allocated_cents for all non-savings envelopes.
        pub total_allocated_cents: i64,
        /// Net spend for non-savings envelopes in the closing month.
        /// SUM(-amount_cents) for transactions in month date range — positive = money spent.
        /// Can be negative if refunds exceed charges (rare, but valid).
        pub total_spent_cents: i64,
        /// true when total_spent_cents <= total_allocated_cents.
        pub stayed_in_budget: bool,
        /// max(0, total_spent_cents - total_allocated_cents). 0 when in budget.
        pub overspend_cents: i64,
        /// Net savings flow for the month: SUM(-amount_cents) for savings envelope transactions.
        /// Positive = deposit (money going into savings), negative = withdrawal.
        pub savings_flow_cents: i64,
        /// Name of the first envelope found to be over budget 2+ consecutive months, if any.
        pub drift_envelope_name: Option<String>,
    }
    ```
  - [x] 1.2: Add `get_closeout_summary_inner` immediately before the `#[cfg(test)]` block (after `begin_turn_the_month`):
    ```rust
    fn get_closeout_summary_inner(
        conn: &rusqlite::Connection,
        input: &CloseoutSummaryInput,
    ) -> Result<CloseoutSummary, AppError> {
        // Fetch month record
        let (year, month): (i64, i64) = conn.query_row(
            "SELECT year, month FROM months WHERE id = ?1",
            rusqlite::params![input.month_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError {
                code: "MONTH_NOT_FOUND".to_string(),
                message: format!("No month found with id {}", input.month_id),
            },
            other => AppError::from(other),
        })?;

        // Compute date range strings for the closing month
        let curr_start = format!("{:04}-{:02}-01", year, month);
        let (next_year, next_month) = if month == 12 { (year + 1, 1i64) } else { (year, month + 1) };
        let next_start = format!("{:04}-{:02}-01", next_year, next_month);
        let (prev_year, prev_month) = if month == 1 { (year - 1, 12i64) } else { (year, month - 1) };
        let prev_start = format!("{:04}-{:02}-01", prev_year, prev_month);

        // Budget: total allocated for non-savings envelopes
        let total_allocated_cents: i64 = conn.query_row(
            "SELECT COALESCE(SUM(allocated_cents), 0) FROM envelopes WHERE is_savings = 0",
            [],
            |row| row.get(0),
        )?;

        // Budget: total spent (non-savings) in closing month.
        // SUM(-amount_cents): expenses have negative amount_cents → positive spend.
        let total_spent_cents: i64 = conn.query_row(
            "SELECT COALESCE(SUM(-t.amount_cents), 0) \
             FROM transactions t \
             JOIN envelopes e ON t.envelope_id = e.id \
             WHERE e.is_savings = 0 \
               AND t.date >= ?1 AND t.date < ?2",
            rusqlite::params![curr_start, next_start],
            |row| row.get(0),
        )?;

        let stayed_in_budget = total_spent_cents <= total_allocated_cents;
        let overspend_cents = if stayed_in_budget { 0 } else { total_spent_cents - total_allocated_cents };

        // Savings flow for closing month: SUM(-amount_cents) for savings envelope.
        // Positive = deposit (money entering savings account).
        let savings_flow_cents: i64 = conn.query_row(
            "SELECT COALESCE(SUM(-t.amount_cents), 0) \
             FROM transactions t \
             JOIN envelopes e ON t.envelope_id = e.id \
             WHERE e.is_savings = 1 \
               AND t.date >= ?1 AND t.date < ?2",
            rusqlite::params![curr_start, next_start],
            |row| row.get(0),
        )?;

        // Drift detection: first non-savings envelope over budget in BOTH the closing month
        // and the prior month. Only considers envelopes with allocated_cents > 0.
        let drift_envelope_name: Option<String> = conn.query_row(
            "WITH curr AS ( \
               SELECT t.envelope_id, COALESCE(SUM(-t.amount_cents), 0) AS spent \
               FROM transactions t \
               WHERE t.date >= ?1 AND t.date < ?2 \
               GROUP BY t.envelope_id \
             ), \
             prev AS ( \
               SELECT t.envelope_id, COALESCE(SUM(-t.amount_cents), 0) AS spent \
               FROM transactions t \
               WHERE t.date >= ?3 AND t.date < ?1 \
               GROUP BY t.envelope_id \
             ) \
             SELECT e.name \
             FROM envelopes e \
             LEFT JOIN curr c ON e.id = c.envelope_id \
             LEFT JOIN prev p ON e.id = p.envelope_id \
             WHERE e.is_savings = 0 \
               AND e.allocated_cents > 0 \
               AND COALESCE(c.spent, 0) > e.allocated_cents \
               AND COALESCE(p.spent, 0) > e.allocated_cents \
             ORDER BY e.name ASC \
             LIMIT 1",
            rusqlite::params![curr_start, next_start, prev_start],
            |row| row.get(0),
        ).optional()?;

        Ok(CloseoutSummary {
            total_allocated_cents,
            total_spent_cents,
            stayed_in_budget,
            overspend_cents,
            savings_flow_cents,
            drift_envelope_name,
        })
    }

    #[tauri::command]
    pub fn get_closeout_summary(
        state: State<DbState>,
        input: CloseoutSummaryInput,
    ) -> Result<CloseoutSummary, AppError> {
        let conn = state.0.lock().map_err(|_| AppError {
            code: "DB_LOCK_POISON".to_string(),
            message: "Database mutex was poisoned.".to_string(),
        })?;
        get_closeout_summary_inner(&conn, &input)
    }
    ```
    **Critical notes on SQL:**
    - `.optional()` on the drift query — import it if needed: `use rusqlite::OptionalExtension;`. This crate provides `.optional()` on `Result<T, rusqlite::Error>` to convert `QueryReturnedNoRows` → `Ok(None)`. Check if `OptionalExtension` is already imported at the top of `commands/mod.rs` (search `OptionalExtension`). If not, add `use rusqlite::OptionalExtension;` at the module top.
    - `curr_start`, `next_start`, `prev_start` are `&str`-like via `format!()` — pass as `rusqlite::params![curr_start, next_start, prev_start]`

  - [x] 1.3: Add Rust unit tests to the `month_tests` module in `commands/mod.rs`. Add these imports to the `month_tests` use block:
    ```rust
    use super::{CloseoutSummaryInput, get_closeout_summary_inner};
    use super::{CreateTransactionInput, create_transaction_inner};
    ```
    Tests to add:
    - `test_closeout_summary_empty_db` — fresh conn with a month inserted; call `get_closeout_summary_inner`; verify `total_allocated_cents = 0`, `total_spent_cents = 0`, `stayed_in_budget = true`, `overspend_cents = 0`, `savings_flow_cents = 0`, `drift_envelope_name = None`
    - `test_closeout_summary_stayed_in_budget` — insert month (2026, 3); insert non-savings envelope with `allocated_cents = 50000`; insert transaction with `amount_cents = -30000`, `date = "2026-03-15"`, `envelope_id = <envelope>`; call `get_closeout_summary_inner`; verify `total_spent_cents = 30000`, `stayed_in_budget = true`, `overspend_cents = 0`
    - `test_closeout_summary_overspent` — same setup but `amount_cents = -60000`; verify `stayed_in_budget = false`, `overspend_cents = 10000`
    - `test_closeout_summary_savings_flow_deposit` — insert month (2026, 3); insert savings envelope (`is_savings = true`); insert savings transaction with `amount_cents = -25000`, `date = "2026-03-10"`; verify `savings_flow_cents = 25000`
    - `test_closeout_summary_savings_flow_withdrawal` — savings transaction with `amount_cents = +15000`; verify `savings_flow_cents = -15000`
    - `test_closeout_summary_drift_detection` — insert month (2026, 3); insert envelope with `allocated_cents = 10000`; insert transaction (2026-02-15, `amount_cents = -12000`) and (2026-03-15, `amount_cents = -11000`); verify `drift_envelope_name = Some("Dining Out")` (use that name)
    - `test_closeout_summary_no_drift_one_month` — only one month overspent (current month only); verify `drift_envelope_name = None`
    - `test_closeout_summary_excludes_other_months` — transactions outside the closing month date range; verify `total_spent_cents` only counts the closing month

    **Pattern for inserting transactions in tests** — use `create_transaction_inner` OR direct SQL:
    ```rust
    conn.execute(
        "INSERT INTO transactions (payee, amount_cents, date, envelope_id) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params!["Test Payee", -30000i64, "2026-03-15", envelope_id],
    ).unwrap();
    ```

- [x] Task 2: Register `get_closeout_summary` in `src-tauri/src/lib.rs` (AC: 1)
  - [x] 2.1: In `src-tauri/src/lib.rs`, in the `invoke_handler!` macro, add `commands::get_closeout_summary,` after `commands::begin_turn_the_month,`

- [x] Task 3: Add TypeScript types to `src/lib/types.ts` (AC: 1, 2)
  - [x] 3.1: Add after the `CloseMonthInput` interface (at the end of the file):
    ```typescript
    // Input for get_closeout_summary Tauri command.
    export interface CloseoutSummaryInput {
      monthId: number;
    }

    // Returned by get_closeout_summary Tauri command.
    export interface CloseoutSummary {
      totalAllocatedCents: number;    // sum of allocated_cents for all non-savings envelopes
      totalSpentCents: number;        // SUM(-amount_cents) for non-savings txs in month
      stayedInBudget: boolean;        // totalSpentCents <= totalAllocatedCents
      overspendCents: number;         // 0 when in budget; totalSpentCents - totalAllocatedCents when over
      savingsFlowCents: number;       // positive = deposited this month, negative = withdrew
      driftEnvelopeName: string | null; // first envelope over budget 2+ months, or null
    }
    ```

- [x] Task 4: Create `CloseoutSummary.tsx` component (AC: 1, 2, 3)
  - [x] 4.1: Create `src/features/month/CloseoutSummary.tsx`:
    ```typescript
    import { useState, useEffect } from 'react';
    import { invoke } from '@tauri-apps/api/core';
    import type { CloseoutSummary as CloseoutSummaryData, AppError } from '@/lib/types';
    import { useSavingsStore } from '@/stores/useSavingsStore';
    import { formatCurrency } from '@/lib/currency';

    interface Props {
      monthId: number;
      year: number;
      month: number;
    }

    export default function CloseoutSummary({ monthId, year, month }: Props) {
      const [data, setData] = useState<CloseoutSummaryData | null>(null);
      const [loading, setLoading] = useState(true);
      const [fetchError, setFetchError] = useState<string | null>(null);

      // Runway data from savings store (already loaded by main screen; reload if needed for crash recovery)
      const runway = useSavingsStore((s) => s.runway());
      const runwayDelta = useSavingsStore((s) => s.runwayDelta());
      const loadReconciliations = useSavingsStore((s) => s.loadReconciliations);
      const loadAvgMonthlyEssentialSpend = useSavingsStore((s) => s.loadAvgMonthlyEssentialSpend);

      const monthLabel = `${year}-${String(month).padStart(2, '0')}`;

      useEffect(() => {
        // Fetch closeout summary from Rust
        invoke<CloseoutSummaryData>('get_closeout_summary', { input: { monthId } })
          .then(setData)
          .catch((e) => setFetchError((e as AppError).message ?? 'Failed to load summary'))
          .finally(() => setLoading(false));

        // Ensure savings store is hydrated (for crash recovery when store is cold)
        loadReconciliations();
        loadAvgMonthlyEssentialSpend();
      }, [monthId, loadReconciliations, loadAvgMonthlyEssentialSpend]);

      if (loading) {
        return (
          <div className="py-8 text-center type-body" style={{ color: 'var(--color-text-secondary)' }}>
            Loading summary...
          </div>
        );
      }

      if (fetchError || !data) {
        return (
          <div className="py-8 text-center type-body" style={{ color: 'var(--color-danger, #ff5555)' }}>
            {fetchError ?? 'Could not load summary.'}
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-6 py-4 px-2">
          {/* Month label */}
          <p className="type-label" style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
            {monthLabel}
          </p>

          {/* Drift detection note — appears first if present (informational, not a warning) */}
          {data.driftEnvelopeName && (
            <p className="type-body" style={{ color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              {data.driftEnvelopeName} has run over budget 2 months in a row — worth adjusting the target?
            </p>
          )}

          {/* Budget result */}
          <div className="flex flex-col gap-1">
            <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>Budget</span>
            {data.stayedInBudget ? (
              <span className="type-body" style={{ color: 'var(--color-accent)' }}>
                Stayed in budget
              </span>
            ) : (
              <span className="type-body" style={{ color: 'var(--color-danger, #ff5555)' }}>
                {formatCurrency(data.overspendCents)} over budget
              </span>
            )}
          </div>

          {/* Savings flow */}
          <div className="flex flex-col gap-1">
            <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>Savings this month</span>
            <span className="type-body" style={{ color: data.savingsFlowCents >= 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
              {data.savingsFlowCents >= 0
                ? `↓ ${formatCurrency(data.savingsFlowCents)} deposited`
                : `↑ ${formatCurrency(Math.abs(data.savingsFlowCents))} withdrawn`}
            </span>
          </div>

          {/* Runway */}
          <div className="flex flex-col gap-1">
            <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>Runway</span>
            <span className="type-body" style={{ color: 'var(--color-text-primary)' }}>
              {runway} {runway === 1 ? 'month' : 'months'}
              {runwayDelta !== null && runwayDelta !== 0 && (
                <span style={{ color: runwayDelta > 0 ? 'var(--color-accent)' : 'var(--color-danger, #ff5555)' }}>
                  {' '}({runwayDelta > 0 ? '+' : ''}{runwayDelta} {Math.abs(runwayDelta) === 1 ? 'month' : 'months'})
                </span>
              )}
            </span>
          </div>
        </div>
      );
    }
    ```
    **Design tokens used** (never hardcode hex — use CSS variables):
    - `var(--color-accent)` — lime, for positive outcomes (stayed in budget, deposit)
    - `var(--color-text-primary)` — primary text
    - `var(--color-text-secondary)` — secondary/muted content
    - `var(--color-text-muted)` — labels
    - `var(--color-danger, #ff5555)` — overspend, withdrawals (fallback if token not defined)
    - Typography: `type-label`, `type-body` CSS class names from design system

- [x] Task 5: Update `TurnTheMonthWizard.tsx` to render `CloseoutSummary` for step 1 (AC: 1, 2, 3, 4)
  - [x] 5.1: In `src/features/month/TurnTheMonthWizard.tsx`:
    - Add import: `import CloseoutSummary from './CloseoutSummary';`
    - Replace the `StepContent` function entirely with a new one that renders `CloseoutSummary` for step 1 and retains placeholders for steps 2–4:
      ```typescript
      function StepContent({ step, monthId, year, month }: { step: number; monthId: number; year: number; month: number }) {
        if (step === 1) {
          return <CloseoutSummary monthId={monthId} year={year} month={month} />;
        }
        return (
          <div style={{ color: 'var(--color-text-secondary)' }} className="py-8 type-body text-center">
            {STEP_TITLES[step]} — implementation coming in Story 6.{step + 2}
          </div>
        );
      }
      ```
    - Update the `TurnTheMonthWizard` component body to read `currentMonth` from the store and pass props to `StepContent`:
      ```typescript
      const { monthStatus, advanceStep, closeMonth, isWriting, error, currentMonth } = useMonthStore();
      ```
      And update the `StepContent` render to:
      ```typescript
      <StepContent
        step={viewStep}
        monthId={currentMonth?.id ?? 0}
        year={currentMonth?.year ?? 0}
        month={currentMonth?.month ?? 0}
      />
      ```
    - No other changes to `TurnTheMonthWizard` — the `handleContinue`, `handleBack`, step navigation logic, and Stepper props remain unchanged.

- [x] Task 6: Write `CloseoutSummary.test.tsx` (AC: 1, 2, 3)
  - [x] 6.1: Create `src/features/month/CloseoutSummary.test.tsx` with tests:
    - Set up `vi.mock('@tauri-apps/api/core')` and `vi.mock('@/stores/useSavingsStore')`
    - `shows loading state initially` — render; before invoke resolves, assert "Loading summary..." text is present
    - `displays stayed in budget result` — mock `invoke` returning `stayedInBudget: true`, `overspendCents: 0`, `savingsFlowCents: 25000`, `driftEnvelopeName: null`; mock `useSavingsStore` returning `runway: 6, runwayDelta: null`; assert "Stayed in budget" is visible
    - `displays overspend result` — mock `overspendCents: 10000`, `stayedInBudget: false`; assert overspend text visible
    - `displays savings deposit` — mock `savingsFlowCents: 30000`; assert "deposited" text visible
    - `displays savings withdrawal` — mock `savingsFlowCents: -15000`; assert "withdrawn" text visible
    - `displays drift note when envelope drifted` — mock `driftEnvelopeName: "Dining Out"`; assert drift message contains "Dining Out" and "2 months in a row"
    - `does not display drift note when null` — mock `driftEnvelopeName: null`; assert no text matching "months in a row"
    - `displays runway with delta` — mock `runway: 8, runwayDelta: 2`; assert "+2" visible
    - `shows error on fetch failure` — mock `invoke` to reject; assert error text visible
    - **Mock pattern for `useSavingsStore`:**
      ```typescript
      vi.mock('@/stores/useSavingsStore', () => ({
        useSavingsStore: (selector: (s: unknown) => unknown) => {
          const store = {
            runway: () => 6,
            runwayDelta: () => null,
            loadReconciliations: vi.fn(),
            loadAvgMonthlyEssentialSpend: vi.fn(),
          };
          return selector(store);
        },
      }));
      ```

- [x] Task 7: Run full test suite (AC: all)
  - [x] 7.1: Run `npm test` — all new CloseoutSummary component tests pass; all existing TurnTheMonthWizard and TurnTheMonthStepper tests pass; no new regressions. Pre-existing 13 BorrowOverlay failures and 4 lint errors remain — do not investigate.
  - [x] 7.2: Run `npm run lint` — no new lint errors.
  - [x] 7.3: Run `cargo test` in `src-tauri/` — all new `get_closeout_summary` tests pass; all existing month tests pass.

## Dev Notes

### What Already Exists — DO NOT Recreate

| What | Where | Note |
|------|-------|------|
| `TurnTheMonthWizard` | `src/features/month/TurnTheMonthWizard.tsx` | Step content component — update `StepContent` only; leave wizard logic untouched |
| `TurnTheMonthStepper` | `src/features/month/TurnTheMonthStepper.tsx` | Shell — do not modify |
| `useMonthStore` | `src/stores/useMonthStore.ts` | Has `currentMonth` (Month \| null), `monthStatus`, `advanceStep`, `closeMonth`, `isWriting`, `error` |
| `useSavingsStore` | `src/stores/useSavingsStore.ts` | Has `runway()` getter, `runwayDelta()` getter, `loadReconciliations()`, `loadAvgMonthlyEssentialSpend()` |
| `advance_turn_the_month_step` | `src-tauri/src/commands/mod.rs` | Already advances `closing:step-1 → closing:step-2` — reuse as-is; step advance is triggered by Continue in wizard (no change needed) |
| `row_to_month` | `src-tauri/src/commands/mod.rs` | Standalone fn — do NOT use in new command (new command doesn't return Month) |
| `month_tests` module | `src-tauri/src/commands/mod.rs` | Existing test module with `fresh_conn()`, `insert_month()` helpers — reuse these in new tests |
| `formatCurrency` | `src/lib/currency.ts` | Import for all currency display — never display raw cents |
| Design tokens | `src/lib/design-tokens.ts` + CSS | All via CSS variables (see Design Token section below) |
| `src/features/month/` folder | Confirmed in 6.2 dev notes | Use this folder — NOT `src/features/turn-the-month/` |

### Feature Folder: Use `src/features/month/` NOT `src/features/turn-the-month/`

Architecture doc mentions `src/features/turn-the-month/` but the actual project created `src/features/month/` (confirmed 6.1 and 6.2). All new files go into `src/features/month/`. Do NOT create `src/features/turn-the-month/`.

### All Commands in `commands/mod.rs` (Single File)

Architecture mentions `commands/months.rs` but the project uses a single `commands/mod.rs` for ALL commands (confirmed pattern epics 1–6). Add `get_closeout_summary` alongside the other month commands in `commands/mod.rs`. Do NOT create `commands/months.rs`.

### Transaction Sign Convention

For ALL transactions (both savings and regular envelopes):
- `amount_cents < 0` = money leaving checking (expense / savings deposit)
- `amount_cents > 0` = money entering checking (income / savings withdrawal)

Therefore: `SUM(-amount_cents)` on regular transactions = total money spent (positive value for net spend).

For savings: `SUM(-amount_cents)` = positive when depositing (money flowing into savings account).

This matches the existing `get_avg_monthly_essential_spend_cents_inner` and `get_savings_flow_by_month_inner` patterns in `commands/mod.rs`.

### `rusqlite::OptionalExtension` for Drift Query

The drift detection query uses `.optional()` to convert `QueryReturnedNoRows → Ok(None)`. This requires the `OptionalExtension` trait:
- Search `commands/mod.rs` for `OptionalExtension` to check if it's already used elsewhere in the file
- If found: no new import needed (already in scope)
- If not found: add `use rusqlite::OptionalExtension;` at the module top, or use it fully qualified as needed

### DB_LOCK_POISON Pattern

Every command acquires the mutex with this exact pattern (copy from existing commands):
```rust
let conn = state.0.lock().map_err(|_| AppError {
    code: "DB_LOCK_POISON".to_string(),
    message: "Database mutex was poisoned.".to_string(),
})?;
```

### Invoke Pattern for `get_closeout_summary`

```typescript
invoke<CloseoutSummary>('get_closeout_summary', { input: { monthId } })
```
The `input` key matches the Rust parameter name; camelCase `monthId` matches via `serde(rename_all = "camelCase")`.

### Runway Display — Frontend Derived, Not Rust Computed

The runway metric is NOT computed in the new `get_closeout_summary` Rust command. Instead:
- `useSavingsStore.runway()` = current runway in whole months (uses `deriveRunway` in `src/lib/deriveRunway.ts`)
- `useSavingsStore.runwayDelta()` = change from previous reconciliation (or `null` if only 1 reconciliation exists)

The `CloseoutSummary` component reads both from `useSavingsStore`. To handle crash recovery (app restarted in `closing:step-1` with cold store), call `loadReconciliations()` and `loadAvgMonthlyEssentialSpend()` in `useEffect` — these are safe to call repeatedly (they just refresh state).

### Drift Detection — 2 Consecutive Month Rule

The SQL CTE checks:
- Current month transactions WHERE `date >= curr_start AND date < next_start`
- Previous month transactions WHERE `date >= prev_start AND date < curr_start`

Both must have `SUM(-amount_cents) > envelope.allocated_cents` for the drift note to fire. Only envelopes with `allocated_cents > 0` are considered (can't be "over budget" on a zero-allocation envelope).

Returns ONLY the first match (ORDER BY name ASC, LIMIT 1) — the AC says "a single plain-language observational note."

### Design System Token Usage

Use CSS variables — never hardcode hex. Tokens in use:
- Background: `var(--color-bg-app)` — app background (used by Stepper shell, not CloseoutSummary)
- Text primary: `var(--color-text-primary)`
- Text secondary: `var(--color-text-secondary)`
- Text muted: `var(--color-text-muted)`
- Accent (lime): `var(--color-accent)` — positive outcomes (stayed in budget, deposit, +runway)
- Danger: `var(--color-danger, #ff5555)` — negative outcomes (overspend, withdrawal, -runway)
- Typography classes: `type-label` (small caps-style labels), `type-body` (body text)

### `CloseoutSummary` Component Design

Per UX spec: the drift note is **observational, not alarming** — presented in secondary text color, not red/danger. It reads as plain language, no icon, no animation.

Layout: vertical stack of sections (Budget, Savings, Runway), each with a `type-label` header and a `type-body` value. Drift note appears ABOVE these sections when present (per epics AC: "a single plain-language observational note appears").

### Step Advance (AC4) — No New Code Needed

When Tom presses Continue on step 1, `TurnTheMonthWizard.handleContinue()` calls `advanceStep(1)` → Rust `advance_turn_the_month_step` with `currentStep: 1` → status advances to `closing:step-2`. This path already exists from Story 6.2 — no modifications needed.

### Pre-existing Test Failures (From Story 6.2)

- **13 `BorrowOverlay.test.tsx` failures** — pre-existing, do NOT investigate
- **4 lint errors** in `OFXImporter.tsx`, `useTransactionStore.ts`, `useUpdateStore.test.ts` — pre-existing, do NOT fix
- Test count baseline from 6.2: Vitest 394 passed, Cargo 106 passed

### Architecture Compliance

- React components must NOT access SQLite directly — all DB via Tauri commands ✓
- Business logic (date arithmetic, aggregation) lives in Rust `get_closeout_summary_inner` ✓
- No new SQLite transactions needed — `get_closeout_summary` is read-only (no writes) ✓
- Zustand store action calls Tauri command with `invoke<ReturnType>('command_name', { input })` pattern ✓
- Design tokens from CSS variables only — no hardcoded hex ✓

### References

- Story 6.3 ACs: `_bmad-output/planning-artifacts/epics.md` lines 1131–1153
- Epic 6 overview: `_bmad-output/planning-artifacts/epics.md` line 1079
- ADR-4 (Month lifecycle state machine): `_bmad-output/planning-artifacts/architecture.md` line 81
- UX drift detection pattern: `_bmad-output/planning-artifacts/ux-design-specification.md` line 718
- UX informational tone ("informed, not judged"): `_bmad-output/planning-artifacts/ux-design-specification.md` line 120
- Existing TurnTheMonthWizard: `src/features/month/TurnTheMonthWizard.tsx`
- Existing TurnTheMonthStepper: `src/features/month/TurnTheMonthStepper.tsx`
- Existing useMonthStore: `src/stores/useMonthStore.ts`
- Existing useSavingsStore: `src/stores/useSavingsStore.ts`
- deriveRunway: `src/lib/deriveRunway.ts`
- Month commands: `src-tauri/src/commands/mod.rs` (month_tests module, get_savings_flow_by_month_inner for sign convention reference)
- lib.rs invoke handler: `src-tauri/src/lib.rs`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Added `use rusqlite::OptionalExtension;` at top of `commands/mod.rs` (not previously imported in this file; used for `.optional()` on drift detection query)
- `CreateEnvelopeInput.is_savings` is `Option<bool>` — test code uses `Some(true)`/`Some(false)` accordingly
- Updated `TurnTheMonthWizard.test.tsx` to add mocks for `useSavingsStore` and make `invoke` return a pending Promise (so `CloseoutSummary` stays in loading state during wizard navigation tests)

### Completion Notes List

- ✅ Task 1: `CloseoutSummaryInput` and `CloseoutSummary` structs added after `BeginTurnTheMonthInput` in `commands/mod.rs`; `get_closeout_summary_inner` and `get_closeout_summary` tauri command added before `#[cfg(test)]`
- ✅ Task 1.3: 8 Rust unit tests added to `month_tests` module covering empty DB, stayed-in-budget, overspent, savings deposit/withdrawal, drift detection (2-month), no drift (1-month), and date-range exclusion
- ✅ Task 2: `commands::get_closeout_summary` registered in `lib.rs` invoke handler
- ✅ Task 3: `CloseoutSummaryInput` and `CloseoutSummary` TypeScript interfaces added to `types.ts`
- ✅ Task 4: `CloseoutSummary.tsx` created with budget result, savings flow, runway, and drift detection sections using design tokens
- ✅ Task 5: `TurnTheMonthWizard.tsx` updated — `StepContent` renders `CloseoutSummary` at step 1, passes `monthId/year/month` from `currentMonth`
- ✅ Task 6: 9 Vitest component tests in `CloseoutSummary.test.tsx` (loading, stayed-in-budget, overspend, deposit, withdrawal, drift, no-drift, runway+delta, error)
- ✅ Task 7: Vitest 404 passed (13 pre-existing BorrowOverlay failures only); lint no new errors; Cargo 114 passed (8 new closeout summary tests)

### File List

- `src-tauri/src/commands/mod.rs` — added `CloseoutSummaryInput`, `CloseoutSummary` structs, `get_closeout_summary_inner`, `get_closeout_summary` command, `use rusqlite::OptionalExtension`, 8 unit tests
- `src-tauri/src/lib.rs` — registered `commands::get_closeout_summary` in invoke handler
- `src/lib/types.ts` — added `CloseoutSummaryInput` and `CloseoutSummary` interfaces
- `src/features/month/CloseoutSummary.tsx` — new component
- `src/features/month/CloseoutSummary.test.tsx` — new test file (9 tests)
- `src/features/month/TurnTheMonthWizard.tsx` — updated `StepContent`, added `currentMonth` destructure
- `src/features/month/TurnTheMonthWizard.test.tsx` — updated mocks for `useSavingsStore` and `invoke` (to support CloseoutSummary rendering at step 1)

### Review Findings

- [x] [Review][Decision] Savings arrow direction — resolved: removed arrows entirely; display is now plain "deposited" / "withdrawn" / "No savings activity this month" [`src/features/month/CloseoutSummary.tsx`]
- [x] [Review][Decision] Runway display emphasis — resolved: keep as-is (absolute + delta in parens); "runway change" interpreted as show both [`src/features/month/CloseoutSummary.tsx`]
- [x] [Review][Patch] Drift CTEs aggregate all transactions without filtering `amount_cents < 0` — fixed: added `AND t.amount_cents < 0` to both curr and prev CTEs [`src-tauri/src/commands/mod.rs`]
- [x] [Review][Patch] `monthId=0` passed to `CloseoutSummary` when `currentMonth` is null — fixed: `useEffect` guards with `if (monthId === 0) return` [`src/features/month/CloseoutSummary.tsx`]
- [x] [Review][Patch] `dbStep` defaults to `1` for non-`closing:step-N` monthStatus — fixed: `handleContinue` returns early if monthStatus is not a closing state [`src/features/month/TurnTheMonthWizard.tsx`]
- [x] [Review][Patch] No test for AC3 — fixed: added "drift note present does not block Continue — AC3" [`src/features/month/TurnTheMonthWizard.test.tsx`]
- [x] [Review][Patch] No test for AC4 — fixed: added "Continue on step 1 advances to closing:step-2 — AC4" [`src/features/month/TurnTheMonthWizard.test.tsx`]
- [x] [Review][Patch] `savingsFlowCents === 0` renders "deposited" — fixed: condition changed to `> 0`; zero now shows "No savings activity this month" [`src/features/month/CloseoutSummary.tsx`]
- [x] [Review][Defer] `total_allocated_cents` not month-scoped — query sums current envelope allocations with no date filter; if allocations change after closeout, re-running the summary produces different results [`src-tauri/src/commands/mod.rs:3194-3198`] — deferred, pre-existing schema design; summary is always viewed at closeout time before allocations change
- [x] [Review][Defer] `runwayDelta` compares transaction-adjusted current balance vs raw snapshot previous balance; the delta can be incorrect if significant transactions occurred since the prior reconciliation — deferred, pre-existing issue in `useSavingsStore.runwayDelta()`
- [x] [Review][Defer] Drift detection uses calendar arithmetic for the previous month window (`prev_start` = month - 1) rather than querying the last actually-closed month from the `months` table; semantically incorrect if user skips a month between closeouts — deferred, acceptable v1 tradeoff
- [x] [Review][Defer] `loadReconciliations()` and `loadAvgMonthlyEssentialSpend()` called unconditionally on every mount regardless of store hydration state — deferred, intentional crash-recovery design per dev notes

## Change Log

- 2026-04-09: Story 6.3 created — Closeout Summary step 1 implementation: get_closeout_summary Rust command, CloseoutSummary component, TurnTheMonthWizard step 1 wiring
- 2026-04-09: Code review complete — 2 decision-needed, 6 patch, 4 deferred, 4 dismissed
- 2026-04-09: Story 6.3 implemented — all 7 tasks complete; 9 Vitest + 8 Cargo tests added; status → review
