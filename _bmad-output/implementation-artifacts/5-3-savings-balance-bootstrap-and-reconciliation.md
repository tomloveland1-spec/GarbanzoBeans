# Story 5.3: Savings Balance Bootstrap and Reconciliation

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want to enter my current real savings account balance so the app can track my runway from day one,
So that I don't have to reconstruct my savings history before getting useful data.

## Acceptance Criteria

1. **AC1: Empty-State Wealth Panel**
   - Given Tom reaches the Budget screen for the first time with no reconciliation entry
   - When the WealthPanel renders
   - Then it displays "—" in place of a runway number; a prompt invites Tom to enter his current savings balance to activate runway tracking

2. **AC2: Bootstrap Reconciliation Entry**
   - Given Tom enters his current savings balance in the ReconciliationForm in the WealthPanel
   - When the `record_reconciliation` command succeeds
   - Then a `savings_reconciliations` entry is created with `entered_balance_cents` = Tom's input, `previous_tracked_balance_cents` = 0, `delta_cents` = the entered amount; this is the bootstrap entry (FR21)

3. **AC3: Subsequent Reconciliation — Tracked Balance Display and Auto Delta**
   - Given a reconciliation entry already exists
   - When Tom opens or views the ReconciliationForm
   - Then the form displays the current tracked balance (computed as: most recent `entered_balance_cents` + Σ(−savings transaction `amount_cents`) since that reconciliation date) for reference alongside the input field
   - AND `delta_cents` is calculated automatically (entered − previous_tracked); Tom does not enter the delta
   - AND an optional note field is available

4. **AC4: Reactive Update After Save**
   - Given a reconciliation is saved
   - When the `recordReconciliation` action resolves
   - Then the runway metric recalculates immediately (via Zustand derived `runway()` getter); the WealthPanel updates without a page refresh

## Tasks / Subtasks

- [x] Task 1: Add `get_savings_transactions_since` Rust command (AC: 3, 4)
  - [x] 1.1: In `src-tauri/src/commands/mod.rs`, add `fn get_savings_transactions_since_inner(conn, since_date: &str) -> Result<Vec<Transaction>, AppError>` — query: `SELECT t.id, t.payee, t.amount_cents, t.date, t.envelope_id, t.is_cleared, t.import_batch_id, t.created_at FROM transactions t JOIN envelopes e ON t.envelope_id = e.id WHERE e.is_savings = 1 AND t.date >= ?1 ORDER BY t.date ASC`; uses existing `map_transaction_row` helper
  - [x] 1.2: Add `#[tauri::command] pub fn get_savings_transactions_since(state, since_date: String) -> Result<Vec<Transaction>, AppError>` — locks mutex, delegates to inner
  - [x] 1.3: Register `commands::get_savings_transactions_since` in `src-tauri/src/lib.rs` handler list (same `.invoke_handler(tauri::generate_handler![...])` block)
  - [x] 1.4: Add Rust tests in `mod savings_tests` block: `test_get_savings_transactions_since_empty` (no savings envelope → empty vec), `test_get_savings_transactions_since_filters_by_savings_envelope` (create two envelopes — one savings, one not — add transactions to each; verify only savings envelope transactions returned), `test_get_savings_transactions_since_filters_by_date` (two savings transactions on different dates; query with since_date between them; verify only the later one returned)

