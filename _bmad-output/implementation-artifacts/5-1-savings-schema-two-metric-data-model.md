# Story 5.1: Savings Schema + Two-Metric Data Model

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the SQLite schema and Zustand store for both savings metrics — reconciliation-based balance and transaction-flow tracking — along with the Tauri commands to read and write them,
so that runway and savings flow can be derived from clean, separate data sources.

## Acceptance Criteria

1. **AC1: Migration `008_savings.sql`**
   - Given the migration runner runs on launch
   - When `008_savings.sql` is applied
   - Then the `savings_reconciliations` table exists with columns: `id` (PRIMARY KEY), `date` (ISO 8601 TEXT NOT NULL), `entered_balance_cents` (INTEGER NOT NULL), `previous_tracked_balance_cents` (INTEGER NOT NULL), `delta_cents` (INTEGER NOT NULL), `note` (TEXT nullable)
   - AND a CHECK constraint ensures `entered_balance_cents >= 0`
   - AND the `is_savings` column on `envelopes` is NOT touched (it already exists from migration 005)

2. **AC2: Zustand Store Hydration**
   - Given the `useSavingsStore` Zustand slice is populated
   - When the app loads
   - Then reconciliation history is hydrated from `savings_reconciliations` via `get_savings_reconciliations`
   - AND the store exposes a derived `currentTrackedBalance()` getter that computes: most recent reconciliation's `entered_balance_cents` + sum of savings transactions since that reconciliation date
   - AND the store exposes a derived `runway()` getter that delegates to `deriveRunway()`

3. **AC3: Savings Sign Convention Enforced at 3 Layers**
   - Given savings transactions follow the sign convention
   - When any savings transaction amount is stored or read
   - Then negative amounts = deposits to savings (outflow from checking), positive amounts = withdrawals from savings (inflow to checking)
   - AND this convention is documented as a comment in the SQLite migration
   - AND enforced in the Rust `record_reconciliation` command via an assertion
   - AND exported as a TypeScript constant `SAVINGS_DEPOSIT_SIGN = -1` from `src/lib/types.ts`

4. **AC4: Atomic Writes**
   - Given any savings write command executes (e.g., `record_reconciliation`)
   - When it commits
   - Then the write is atomic (all-or-nothing via SQLite transaction)
   - AND the store's derived savings balance recalculates immediately after a successful commit

## Tasks / Subtasks

- [x] Task 1: Create migration `008_savings.sql` (AC: 1)
  - [x] 1.1: Create `src-tauri/migrations/008_savings.sql` with `savings_reconciliations` table (all 6 columns, CHECK constraint on `entered_balance_cents >= 0`)
  - [x] 1.2: Verify migration does NOT touch `envelopes.is_savings` — that column already exists (migration 005); adding it again will crash the app
  - [x] 1.3: Add sign convention comment to migration file

- [x] Task 2: Add `SavingsReconciliation` TypeScript type (AC: 2, 3)
  - [x] 2.1: Add `SavingsReconciliation` interface to `src/lib/types.ts` (id, date, enteredBalanceCents, previousTrackedBalanceCents, deltaCents, note)
  - [x] 2.2: Add `RecordReconciliationInput` interface to `src/lib/types.ts` (enteredBalanceCents, note?)
  - [x] 2.3: Export `SAVINGS_DEPOSIT_SIGN = -1 as const` from `src/lib/types.ts`

- [x] Task 3: Implement `deriveRunway` pure function (AC: 2)
  - [x] 3.1: Create `src/lib/deriveRunway.ts` — pure function `deriveRunway(savingsBalanceCents: number, avgMonthlyEssentialSpendCents: number): number` returning months of runway (0 if avgMonthlyEssentialSpendCents is 0 or negative)
  - [x] 3.2: Create `src/lib/deriveRunway.test.ts` with unit tests: zero balance, zero spend, normal case, negative result guard

- [x] Task 4: Implement Rust Tauri commands (AC: 1, 3, 4)
  - [x] 4.1: Add `SavingsReconciliation` struct (serde Serialize, rename_all = "camelCase") to `src-tauri/src/commands/mod.rs`
  - [x] 4.2: Implement `get_savings_reconciliations(state) -> Result<Vec<SavingsReconciliation>, AppError>` command — SELECT all rows ORDER BY date ASC
  - [x] 4.3: Implement `record_reconciliation(state, entered_balance_cents: i64, note: Option<String>) -> Result<SavingsReconciliation, AppError>` command — fetch previous balance, calculate delta, INSERT in SQLite transaction, return created row
  - [x] 4.4: Register new commands in `tauri::Builder` handler list in `src-tauri/src/main.rs` (or `lib.rs`)
  - [x] 4.5: Verify `get_savings_transactions` is NOT needed in story 5.1 — DECISION: deferred to story 5.3. The store's `currentTrackedBalance()` returns only the most recent reconciliation's `enteredBalanceCents` in story 5.1 (no transaction-delta layer yet). Transaction delta accumulation is explicitly deferred to story 5.3. Documented in Dev Agent Record.

