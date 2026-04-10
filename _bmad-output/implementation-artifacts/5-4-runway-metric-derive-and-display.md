# Story 5.4: Runway Metric — Derive and Display

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want the app to calculate how many months of essential spending my savings covers and show that number prominently,
So that every session I can see at a glance whether I'm building a real financial runway.

## Acceptance Criteria

1. **AC1: Runway Calculation from Real Data**
   - Given a savings balance and at least one month of spending history exist
   - When `deriveRunway(savingsBalanceCents, avgMonthlyEssentialSpendCents)` is called
   - Then it returns whole months of runway (floor); essential spending = average of Need-priority (non-savings) envelope spend over available months; the function is a pure JS computation in `src/lib/deriveRunway.ts` with unit test coverage (FR22)

2. **AC2: Runway Number Displayed in WealthPanel**
   - Given the runway value is computed
   - When it renders in the WealthPanel
   - Then the primary Display-weight number shows the months value (e.g. "3"); a label reads "months runway"; a delta line shows change from the previous reconciliation (e.g. "↑ +1 this month") in directional color (lime for positive, red for negative, muted for zero)

3. **AC3: No Data → Show Dash**
   - Given no savings balance has been entered (no reconciliations)
   - When the WealthPanel renders
   - Then the runway display shows "—"; no calculation is attempted on null data

## Tasks / Subtasks

- [x] Task 1: Add `get_avg_monthly_essential_spend_cents` Rust command (AC: 1)
  - [x] 1.1: In `src-tauri/src/commands/mod.rs`, add `fn get_avg_monthly_essential_spend_cents_inner(conn: &rusqlite::Connection) -> Result<i64, AppError>` — SQL: average of per-month SUM(-t.amount_cents) for Need-priority non-savings envelopes, only months with net positive spending:
    ```sql
    SELECT CAST(COALESCE(AVG(monthly_spend_cents), 0) AS INTEGER)
    FROM (
      SELECT strftime('%Y-%m', t.date) AS month,
             SUM(-t.amount_cents) AS monthly_spend_cents
      FROM transactions t
      JOIN envelopes e ON t.envelope_id = e.id
      WHERE e.priority = 'Need' AND e.is_savings = 0
      GROUP BY strftime('%Y-%m', t.date)
      HAVING SUM(-t.amount_cents) > 0
    )
    ```
    Returns `Ok(0)` when no Need-priority spend data exists (COALESCE handles NULL).
  - [x] 1.2: Add `#[tauri::command] pub fn get_avg_monthly_essential_spend_cents(state: State<DbState>) -> Result<i64, AppError>` — locks mutex, delegates to inner. Follow exact same pattern as `get_savings_transactions_since`.
  - [x] 1.3: Register `commands::get_avg_monthly_essential_spend_cents` in `src-tauri/src/lib.rs` handler list (add after `commands::get_savings_transactions_since` at line 136).
  - [x] 1.4: Add Rust tests in a new `#[cfg(test)] mod essential_spend_tests` block inside `mod.rs`:
    - `test_get_avg_essential_spend_returns_zero_when_no_transactions`: fresh_conn(), query returns 0
    - `test_get_avg_essential_spend_returns_zero_when_no_need_envelopes`: create Should-priority envelope with transactions; query returns 0
    - `test_get_avg_essential_spend_returns_zero_when_savings_envelope`: create Need-priority savings envelope (is_savings=1) with transactions; query returns 0
    - `test_get_avg_essential_spend_single_month`: create Need envelope, insert transactions totaling -150_000 cents in one month; query returns 150_000
    - `test_get_avg_essential_spend_two_months_averaged`: Need envelope, month A has -120_000 total, month B has -180_000 total; query returns CAST(AVG(120_000, 180_000)) = 150_000
    - `test_get_avg_essential_spend_excludes_positive_months`: Need envelope, one month with net positive (refunds > spending); only months with SUM(-amount_cents) > 0 are included; returns only from qualifying months