- [x] Task 2: Update `record_reconciliation_inner` to compute `previous_tracked_balance_cents` correctly (AC: 2, 3)
  - [x] 2.1: In `record_reconciliation_inner`, after fetching `previous_balance` (the last `entered_balance_cents`), also query the sum of savings transaction deltas since that reconciliation's date: `SELECT COALESCE(SUM(-t.amount_cents), 0) FROM transactions t JOIN envelopes e ON t.envelope_id = e.id WHERE e.is_savings = 1 AND t.date > ?1` (use the last reconciliation date; 0 if no reconciliations → use '0000-00-00' as since date)
  - [x] 2.2: Compute `previous_tracked_balance_cents = previous_balance + tx_delta_sum`; use this value instead of raw `previous_balance` for the `previous_tracked_balance_cents` INSERT column
  - [x] 2.3: Existing test `test_record_reconciliation_delta_computed_correctly` verifies no savings transactions → `previous_tracked = last_entered` (unchanged; still passes). Add new test `test_record_reconciliation_previous_tracked_includes_tx_deltas`: create savings envelope, first reconciliation at 500_000, insert savings transaction with `amount_cents = -30_000` (deposit), second reconciliation at 600_000; verify `previous_tracked_balance_cents = 530_000` and `delta_cents = 70_000`

- [x] Task 3: Update `useSavingsStore` — transaction-delta layer and savings transaction loading (AC: 3, 4)
  - [x] 3.1: Add `savingsTransactions: Transaction[]` field to `SavingsState` interface; initialize to `[]`
  - [x] 3.2: Add `loadSavingsTransactionsSince: (sinceDate: string) => Promise<void>` action — calls `invoke<Transaction[]>('get_savings_transactions_since', { sinceDate })`, sets `savingsTransactions` on success, sets `error` on failure (same error pattern as other store actions)
  - [x] 3.3: Update `loadReconciliations()`: after `set({ reconciliations })`, if `reconciliations.length > 0`, call `await get().loadSavingsTransactionsSince(reconciliations[reconciliations.length - 1]!.date)`; if empty, call `get().savingsTransactions` remains `[]` (no-op)
  - [x] 3.4: Update `recordReconciliation()`: after appending new rec to state, call `await get().loadSavingsTransactionsSince(rec.date)` to reset the savings transaction window to the new reconciliation date
  - [x] 3.5: Update `currentTrackedBalance()`: `if (reconciliations.length === 0) return 0`; then `const last = reconciliations[reconciliations.length - 1]!`; compute `txDelta = savingsTransactions.reduce((sum, tx) => sum + (-tx.amountCents), 0)`; return `last.enteredBalanceCents + txDelta`
    - Sign rule: savings tx `amountCents < 0` = deposit → +balance; `amountCents > 0` = withdrawal → −balance; so each tx contributes `−amountCents`
  - [x] 3.6: Update `useSavingsStore.test.ts` — add `savingsTransactions` to `makeReconciliation` fixture setup; add tests: `currentTrackedBalance returns entered balance when no savings transactions`, `currentTrackedBalance adds deposit (negative amountCents) to balance`, `currentTrackedBalance subtracts withdrawal (positive amountCents) from balance`, `loadSavingsTransactionsSince sets savingsTransactions on success`, `loadSavingsTransactionsSince sets error on failure`

- [x] Task 4: Create `ReconciliationForm` component (AC: 1, 2, 3, 4)
  - [x] 4.1: Create `src/features/savings/ReconciliationForm.tsx` — props: none (reads directly from `useSavingsStore`)
    - Dollar input: `<input type="number" min="0" step="0.01" placeholder="0.00">` + `$` prefix label; convert to cents as `Math.round(dollarValue * 100)` on submit
    - When `currentTrackedBalance() > 0`, show current tracked balance above input: `Current tracked balance: {formatCurrency(currentTrackedBalance())}` in muted color
    - Optional note: `<input type="text" placeholder="Note (optional)">` below the amount input
    - Submit button labeled "Save Balance" (Primary style — lime background, dark text); disabled while `isWriting`
    - On success (no error after save): clear form fields
    - On error: show `error` message below the button in destructive color
    - Respects `isReadOnly` from `useSettingsStore` — disable all inputs and button when read-only
  - [x] 4.2: Create `src/features/savings/ReconciliationForm.test.tsx` — tests:
    - Renders dollar input and "Save Balance" button
    - Does NOT show current tracked balance when `reconciliations` is empty
    - Shows current tracked balance when balance > 0 (mock store with one reconciliation)
    - Renders note input
    - Calls `recordReconciliation` with correct cents value (e.g., entering "1234.56" → calls with `123456`)
    - Clears inputs after successful save (mock `recordReconciliation` resolves, `error` stays null)
    - Shows error message when `error` is set in store
    - Disables inputs and button when `isWriting` is true
    - Disables inputs and button when `isReadOnly` is true