- [x] Task 5: Implement `useSavingsStore` (fill in existing stub) (AC: 2, 3, 4)
  - [x] 5.1: Replace the stub at `src/stores/useSavingsStore.ts` with the full store — state: `reconciliations: SavingsReconciliation[]`, `isWriting: boolean`, `error: string | null`
  - [x] 5.2: Implement `loadReconciliations()` action — calls `invoke<SavingsReconciliation[]>('get_savings_reconciliations')`, sets store state
  - [x] 5.3: Implement `recordReconciliation(enteredBalanceCents: number, note?: string)` action — sets `isWriting: true`, calls `invoke`, appends result to `reconciliations`, clears `isWriting`; on error sets `error` message
  - [x] 5.4: Implement derived getter `currentTrackedBalance(): number` — returns `entered_balance_cents` of most recent reconciliation (empty history → 0); savings transaction deltas to be layered in story 5.3 once reconciliation bootstrap flow exists
  - [x] 5.5: Implement derived getter `runway(): number` — delegates to `deriveRunway(currentTrackedBalance(), 0)` (avgMonthlyEssentialSpend stubbed to 0 until story 5.4 wires in envelope data)
  - [x] 5.6: Create `src/stores/useSavingsStore.test.ts` with: store hydration mock test, `recordReconciliation` success path, `recordReconciliation` error path, `currentTrackedBalance` derived getter

- [x] Task 6: Wire store hydration into app startup (AC: 2)
  - [x] 6.1: Call `useSavingsStore.getState().loadReconciliations()` in `src/router.tsx` root `beforeLoad` (same pattern as all other stores — `useMerchantRuleStore`, `useEnvelopeStore`, etc.)

- [x] Task 7: Run tests and validate (AC: all)
  - [x] 7.1: Run `npm test` (Vitest) — all 21 new tests pass (8 deriveRunway, 13 useSavingsStore); pre-existing BorrowOverlay failures are unchanged (not caused by this story)
  - [x] 7.2: Run `npm run lint` — no new lint errors introduced (4 pre-existing errors in unmodified files)

## Dev Notes

### Two Distinct Metrics (ADR-6) — Architecture Is Intentional

The architecture defines **two separate savings mechanisms** that must NOT be merged:

1. **Reconciliation-Based Balance** (for runway):
   - Source: `savings_reconciliations` table
   - User enters their real account balance; app calculates delta automatically
   - Formula: `currentTrackedBalance = mostRecent.enteredBalanceCents + Σ(savings transactions since mostRecent.date)`
   - Story 5.1 implements the reconciliation half; transaction-delta layer added in story 5.3

2. **App-Tracked Savings Flow** (for monthly bar chart):
   - Source: sum of transactions where `envelope.isSavings = true`
   - Sign convention: negative = deposit, positive = withdrawal
   - Implemented in stories 5.2/5.6

These answer different questions and legitimately diverge. **Do not unify them.**

### Sign Convention (3-Layer Enforcement)

| Layer | How |
|-------|-----|
| SQLite | Comment in migration; `entered_balance_cents >= 0` CHECK on reconciliations |
| Rust | Assert `entered_balance_cents >= 0` in `record_reconciliation` before INSERT |
| TypeScript | `export const SAVINGS_DEPOSIT_SIGN = -1 as const` in `src/lib/types.ts` |

**Sign rule:** negative `amount_cents` = money leaving checking → going into savings (a deposit). Positive = withdrawal back. This is already documented in migration 006 (`-- For savings transactions: negative = deposit to savings`).

### What Already Exists — Do NOT Recreate

| What | Where | Status |
|------|-------|--------|
| `is_savings` column on `envelopes` | migration 005_borrow_schema.sql | EXISTS — do NOT add again |
| `Envelope.isSavings` TypeScript type | `src/lib/types.ts` line 52 | EXISTS |
| `useSavingsStore.ts` stub | `src/stores/useSavingsStore.ts` | EXISTS (stub with `never[]` — fill out in Task 5) |
| `AppError` type | `src/lib/types.ts` line 3 | EXISTS |
| Tauri invoke pattern + error handling | all existing stores | Use the established pattern |

### Correct Migration Number