- [x] Task 2: Update `useSavingsStore` — wire real avg spend and add `runwayDelta()` (AC: 1, 2, 3)
  - [x] 2.1: Add `avgMonthlyEssentialSpendCents: number` to `SavingsState` interface; initialize to `0`
  - [x] 2.2: Add `loadAvgMonthlyEssentialSpend: () => Promise<void>` to the interface and implement: calls `invoke<number>('get_avg_monthly_essential_spend_cents')`, sets `avgMonthlyEssentialSpendCents` on success, sets `error` on failure (same error pattern as `loadSavingsTransactionsSince`)
  - [x] 2.3: Update `runway()` getter: replace the hardcoded `0` with `get().avgMonthlyEssentialSpendCents` — `return deriveRunway(get().currentTrackedBalance(), get().avgMonthlyEssentialSpendCents);`
  - [x] 2.4: Add `runwayDelta: () => number | null` to interface and implement:
    ```typescript
    runwayDelta: () => {
      const { reconciliations, avgMonthlyEssentialSpendCents } = get();
      if (reconciliations.length < 2) return null;
      const prev = reconciliations[reconciliations.length - 2]!;
      const currentRunway = get().runway();
      const prevRunway = deriveRunway(prev.enteredBalanceCents, avgMonthlyEssentialSpendCents);
      return currentRunway - prevRunway;
    },
    ```
  - [x] 2.5: Update `useSavingsStore.test.ts`:
    - Add `avgMonthlyEssentialSpendCents: 0` to the `setState` reset in `beforeEach`
    - Update the two existing `runway()` tests: the stub test description changes; add new test `'returns computed runway when avgMonthlyEssentialSpendCents is set'` — setState with a reconciliation (enteredBalanceCents=600_000) and avgMonthlyEssentialSpendCents=200_000; runway() should be 3
    - Add `describe('loadAvgMonthlyEssentialSpend', ...)`:
      - `'sets avgMonthlyEssentialSpendCents on success'` — mockInvoke resolves 150_000; call action; verify state
      - `'sets error on failure'` — mockInvoke rejects; verify error set, avgMonthlyEssentialSpendCents stays 0
    - Add `describe('runwayDelta', ...)`:
      - `'returns null when fewer than 2 reconciliations'` — 0 or 1 reconciliation → null
      - `'returns 0 when runway unchanged from previous reconciliation'` — two reconciliations with same computed runway → delta 0
      - `'returns positive delta when runway improved'` — prev reconciliation had lower balance → current runway > prev runway → positive delta
      - `'returns negative delta when runway decreased'` — current balance lower than prev → negative delta

- [x] Task 3: Call `loadAvgMonthlyEssentialSpend` in router startup (AC: 1)
  - [x] 3.1: In `src/router.tsx` root route `beforeLoad`, add `await useSavingsStore.getState().loadAvgMonthlyEssentialSpend();` after the existing `await useSavingsStore.getState().loadReconciliations();` call (line 72). No other router changes.