- [x] Task 5: Create `WealthPanel` component and replace BudgetPage placeholder (AC: 1, 2, 3, 4)
  - [x] 5.1: Create `src/features/savings/WealthPanel.tsx`
    - Reads `reconciliations` from `useSavingsStore`
    - Fixed-height section (`shrink-0`), border-bottom; use `--color-border` token
    - Layout: horizontal — left section for runway placeholder, right section for ReconciliationForm
    - Runway placeholder: label "Runway" (muted, `type-label`), large "—" display (`type-display` or `text-2xl font-semibold`); label "months" below (muted, small); runway display is always "—" in this story (story 5.4 fills in the actual value)
    - Empty-state message (when `reconciliations.length === 0`): below the "—", render a prompt: `"Enter your savings balance to start tracking runway"` in muted italic text
    - ReconciliationForm rendered inline in the right section always
    - `data-testid="wealth-panel"` on the root element
  - [x] 5.2: Create `src/features/savings/WealthPanel.test.tsx` — tests:
    - Renders with `data-testid="wealth-panel"`
    - Shows "—" as runway placeholder
    - Shows empty-state prompt when no reconciliations
    - Does NOT show empty-state prompt when reconciliations exist
    - Renders `ReconciliationForm` (by querying for the save button or input)
  - [x] 5.3: Update `src/features/envelopes/BudgetPage.tsx`:
    - Import `WealthPanel` from `@/features/savings/WealthPanel`
    - Replace the placeholder `<div data-testid="wealth-panel-placeholder" ...>` with `<WealthPanel />`
    - Remove the `data-testid="wealth-panel-placeholder"` div entirely

- [x] Task 6: Run tests and validate (AC: all)
  - [x] 6.1: Run `npm test` (Vitest) — all new tests pass; no regressions; verify `useSavingsStore.test.ts` updated `currentTrackedBalance` tests pass
  - [x] 6.2: Run `cargo test` — new Rust tests in `savings_tests` pass; `test_record_reconciliation_previous_tracked_includes_tx_deltas` passes; no regressions in existing savings tests
  - [x] 6.3: Run `npm run lint` — no new lint errors

### Review Findings