The epics document refers to `005_savings.sql`. **This is wrong.** The actual next migration is **`008_savings.sql`** because:
- 005 = borrow schema
- 006 = transactions
- 007 = merchant rules

### Rust Command Implementation Pattern

Follow the exact pattern in `src-tauri/src/commands/mod.rs`. All commands:
- Take `state: State<DbState>` as first arg
- Lock mutex: `let conn = state.0.lock().map_err(|_| AppError { code: "DB_LOCK_POISON", ... })?`
- Use `conn.execute()` for writes, `conn.query_row()` / `conn.prepare()` for reads
- Return `Result<T, AppError>`
- Struct fields use `snake_case` in Rust; `#[serde(rename_all = "camelCase")]` maps them to TS

For `record_reconciliation`:
```
1. Lock conn
2. SELECT entered_balance_cents from savings_reconciliations ORDER BY date DESC LIMIT 1 → previous_balance (0 if empty)
3. delta_cents = entered_balance_cents - previous_balance
4. BEGIN; INSERT INTO savings_reconciliations ...; COMMIT
5. SELECT the new row back and return it
```

### Zustand Store Pattern (from existing stores)

All stores follow this shape — see `useMerchantRuleStore.ts` for the latest reference:
```typescript
export const useSavingsStore = create<SavingsState>((set, get) => ({
  reconciliations: [],
  isWriting: false,
  error: null,
  loadReconciliations: async () => { ... },
  recordReconciliation: async (enteredBalanceCents, note) => {
    set({ isWriting: true, error: null });
    try {
      const rec = await invoke<SavingsReconciliation>('getSavingsReconciliations', ...);
      set({ reconciliations: [...get().reconciliations, rec], isWriting: false });
    } catch (err) {
      set({ error: (err as AppError).message, isWriting: false });
    }
  },
  currentTrackedBalance: () => { ... },
  runway: () => { ... },
}));
```

**NEVER call `invoke` directly from components. Always go through the store.**

### `deriveRunway` Guard Case