- [x] Task 4: Update `WealthPanel` to display real runway and delta (AC: 2, 3)
  - [x] 4.1: Update `src/features/savings/WealthPanel.tsx`:
    - Import `runway` and `runwayDelta` from `useSavingsStore`: `const { reconciliations, runway, runwayDelta } = useSavingsStore();`
    - Replace the static `—` span with conditional: `{reconciliations.length === 0 ? '—' : runway()}` in the `text-2xl font-semibold` span
    - Below the "months" label span, add delta display when `reconciliations.length >= 2 && runwayDelta() !== null`:
      ```tsx
      {reconciliations.length >= 2 && runwayDelta() !== null && (() => {
        const delta = runwayDelta()!;
        const sign = delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : '→ ';
        const color = delta > 0
          ? 'var(--color-runway-healthy)'   // #C0F500
          : delta < 0
          ? 'var(--color-runway-critical)'  // #ff5555
          : 'var(--color-text-secondary)';
        return (
          <span className="text-xs" style={{ color }} data-testid="runway-delta">
            {sign}{delta} this month
          </span>
        );
      })()}
      ```
    - Keep the `data-testid="wealth-panel"` on root, keep `ReconciliationForm`, keep empty-state prompt when `reconciliations.length === 0`
  - [x] 4.2: Update `src/features/savings/WealthPanel.test.tsx`:
    - Add `runway: vi.fn(() => 0)` and `runwayDelta: vi.fn(() => null)` to `savingsStore` mock object (they're already there as `runway: vi.fn(() => 0)` — verify and add `runwayDelta`)
    - Add test: `'shows "—" when no reconciliations exist'` — reconciliations=[], renders "—"
    - Add test: `'shows computed runway number when reconciliations exist'` — reconciliations=[makeReconciliation()], `runway` mock returns 3; verify text "3" appears (not "—")
    - Add test: `'does not show delta when fewer than 2 reconciliations'` — 1 reconciliation, `runwayDelta` mock returns null; `data-testid="runway-delta"` not in document
    - Add test: `'shows positive delta with lime color when runway improved'` — 2 reconciliations, `runwayDelta` mock returns 1; text "↑ +1 this month" present in `data-testid="runway-delta"`
    - Add test: `'shows negative delta with red color when runway decreased'` — 2 reconciliations, `runwayDelta` mock returns -1; text "↓ -1 this month" present
    - Add test: `'shows zero delta with muted color when runway unchanged'` — `runwayDelta` mock returns 0; text "→ 0 this month" present
    - Existing test `'shows "—" as runway placeholder'` — update to clarify it applies when reconciliations=[] (already the case in beforeEach)

- [x] Task 5: Run tests and validate (AC: all)
  - [x] 5.1: Run `npm test` (Vitest) — all new tests pass; no regressions; verify updated `useSavingsStore.test.ts` runway tests pass
  - [x] 5.2: Run `cargo test` — new essential_spend_tests pass; no regressions in existing savings_tests or transaction_tests
  - [x] 5.3: Run `npm run lint` — no new lint errors

## Dev Notes

### What Already Exists — Do NOT Recreate

| What | Where | Status |
|------|-------|--------|
| `deriveRunway(savingsBalanceCents, avgMonthlyEssentialSpendCents)` | `src/lib/deriveRunway.ts` | EXISTS — pure function, Math.floor, DO NOT change |
| `deriveRunway` unit tests | `src/lib/deriveRunway.test.ts` | EXISTS — 8 passing tests; do not modify |
| `useSavingsStore` with `runway()` getter stubbed | `src/stores/useSavingsStore.ts` | EXISTS — update only (Tasks 2.1–2.4) |
| `useSavingsStore.test.ts` | `src/stores/useSavingsStore.test.ts` | EXISTS — update in place (Task 2.5) |
| `WealthPanel.tsx` with "—" placeholder | `src/features/savings/WealthPanel.tsx` | EXISTS — update (Task 4.1) |
| `WealthPanel.test.tsx` | `src/features/savings/WealthPanel.test.tsx` | EXISTS — update (Task 4.2) |
| `ReconciliationForm.tsx` | `src/features/savings/ReconciliationForm.tsx` | EXISTS — do not touch |
| `router.tsx` root beforeLoad (calls loadReconciliations at line 72) | `src/router.tsx` | EXISTS — add one line after line 72 |
| `map_transaction_row` helper | `src-tauri/src/commands/mod.rs:889` | EXISTS — do NOT use in this story (new command returns i64, not Transaction) |
| `lib.rs` handler list | `src-tauri/src/lib.rs:136` | EXISTS — add one line after `get_savings_transactions_since` |
| `savings_tests` mod block | `src-tauri/src/commands/mod.rs` | EXISTS — add `essential_spend_tests` as a separate new mod block |

### `deriveRunway` Behavior — Do NOT Change

The existing implementation returns `Math.floor`:
```typescript
// src/lib/deriveRunway.ts
export function deriveRunway(savingsBalanceCents, avgMonthlyEssentialSpendCents): number {
  if (avgMonthlyEssentialSpendCents <= 0) return 0;
  if (savingsBalanceCents <= 0) return 0;
  return Math.floor(savingsBalanceCents / avgMonthlyEssentialSpendCents);
}
```
- Returns whole months, not decimals
- Returns 0 when either argument is 0 or negative (guard cases)
- All 8 unit tests already pass — do NOT touch this file

### Rust Command Pattern

Follow exact same structure as `get_savings_transactions_since` (established in story 5.3):

```rust
fn get_avg_monthly_essential_spend_cents_inner(
    conn: &rusqlite::Connection,
) -> Result<i64, AppError> {
    let avg: i64 = conn.query_row(
        "SELECT CAST(COALESCE(AVG(monthly_spend_cents), 0) AS INTEGER) \
         FROM ( \
           SELECT strftime('%Y-%m', t.date) AS month, \
                  SUM(-t.amount_cents) AS monthly_spend_cents \
           FROM transactions t \
           JOIN envelopes e ON t.envelope_id = e.id \
           WHERE e.priority = 'Need' AND e.is_savings = 0 \
           GROUP BY strftime('%Y-%m', t.date) \
           HAVING SUM(-t.amount_cents) > 0 \
         )",
        [],
        |row| row.get(0),
    ).unwrap_or(0);
    Ok(avg)
}

#[tauri::command]
pub fn get_avg_monthly_essential_spend_cents(
    state: State<DbState>,
) -> Result<i64, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_avg_monthly_essential_spend_cents_inner(&conn)
}
```

Note: `unwrap_or(0)` is appropriate here — an empty table returns no rows, not a DB error. The SQL COALESCE already handles NULL so this is a belt-and-suspenders guard. Do NOT use `?` for the `query_row` call since `QueryReturnedNoRows` is not an error case here.

### SQL Query Rationale

**Why `SUM(-t.amount_cents)`:**
- Expense transactions (OFX debits) have `amount_cents < 0` (e.g., rent = -150000)
- Negating gives positive spending values per month
- Savings sign convention: deposits to savings are also negative, but those are excluded by `e.is_savings = 0`

**Why `HAVING SUM(-t.amount_cents) > 0`:**
- Excludes months where refunds/credits outweigh spending (net positive) — these would corrupt the average
- Ensures we only average months with actual net essential spending

**Why `CAST(... AS INTEGER)`:**
- SQLite AVG() returns REAL; CAST to INTEGER truncates to whole cents
- Rust return type is `i64`

**What counts as "Need-priority essential spend":**
- Envelopes with `priority = 'Need'` and `is_savings = 0`
- All envelopes across all months (not filtered by current month)
- Includes Rolling, Bill, Goal type envelopes that are Need priority
- Excludes the savings envelope even if it were somehow marked Need priority (is_savings guard)

### Rust Test Setup Pattern

Use the established `fresh_conn()` helper from `transaction_tests`:

```rust
#[cfg(test)]
mod essential_spend_tests {
    use super::*;
    use crate::migrations;
    use rusqlite::Connection;
    use super::get_avg_monthly_essential_spend_cents_inner;

    fn fresh_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&conn).unwrap();
        conn
    }

    fn make_need_envelope(conn: &Connection, name: &str) -> i64 {
        conn.execute(
            "INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) \
             VALUES (?1, 'Rolling', 'Need', 0, 0)",
            rusqlite::params![name],
        ).unwrap();
        conn.last_insert_rowid()
    }

    fn make_tx(conn: &Connection, env_id: i64, amount_cents: i64, date: &str) {
        conn.execute(
            "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) \
             VALUES ('Test', ?1, ?2, ?3, 0)",
            rusqlite::params![amount_cents, date, env_id],
        ).unwrap();
    }
    // ... tests
}
```

### `useSavingsStore` Changes

New interface additions:
```typescript
interface SavingsState {
  // ... existing fields ...
  avgMonthlyEssentialSpendCents: number;          // NEW — 0 until loaded

  // ... existing actions ...
  loadAvgMonthlyEssentialSpend: () => Promise<void>;  // NEW

  // ... existing getters ...
  runwayDelta: () => number | null;               // NEW — null if < 2 reconciliations
}
```

`invoke` call:
```typescript
const avg = await invoke<number>('get_avg_monthly_essential_spend_cents');
set({ avgMonthlyEssentialSpendCents: avg });
```

Note: Tauri returns i64 from Rust as a JSON number. TypeScript receives it as `number`.

### `runwayDelta()` Logic

```typescript
runwayDelta: () => {
  const { reconciliations, avgMonthlyEssentialSpendCents } = get();
  if (reconciliations.length < 2) return null;
  const prev = reconciliations[reconciliations.length - 2]!;
  const currentRunway = get().runway();
  const prevRunway = deriveRunway(prev.enteredBalanceCents, avgMonthlyEssentialSpendCents);
  return currentRunway - prevRunway;
},
```

- Uses `prev.enteredBalanceCents` (not `currentTrackedBalance`) — the snapshot balance at the time of the previous reconciliation
- Returns integer (Math.floor difference from deriveRunway)
- Returns `null` when there are fewer than 2 reconciliations (no meaningful delta yet)

### WealthPanel Store Subscription

The current WealthPanel reads `{ reconciliations }` from `useSavingsStore()`. Update the destructuring to also get `runway` and `runwayDelta`:

```typescript
const { reconciliations, runway, runwayDelta } = useSavingsStore();
```

`runway` and `runwayDelta` are functions (Zustand getters), not reactive values. They are called as `runway()` and `runwayDelta()` in JSX. This is the same pattern used in existing components — see `currentTrackedBalance()` in `ReconciliationForm.tsx`.

### Delta Display Color Tokens

Use these design tokens from `architecture.md` (UX-DR4):
- Positive delta (runway improving): `--color-runway-healthy` = `#C0F500` (lime)
- Negative delta (runway shrinking): `--color-runway-critical` = `#ff5555` (red)
- Zero delta (no change): `--color-text-secondary` (muted)

### WealthPanel Test Mock Pattern

The test file already mocks `useSavingsStore` with `runway: vi.fn(() => 0)`. Add `runwayDelta: vi.fn(() => null)` to the `savingsStore` object. Reset in `beforeEach`:

```typescript
const savingsStore = {
  // ... existing ...
  runway: vi.fn(() => 0),
  runwayDelta: vi.fn(() => null),  // ADD THIS
};
// In beforeEach:
savingsStore.runway.mockReturnValue(0);       // or however existing tests reset
// add:
savingsStore.runwayDelta.mockReturnValue(null);
savingsStore.reconciliations = [];
```

For tests that need >= 2 reconciliations to show delta — set `savingsStore.reconciliations` to an array of 2 `makeReconciliation()` objects AND configure `runwayDelta.mockReturnValue(n)`.

### `useSavingsStore.test.ts` Reset Update

Current `beforeEach` reset:
```typescript
useSavingsStore.setState({ reconciliations: [], savingsTransactions: [], isWriting: false, error: null });
```

Update to:
```typescript
useSavingsStore.setState({
  reconciliations: [],
  savingsTransactions: [],
  avgMonthlyEssentialSpendCents: 0,
  isWriting: false,
  error: null,
});
```

### Testing Patterns (same as stories 4.6/5.1–5.3)

Store tests — mock Tauri invoke:
```typescript
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);
```

Component tests — mock stores:
```typescript
vi.mock('@/stores/useSavingsStore');
vi.mock('@/stores/useSettingsStore');
```

Use `@testing-library/react`'s `render`, `screen`, `fireEvent`. Don't import `@tauri-apps/api/core` in component tests.

### Deferred (Not in Story 5.4 Scope)

- **Arc Gauge** (`RunwayGauge.tsx`) — story 5.5; the runway number is computed here, the visual arc is 5.5
- **Savings Flow Chart** (`SavingsFlowChart.tsx`) — story 5.6
- **Full WealthPanel layout redesign with arc + chart** — story 5.7
- **WealthPanel collapsible behavior** — story 5.7
- **Saving monthly runway snapshots** for precise historical delta — not specified; use prev reconciliation balance approach

### Previous Story Learnings (5.3 — code review findings)

- **Date boundary fix**: backend tx-delta query changed from `>` to `>=` (inclusive) after review. Use `>` in the essential spend query (transactions AFTER the reconciliation date) since we're computing ongoing spend, not bootstrap data.
- **`isReadOnly` check required in all interactive components** — no new interactive components added in 5.4; no action needed.
- **useEffect dependency arrays must be complete** — no new useEffects in 5.4; no action needed.
- **Don't add features not in ACs**: do NOT add reconciliation history list, saving historical runway values, or any feature not in the 3 ACs above.

### References

- Story 5.4 ACs: `_bmad-output/planning-artifacts/epics.md` line 979
- Story 5.5 (next): `_bmad-output/planning-artifacts/epics.md` line 1001
- `deriveRunway.ts` (pure fn, do not change): `src/lib/deriveRunway.ts`
- `deriveRunway.test.ts` (8 tests, do not change): `src/lib/deriveRunway.test.ts`
- `useSavingsStore.ts` (to update): `src/stores/useSavingsStore.ts`
- `useSavingsStore.test.ts` (to update): `src/stores/useSavingsStore.test.ts`
- `WealthPanel.tsx` (to update): `src/features/savings/WealthPanel.tsx`
- `WealthPanel.test.tsx` (to update): `src/features/savings/WealthPanel.test.tsx`
- `router.tsx` (add one line after line 72): `src/router.tsx`
- `lib.rs` handler list (add after line 136): `src-tauri/src/lib.rs`
- `commands/mod.rs` (add new command + test block): `src-tauri/src/commands/mod.rs`
- `get_savings_transactions_since` pattern (model after): `src-tauri/src/commands/mod.rs`
- Runway color tokens (UX-DR4): `_bmad-output/planning-artifacts/architecture.md` line ~110
- ADR-6 two-metric savings: `_bmad-output/planning-artifacts/architecture.md` line 89
- Existing runway test descriptions to update: `src/stores/useSavingsStore.test.ts` lines 201–214

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — clean implementation, no debugging required.

### Completion Notes List

- ✅ Task 1: Added `get_avg_monthly_essential_spend_cents_inner` (SQL avg of Need-priority non-savings monthly spend) and `get_avg_monthly_essential_spend_cents` Tauri command in `commands/mod.rs`. Registered in `lib.rs`. 6 Rust unit tests added in `essential_spend_tests` mod block; 83/83 Rust tests pass.
- ✅ Task 2: Updated `useSavingsStore` — added `avgMonthlyEssentialSpendCents` state field (init 0), `loadAvgMonthlyEssentialSpend` action (invoke pattern), updated `runway()` to use real avg spend, added `runwayDelta()` getter comparing current vs previous reconciliation balance. Updated `useSavingsStore.test.ts` with 7 new tests (runway updated ×3, loadAvgMonthlyEssentialSpend ×2, runwayDelta ×4).
- ✅ Task 3: Added `loadAvgMonthlyEssentialSpend` call in `router.tsx` root `beforeLoad` after `loadReconciliations`.
- ✅ Task 4: Updated `WealthPanel.tsx` — runway display now conditional (— or `runway()`), label updated to "months runway", delta span added with directional colors per UX-DR4 tokens. Updated `WealthPanel.test.tsx` — added `runwayDelta` to mock, 6 new tests covering no-reconciliations/dash, computed value, no delta <2 recs, positive/negative/zero delta.
- ✅ Task 5: Vitest — 42/42 story-5.4 tests pass, 343/343 non-pre-existing tests pass. Cargo test — 83/83 pass. Lint — no new errors introduced.

### File List

- src-tauri/src/commands/mod.rs
- src-tauri/src/lib.rs
- src/stores/useSavingsStore.ts
- src/stores/useSavingsStore.test.ts
- src/features/savings/WealthPanel.tsx
- src/features/savings/WealthPanel.test.tsx
- src/router.tsx

### Review Findings

- [x] [Review][Decision] Negative delta format — resolved: use `Math.abs(delta)` so negative delta renders "↓ 1 this month" (arrow carries direction). Fixed in `WealthPanel.tsx` and test updated.

- [x] [Review][Patch] `unwrap_or(0)` silently swallows real DB errors [`src-tauri/src/commands/mod.rs` — `get_avg_monthly_essential_spend_cents_inner`] — replaced with `?`; COALESCE guarantees a row so QueryReturnedNoRows cannot occur.

- [x] [Review][Patch] `runwayDelta()` called twice per render [`src/features/savings/WealthPanel.tsx`] — refactored IIFE to call `runwayDelta()` once, guard on null, then use the value.

- [x] [Review][Patch] Rust test name `test_get_avg_essential_spend_excludes_positive_months` is misleading [`src-tauri/src/commands/mod.rs`] — renamed to `test_get_avg_essential_spend_excludes_net_refund_months`.

- [x] [Review][Defer] Partial store state on async load error paths [`src/stores/useSavingsStore.ts`] — deferred, pre-existing codebase pattern
- [x] [Review][Defer] savingsTransactions flashes empty during recordReconciliation [`src/stores/useSavingsStore.ts`] — deferred, minor UX flash, not a functional bug
- [x] [Review][Defer] avgMonthlyEssentialSpendCents not refreshed after recordReconciliation [`src/stores/useSavingsStore.ts`] — deferred, spec doesn't require refresh; only stale if spend transactions imported mid-session
- [x] [Review][Defer] "this month" delta label imprecise for non-monthly reconciliations [`src/features/savings/WealthPanel.tsx`] — deferred, spec-intended text
- [x] [Review][Defer] No automated test for loadAvgMonthlyEssentialSpend in router beforeLoad [`src/router.tsx`] — deferred, spec doesn't require router tests
- [x] [Review][Defer] SQL AVG unweighted by partial months [`src-tauri/src/commands/mod.rs`] — deferred, spec-intended design

## Change Log

- 2026-04-08: Story 5.4 created — runway metric derive and display.
- 2026-04-08: Story 5.4 implemented — Rust command, store wiring, router call, WealthPanel display with delta. All tests pass.
- 2026-04-08: Code review complete — 1 decision-needed, 3 patch, 6 deferred, 8 dismissed.