- [x] [Review][Decision] Date boundary mismatch (`>` vs `>=`) — resolved: backend tx-delta query changed to `>=` (inclusive) to match frontend. [`src-tauri/src/commands/mod.rs`]
- [x] [Review][Decision] `showTrackedBalance` hides zero and negative tracked balances — resolved: condition relaxed to `reconciliations.length > 0`. [`src/features/savings/ReconciliationForm.tsx`]
- [x] [Review][Decision] "— months" label shown with empty-state prompt — dismissed: standard placeholder pattern, story 5.7 redesigns the panel.
- [x] [Review][Patch] `unwrap_or_else` / `unwrap_or` silently swallow real DB errors in `record_reconciliation_inner` — fixed: `match` on `QueryReturnedNoRows` for expected empty case; real errors propagated via `?`. [`src-tauri/src/commands/mod.rs`]
- [x] [Review][Patch] `useEffect` missing dependency array in `ReconciliationForm` — fixed: added `[isWriting, error]`. [`src/features/savings/ReconciliationForm.tsx`]
- [x] [Review][Patch] Stale `savingsTransactions` state if post-reconciliation reload fails — fixed: `savingsTransactions: []` cleared on append before reload. [`src/stores/useSavingsStore.ts`]
- [x] [Review][Defer] `unchecked_transaction` pattern in `record_reconciliation_inner` [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing pattern throughout codebase; already logged in deferred-work.md from story 5-1 review
- [x] [Review][Defer] TOCTOU race on savings single-designation guard in `update_envelope_inner` [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing; single-user app with global DB mutex prevents concurrent access in practice

## Dev Notes

### What Already Exists — Do NOT Recreate

| What | Where | Status |
|------|-------|--------|
| `savings_reconciliations` table | `src-tauri/migrations/008_savings.sql` | EXISTS — full schema, no changes needed |
| `get_savings_reconciliations` Rust command | `src-tauri/src/commands/mod.rs:2630` | EXISTS — do not touch |
| `record_reconciliation` Rust command | `src-tauri/src/commands/mod.rs:2686` | EXISTS — update inner function only (Task 2) |
| `SavingsReconciliation` TS type | `src/lib/types.ts:191` | EXISTS |
| `SAVINGS_DEPOSIT_SIGN = -1 as const` | `src/lib/types.ts:187` | EXISTS |
| `Transaction` TS interface | `src/lib/types.ts:109` | EXISTS — reuse for savings transactions in store |
| `useSavingsStore.ts` | `src/stores/useSavingsStore.ts` | EXISTS — update in place (Tasks 3.1–3.5) |
| `useSavingsStore.test.ts` | `src/stores/useSavingsStore.test.ts` | EXISTS — add new tests, keep existing ones |
| `deriveRunway.ts` + tests | `src/lib/deriveRunway.ts` | EXISTS — do not touch |
| `map_transaction_row` helper | `src-tauri/src/commands/mod.rs:889` | EXISTS — reuse in `get_savings_transactions_since_inner` |
| `formatCurrency(cents)` | `src/lib/currency.ts` | EXISTS — use in ReconciliationForm |
| `src/features/savings/` directory | `.gitkeep` exists | EXISTS — create components here |
| `src/features/savings/.gitkeep` | Placeholder | REMOVE when adding first real file |
| `useSavingsStore` wired into router | `src/router.tsx:72` | EXISTS — `loadReconciliations()` already called; no router changes needed |
| `BudgetPage.tsx` placeholder div | `src/features/envelopes/BudgetPage.tsx:7` | EXISTS — replace with `<WealthPanel />` |
| `useSettingsStore` for `isReadOnly` | all feature components | Use `const { isReadOnly } = useSettingsStore()` — same pattern as EnvelopeCard/SavingsCard |

### Sign Convention — Critical for `currentTrackedBalance()`

The savings sign convention (enforced at 3 layers, `SAVINGS_DEPOSIT_SIGN = -1`):
- `transaction.amountCents < 0` = deposit to savings (money LEFT checking → entered savings account) → **INCREASES** savings balance
- `transaction.amountCents > 0` = withdrawal from savings (money returned to checking) → **DECREASES** savings balance

Therefore:
```typescript
txDelta = savingsTransactions.reduce((sum, tx) => sum + (-tx.amountCents), 0)
// deposit: -(-300) = +300 ✓ (savings balance goes up)
// withdrawal: -(+200) = -200 ✓ (savings balance goes down)
currentTrackedBalance = last.enteredBalanceCents + txDelta
```

**Same formula applies in the Rust Σ query for `previous_tracked_balance_cents`:**
```sql
SELECT COALESCE(SUM(-t.amount_cents), 0)
FROM transactions t
JOIN envelopes e ON t.envelope_id = e.id
WHERE e.is_savings = 1 AND t.date > ?1
```
(note: `SUM(-t.amount_cents)` not `SUM(t.amount_cents)`)

### Rust Command Pattern

All Rust commands follow this exact pattern (do not deviate):
```rust
fn get_savings_transactions_since_inner(
    conn: &rusqlite::Connection,
    since_date: &str,
) -> Result<Vec<Transaction>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.payee, t.amount_cents, t.date, t.envelope_id, \
         t.is_cleared, t.import_batch_id, t.created_at \
         FROM transactions t \
         JOIN envelopes e ON t.envelope_id = e.id \
         WHERE e.is_savings = 1 AND t.date >= ?1 \
         ORDER BY t.date ASC",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![since_date], map_transaction_row)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::from)?;
    Ok(rows)
}

#[tauri::command]
pub fn get_savings_transactions_since(
    state: State<DbState>,
    since_date: String,
) -> Result<Vec<Transaction>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;
    get_savings_transactions_since_inner(&conn, &since_date)
}
```

Register in `src-tauri/src/lib.rs` — add `commands::get_savings_transactions_since` to the `tauri::generate_handler![...]` list.

### `record_reconciliation_inner` — Previous Tracked Balance Fix

The current implementation (story 5.1) only uses `entered_balance_cents` of the prior reconciliation as `previous_tracked_balance_cents`. Story 5.3 corrects this to include savings tx deltas:

```rust
// After fetching previous_balance (last entered_balance_cents, or 0):
let (prev_date, prev_balance): (String, i64) = tx
    .query_row(
        "SELECT date, entered_balance_cents FROM savings_reconciliations ORDER BY date DESC, id DESC LIMIT 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .unwrap_or_else(|_| ("0000-00-00".to_string(), 0));

// Sum savings transaction deltas since last reconciliation date
let tx_delta: i64 = tx
    .query_row(
        "SELECT COALESCE(SUM(-t.amount_cents), 0) FROM transactions t \
         JOIN envelopes e ON t.envelope_id = e.id \
         WHERE e.is_savings = 1 AND t.date > ?1",
        rusqlite::params![prev_date],
        |row| row.get(0),
    )
    .unwrap_or(0);

let previous_tracked_balance_cents = prev_balance + tx_delta;
let delta_cents = entered_balance_cents - previous_tracked_balance_cents;
```

**Important**: replace the existing single-query `previous_balance` fetch (which only fetches `entered_balance_cents`) with this two-query approach. The existing `savings_tests` tests all pass because they have no savings transactions → `tx_delta = 0` → behavior unchanged.

### `useSavingsStore` Update Pattern

The store currently has a comment in `currentTrackedBalance()`:
```typescript
// Most recent reconciliation's entered balance (transaction-delta layer added in story 5.3)
return reconciliations[reconciliations.length - 1]!.enteredBalanceCents;
```

Remove this comment stub and implement the full calculation per Task 3.5. The `loadSavingsTransactionsSince` action follows the same invoke + set error pattern as `loadReconciliations`.

`invoke` call for the new command:
```typescript
const txs = await invoke<Transaction[]>('get_savings_transactions_since', { sinceDate });
set({ savingsTransactions: txs });
```

Note: Tauri converts the `sinceDate` camelCase parameter to `since_date` snake_case automatically (serde rename_all = "camelCase" on the Rust command input).

### ReconciliationForm — Dollar Input Pattern

Currency inputs take dollars and convert to cents internally. Do not use a currency mask library — a plain `<input type="number" min="0" step="0.01">` is sufficient:

```typescript
const handleSubmit = () => {
  const cents = Math.round(parseFloat(dollarValue) * 100);
  if (isNaN(cents) || cents < 0) return; // basic guard
  recordReconciliation(cents, note.trim() || undefined);
};
```

After a successful save (store `error` is null and `isWriting` becomes false), clear `dollarValue` and `note` state fields.

`formatCurrency` import: `import { formatCurrency } from '@/lib/currency'`

### Component File Locations

Per architecture — all savings UI lives in `src/features/savings/`:
- `src/features/savings/WealthPanel.tsx` (new)
- `src/features/savings/WealthPanel.test.tsx` (new)
- `src/features/savings/ReconciliationForm.tsx` (new)
- `src/features/savings/ReconciliationForm.test.tsx` (new)

`src/components/gb/` is for reusable display components (SavingsCard, etc.). `WealthPanel` and `ReconciliationForm` are feature components → `features/savings/`. Do NOT put them in `components/gb/`.

### WealthPanel Visual Spec

From UX-DR11 and existing BudgetPage placeholder pattern:
- Root: `<div className="shrink-0 border-b" style={{ borderColor: 'var(--color-border)' }} data-testid="wealth-panel">`
- Internal layout: flexbox row — left side (runway display) + right side (ReconciliationForm)
- Runway display: label "Runway" (muted, `type-label`), large `—` (`type-display` or `text-2xl font-semibold`), "months" label below; this area is intentionally a placeholder — story 5.4 wires in the computed value
- Empty-state: when `reconciliations.length === 0`, show a prompt below the "—": `"Enter your savings balance to start tracking runway"` in muted italic (`type-caption` or `text-sm italic`)
- WealthPanel height is NOT hardcoded — let content define it naturally (removes the hardcoded `h-[56px]` of the placeholder)

Design tokens:
- `--color-border` for borders
- `--color-text-primary` for primary text
- `--color-text-secondary` for muted/secondary text
- `--color-bg-surface` for card/panel backgrounds
- `#C0F500` (`--accent-lime`) for primary buttons (lime bg, dark text)

### `isReadOnly` Pattern

All interactive components check `isReadOnly` from `useSettingsStore`. Follow the SavingsCard/EnvelopeCard pattern:
```typescript
const { isReadOnly } = useSettingsStore();
// Disable all inputs and the Submit button when isReadOnly is true
<input disabled={isReadOnly || isWriting} ... />
<button disabled={isReadOnly || isWriting} ...>Save Balance</button>
```

### Testing Patterns (from stories 4.6/5.1/5.2)

For store tests — mock Tauri invoke:
```typescript
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);
```

Reset store state in `beforeEach`:
```typescript
useSavingsStore.setState({ reconciliations: [], savingsTransactions: [], isWriting: false, error: null });
```

For component tests — mock the stores:
```typescript
vi.mock('@/stores/useSavingsStore');
vi.mock('@/stores/useSettingsStore');
import { useSavingsStore } from '@/stores/useSavingsStore';
const mockUseSavingsStore = vi.mocked(useSavingsStore);
```

Use `@testing-library/react`'s `render`, `screen`, `fireEvent` (or `userEvent`). Don't import `@tauri-apps/api/core` in component tests — mock the stores instead.

For Rust tests in `savings_tests` block — use the established `fresh_conn()` helper. To test `get_savings_transactions_since_inner`, you need a savings envelope:
```rust
// Create savings envelope
conn.execute(
    "INSERT INTO envelopes (name, envelope_type, priority, allocated_cents, is_savings) VALUES ('ING', 'Rolling', 'Need', 0, 1)",
    [],
).unwrap();
let savings_env_id = conn.last_insert_rowid();

// Create non-savings envelope
conn.execute(
    "INSERT INTO envelopes (name, envelope_type, priority, allocated_cents, is_savings) VALUES ('Groceries', 'Rolling', 'Need', 0, 0)",
    [],
).unwrap();
let regular_env_id = conn.last_insert_rowid();
```

### Deferred (Not in Story 5.3 Scope)

- **Arc Gauge** (`RunwayGauge.tsx`) — story 5.5
- **Savings Flow Chart** (`SavingsFlowChart.tsx`) — story 5.6
- **Full WealthPanel layout with arc + chart** — story 5.7
- **Runway number display** (actual computed value in WealthPanel) — story 5.4; use `—` placeholder in 5.3
- **WealthPanel collapsible behavior** — story 5.7
- **Reconciliation history list/modal** — not specified in any AC; do not add

### Previous Story Learnings (5.2 — code review findings)

- **`isReadOnly` check is required in all interactive components** — the code review of story 5.2 caught that `SavingsCard` didn't check `isReadOnly`. `ReconciliationForm` MUST check `isReadOnly` from the start.
- Tests must cover **all UI elements** that are mentioned in spec: if spec says "Save Balance button", there must be a test that verifies it renders.
- Keep components focused: do not add features not in the ACs (no reconciliation history view, no streak indicators, etc.)

### References

- Story 5.3 ACs: `_bmad-output/planning-artifacts/epics.md` line 953
- Story 5.4 (next): `_bmad-output/planning-artifacts/epics.md` line 979
- Two-metric architecture ADR-6: `_bmad-output/planning-artifacts/architecture.md` line 89
- Wealth panel UX-DR11: `_bmad-output/planning-artifacts/architecture.md` line 117
- `useSavingsStore.ts` (to update): `src/stores/useSavingsStore.ts`
- `useSavingsStore.test.ts` (to update): `src/stores/useSavingsStore.test.ts`
- `record_reconciliation_inner` (to update): `src-tauri/src/commands/mod.rs:2640`
- `savings_tests` block (to add tests): `src-tauri/src/commands/mod.rs:2698`
- `map_transaction_row` (reuse): `src-tauri/src/commands/mod.rs:889`
- `lib.rs` handler list: `src-tauri/src/lib.rs:134`
- `BudgetPage.tsx` (to update): `src/features/envelopes/BudgetPage.tsx`
- `formatCurrency`: `src/lib/currency.ts`
- `isReadOnly` pattern: `src/features/envelopes/EnvelopeCard.tsx` or `src/components/gb/SavingsCard.tsx`
- Sign convention constant: `src/lib/types.ts:187`
- Previous story learnings: `_bmad-output/implementation-artifacts/5-2-savings-category-distinct-visual-treatment.md` (Review Findings section)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Migration 008 was not registered in `src-tauri/src/migrations.rs` — added it and updated version assertions from 7→8
- Dev notes used `envelope_type` column name but actual schema uses `type` — fixed test INSERTs accordingly

### Completion Notes List

- AC1 (Empty-State Wealth Panel): WealthPanel shows "—" runway placeholder and empty-state prompt when no reconciliations exist
- AC2 (Bootstrap Reconciliation Entry): ReconciliationForm collects dollar input, converts to cents, calls `recordReconciliation`; Rust command creates `savings_reconciliations` row with `previous_tracked_balance_cents = 0` on first entry
- AC3 (Subsequent Reconciliation): `record_reconciliation_inner` now queries savings tx deltas since last reconciliation date to compute accurate `previous_tracked_balance_cents`; `currentTrackedBalance()` store getter applies same tx-delta logic reactively
- AC4 (Reactive Update): `recordReconciliation` action calls `loadSavingsTransactionsSince(rec.date)` after appending new rec — store updates without page refresh
- 77 Rust tests pass (9 new savings tests); 331+ JS tests pass (14 new tests); no new lint errors
- `.gitkeep` in `src/features/savings/` can be deleted (now has real files)

### File List

- src-tauri/src/commands/mod.rs
- src-tauri/src/lib.rs
- src-tauri/src/migrations.rs
- src/stores/useSavingsStore.ts
- src/stores/useSavingsStore.test.ts
- src/features/savings/ReconciliationForm.tsx
- src/features/savings/ReconciliationForm.test.tsx
- src/features/savings/WealthPanel.tsx
- src/features/savings/WealthPanel.test.tsx
- src/features/envelopes/BudgetPage.tsx

## Change Log

- 2026-04-08: Story 5.3 implemented — savings balance bootstrap & reconciliation. Added `get_savings_transactions_since` Rust command, updated `record_reconciliation_inner` with tx-delta logic, added `savingsTransactions` field to `useSavingsStore`, created `ReconciliationForm` and `WealthPanel` components, replaced BudgetPage placeholder. Registered migration 008. 9 new Rust tests + 14 new JS tests, all passing.