`deriveRunway(balance, avgSpend)`:
- If `avgSpend <= 0`: return `0` (avoid division by zero; user hasn't spent enough to estimate)
- If `balance <= 0`: return `0`
- Otherwise: `Math.floor(balance / avgSpend)` (truncate to whole months)

In story 5.1, the store calls `deriveRunway(currentTrackedBalance(), 0)` which always returns 0 — that is correct and expected until story 5.4 wires in the essential spending average.

### Startup Hydration

Check `src/App.tsx` for the existing `useEffect` that calls `loadEnvelopes()`, `loadTransactions()`, etc. Add `loadReconciliations()` there. Follow the same error-handling pattern (errors surfaced in the store's `error` field, not thrown globally).

### File Locations

```
src-tauri/migrations/008_savings.sql           ← new
src/lib/types.ts                               ← add SavingsReconciliation, RecordReconciliationInput, SAVINGS_DEPOSIT_SIGN
src/lib/deriveRunway.ts                        ← new
src/lib/deriveRunway.test.ts                   ← new
src/stores/useSavingsStore.ts                  ← fill in existing stub
src/stores/useSavingsStore.test.ts             ← new
src-tauri/src/commands/mod.rs                  ← add structs + commands
src-tauri/src/main.rs (or lib.rs)              ← register new commands in builder
src/App.tsx (or equivalent)                    ← wire loadReconciliations() on startup
```

### Testing Pattern (from story 4.6)

```typescript
// useSavingsStore.test.ts
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  useSavingsStore.setState({
    reconciliations: [],
    isWriting: false,
    error: null,
  });
});
```

Use `vi.mocked(invoke).mockResolvedValueOnce(...)` per test. Do not share mock state between tests.

### Project Structure Notes

- Tests are co-located with source files (not in `__tests__/`)
- `src/lib/` contains pure functions and shared types
- `src/stores/` contains all Zustand domain slices
- Rust commands all live in `src-tauri/src/commands/mod.rs` (single file — do not split)
- Migrations in `src-tauri/migrations/` are numbered and applied in order on launch

### References

- Epic 5 objectives and story 5.1 ACs: `_bmad-output/planning-artifacts/epics.md` — Epic 5 section
- ADR-6 (two-metric savings model): `_bmad-output/planning-artifacts/architecture.md`
- Sign convention: `src-tauri/migrations/006_transactions.sql` line 5 comment
- `is_savings` already exists: `src-tauri/migrations/005_borrow_schema.sql` line 1
- Existing stub to fill: `src/stores/useSavingsStore.ts`
- Existing types file: `src/lib/types.ts`
- Pattern reference (most recent story): `_bmad-output/implementation-artifacts/4-6-merchant-rules-screen-view-edit-delete.md`

### Review Findings

- [x] [Review][Patch] Missing secondary sort key in `get_savings_reconciliations_inner` — `ORDER BY date ASC` has no secondary sort; same-day entries return in undefined order, making `currentTrackedBalance()` potentially pick the wrong record [src-tauri/src/commands/mod.rs]
- [x] [Review][Patch] `RecordReconciliationInput` exported but never used at the `invoke` call site in the store — dead code [src/lib/types.ts]
- [x] [Review][Patch] `test_get_savings_reconciliations_ordered_by_date_asc` does not test date ordering — both rows are inserted on the same day so `id` ordering carries the assertion; dates never differ [src-tauri/src/commands/mod.rs savings_tests]
- [x] [Review][Defer] `unchecked_transaction()` bypasses rusqlite active-transaction guard — not currently a bug, but breaks atomicity if a future caller wraps this in an outer transaction [src-tauri/src/commands/mod.rs] — deferred, pre-existing
- [x] [Review][Defer] Positional column indices in `map_savings_reconciliation_row` — consistent with project-wide pattern, silent mismapping risk if SELECT list is reordered [src-tauri/src/commands/mod.rs] — deferred, pre-existing
- [x] [Review][Defer] `date` column ISO 8601 format unenforced at schema level — `TEXT NOT NULL` with no CHECK; consistent with project conventions [src-tauri/migrations/008_savings.sql] — deferred, pre-existing
- [x] [Review][Defer] `loadReconciliations`/`recordReconciliation` race condition — full-replace `set({ reconciliations })` could overwrite an in-flight append; not triggerable in story 5.1 scope (no UI calls `recordReconciliation` yet) [src/stores/useSavingsStore.ts] — deferred, pre-existing

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_None — no blocking issues encountered._

### Completion Notes List

- **Migration 008_savings.sql**: Created `savings_reconciliations` table with all 6 columns and `CHECK (entered_balance_cents >= 0)` constraint. Sign convention documented as comments. Did NOT touch `envelopes.is_savings` (already exists in migration 005).
- **TypeScript types**: Added `SavingsReconciliation`, `RecordReconciliationInput`, and `SAVINGS_DEPOSIT_SIGN = -1 as const` to `src/lib/types.ts`.
- **deriveRunway**: Pure function with guard cases for zero/negative inputs; `Math.floor` truncation. 8 unit tests, all passing.
- **Rust commands**: `get_savings_reconciliations` (SELECT ORDER BY date ASC) and `record_reconciliation` (fetch prev balance → calculate delta → atomic INSERT → return row). Uses `date('now')` SQLite function (no `chrono` dependency needed). Both registered in `lib.rs`. Rust-level tests for all paths including negative delta and error cases.
- **useSavingsStore**: Replaced stub. `loadReconciliations()` does not set `isWriting` (reads only). `recordReconciliation()` sets `isWriting: true`, appends on success, sets error string on failure. `currentTrackedBalance()` returns last reconciliation's `enteredBalanceCents` (0 if empty). `runway()` calls `deriveRunway(..., 0)` — always returns 0 until story 5.4 wires in avgMonthlyEssentialSpend. 13 store tests, all passing.
- **Hydration**: `useSavingsStore.getState().loadReconciliations()` added to root `beforeLoad` in `src/router.tsx`.
- **get_savings_transactions decision (Task 4.5)**: Deferred to story 5.3. In story 5.1, `currentTrackedBalance()` returns only the reconciliation balance with no transaction-delta layer. This is correct and expected behavior.

### File List

- `src-tauri/migrations/008_savings.sql` (new)
- `src/lib/types.ts` (modified — added SavingsReconciliation, RecordReconciliationInput, SAVINGS_DEPOSIT_SIGN)
- `src/lib/deriveRunway.ts` (new)
- `src/lib/deriveRunway.test.ts` (new)
- `src/stores/useSavingsStore.ts` (modified — replaced stub with full implementation)
- `src/stores/useSavingsStore.test.ts` (new)
- `src-tauri/src/commands/mod.rs` (modified — added SavingsReconciliation struct + get/record commands + savings_tests module)
- `src-tauri/src/lib.rs` (modified — registered get_savings_reconciliations and record_reconciliation)
- `src/router.tsx` (modified — added loadReconciliations() to root beforeLoad)

## Change Log

- 2026-04-08: Story 5.1 implemented — savings schema (migration 008), TypeScript types, deriveRunway pure function, Rust get/record commands, useSavingsStore with derived getters, startup hydration wired into router.tsx. 21 new tests added (8 unit + 13 store), all passing.
