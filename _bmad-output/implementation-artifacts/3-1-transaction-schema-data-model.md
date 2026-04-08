# Story 3.1: Transaction Schema + Data Model

Status: done

## Story

As a developer,
I want the SQLite schema and Zustand store for transactions, along with the core Tauri commands for reading and writing transactions,
So that all transaction feature stories have a correct, atomic data layer to build on.

## Acceptance Criteria

1. **Given** the migration runner runs on launch
   **When** `006_transactions.sql` is applied
   **Then** the `transactions` table exists with columns: `id`, `payee`, `amount_cents` (INTEGER), `date` (ISO 8601 TEXT), `envelope_id` (INTEGER FK, nullable), `is_cleared` (INTEGER 0/1), `import_batch_id` (TEXT, nullable), `created_at` (ISO 8601 TEXT); indexes `idx_transactions_date` and `idx_transactions_envelope_id` exist

   > **Note:** The epics doc says `003_transactions.sql` and references `idx_transactions_month_id`. Both are wrong for this codebase. Migrations 003–005 are already used (envelopes, income, borrow). Next migration is **006**. The index `idx_transactions_month_id` references a column that does not exist on the transactions table — month filtering happens via date range on the `date` column, so the correct indexes are `idx_transactions_date` and `idx_transactions_envelope_id`.

2. **Given** the `useTransactionStore` Zustand slice is populated
   **When** the app loads
   **Then** transactions for the current month are hydrated from SQLite via `get_transactions`; the store exposes `clearedTransactions` and `unclearedTransactions` as filtered views of the loaded transactions

3. **Given** any Tauri command writes transactions
   **When** the command executes
   **Then** all writes use SQLite transactions (`unchecked_transaction()` pattern from `commands/mod.rs`); partial writes are never committed; on failure the store rolls back the optimistic update

## Tasks / Subtasks

- [x] Task 1 — DB: Migration 006 — transactions table
  - [x] Create `src-tauri/migrations/006_transactions.sql` (see exact SQL in Dev Notes)
  - [x] Register in `src-tauri/src/migrations.rs`: add `(6, include_str!("../migrations/006_transactions.sql"))` to MIGRATIONS array
  - [x] Bump both test assertions to `assert_eq!(version, 6, ...)` in `test_migrations_run_on_fresh_db` and `test_migrations_are_idempotent`

- [x] Task 2 — Rust: Transaction struct + commands in `commands/mod.rs`
  - [x] Add `Transaction` struct (`#[derive(Debug, serde::Serialize)]`, `#[serde(rename_all = "camelCase")]`) with all fields (see Dev Notes for exact field list and column index mapping)
  - [x] Add `CreateTransactionInput` struct (`#[derive(Debug, serde::Deserialize)]`, `#[serde(rename_all = "camelCase")]`)
  - [x] Add `UpdateTransactionInput` struct (`#[derive(Debug, serde::Deserialize)]`, `#[serde(rename_all = "camelCase")]`)
  - [x] Implement `get_transactions_inner(conn, month_key: Option<String>) -> Result<Vec<Transaction>, AppError>` — if `month_key` is `Some("YYYY-MM")`, filter rows with `date >= 'YYYY-MM-01' AND date < 'YYYY-MM-next-01'`; otherwise return all
  - [x] Add `#[tauri::command] pub fn get_transactions(state: State<DbState>, month_key: Option<String>) -> Result<Vec<Transaction>, AppError>`
  - [x] Implement `create_transaction_inner(conn, input: &CreateTransactionInput) -> Result<Transaction, AppError>` using `unchecked_transaction()` pattern
  - [x] Add `#[tauri::command] pub fn create_transaction`
  - [x] Implement `update_transaction_inner(conn, input: &UpdateTransactionInput) -> Result<Transaction, AppError>` using `unchecked_transaction()` pattern
  - [x] Add `#[tauri::command] pub fn update_transaction`
  - [x] Add Rust unit tests (see Dev Notes for test list)

- [x] Task 3 — Rust: Register commands in `lib.rs`
  - [x] Add `commands::get_transactions`, `commands::create_transaction`, `commands::update_transaction` to `invoke_handler!` list in `src-tauri/src/lib.rs`

- [x] Task 4 — TypeScript: Add Transaction types to `src/lib/types.ts`
  - [x] Add `Transaction` interface (see Dev Notes for exact field list)
  - [x] Add `CreateTransactionInput` interface
  - [x] Add `UpdateTransactionInput` interface

- [x] Task 5 — Store: Replace stub `useTransactionStore.ts` with full implementation
  - [x] Replace the stub at `src/stores/useTransactionStore.ts` with full Zustand store (see Dev Notes for shape)
  - [x] State: `transactions`, `isWriting`, `error`, computed `clearedTransactions`, `unclearedTransactions`
  - [x] Actions: `loadTransactions(monthKey?: string)`, `createTransaction(input)`, `updateTransaction(input)`
  - [x] Follow the exact `isWriting + optimistic update + rollback` pattern from `useEnvelopeStore.ts`

- [x] Task 6 — Router: Wire `loadTransactions` into root route
  - [x] In `src/router.tsx`, add `import { useTransactionStore } from '@/stores/useTransactionStore';`
  - [x] In `rootRoute.beforeLoad`, call `await useTransactionStore.getState().loadTransactions(currentMonth())` after the existing store loads
  - [x] Add a `currentMonth()` helper (or reuse `pastTwelveMonths()[0]` from `src/lib/date-utils.ts`) to pass the current YYYY-MM to `loadTransactions`

- [x] Task 7 — Tests
  - [x] Create `src/stores/useTransactionStore.test.ts` — cover `loadTransactions`, `createTransaction`, `updateTransaction`, rollback on error (follow `useEnvelopeStore.test.ts` and `useIncomeStore.test.ts` patterns)
  - [x] Add Rust unit tests in `commands/mod.rs` `#[cfg(test)]` block (see Dev Notes)

## Dev Notes

### Critical: Migration Number Is 006, Not 003

The epics doc was authored before Epics 1–2 consumed migrations 003–005 (`003_envelopes.sql`, `004_income_entries.sql`, `005_borrow_schema.sql`). The transactions table migration **must** be 006.

File: `src-tauri/migrations/006_transactions.sql`

```sql
-- Migration 006: Transaction ledger
-- Adds: transactions table for all imported and manually entered transactions
-- Note: envelope_id references envelopes(id); FK not enforced (SQLite default + Epic 6 scope)
-- Sign convention: amount_cents is the transaction amount as signed cents.
-- For savings transactions: negative = deposit to savings (outflow from checking)

CREATE TABLE IF NOT EXISTS transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  payee            TEXT    NOT NULL DEFAULT '',
  amount_cents     INTEGER NOT NULL,
  date             TEXT    NOT NULL,  -- ISO 8601 date: "YYYY-MM-DD"
  envelope_id      INTEGER,           -- FK to envelopes(id), nullable (uncategorized)
  is_cleared       INTEGER NOT NULL DEFAULT 0 CHECK (is_cleared IN (0, 1)),
  import_batch_id  TEXT,              -- NULL for manually entered; OFX batch ID for imports
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Primary filter: fetching transactions for a given month (date range query)
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

-- Secondary filter: deriving envelope balance (sum amount_cents WHERE envelope_id = ?)
CREATE INDEX IF NOT EXISTS idx_transactions_envelope_id ON transactions(envelope_id);
```

### Rust Struct and Column Mapping

```rust
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: i64,
    pub payee: String,
    pub amount_cents: i64,    // index 2 — INTEGER cents, NEVER float
    pub date: String,         // index 3 — ISO 8601 "YYYY-MM-DD"
    pub envelope_id: Option<i64>,  // index 4 — nullable FK
    pub is_cleared: bool,     // index 5 — deserialize as i64 != 0
    pub import_batch_id: Option<String>,  // index 6 — nullable
    pub created_at: String,   // index 7 — ISO 8601 UTC
}
```

Column index mapping for all SELECT queries (maintain this order in every SELECT):
```
id(0), payee(1), amount_cents(2), date(3), envelope_id(4), is_cleared(5), import_batch_id(6), created_at(7)
```

Map `is_cleared` as: `row.get::<_, i64>(5)? != 0`
Map `envelope_id` as: `row.get::<_, Option<i64>>(4)?`
Map `import_batch_id` as: `row.get::<_, Option<String>>(6)?`

### get_transactions — Month Filtering

Accept `month_key: Option<String>` (format `"YYYY-MM"`). When provided, compute next month for the upper bound:

```rust
fn next_month(ym: &str) -> String {
    // Split "YYYY-MM", increment month, handle December rollover
    let parts: Vec<&str> = ym.splitn(2, '-').collect();
    let year: i32 = parts[0].parse().unwrap_or(2026);
    let month: i32 = parts[1].parse().unwrap_or(1);
    if month == 12 {
        format!("{}-01", year + 1)
    } else {
        format!("{}-{:02}", year, month + 1)
    }
}
```

SQL filter: `WHERE date >= '{month_key}-01' AND date < '{next_month}'`

Without `month_key`: return all rows (no WHERE clause), ordered by `date DESC, id DESC`.

### create_transaction_inner Pattern

Follow `allocate_envelopes_inner` / `borrow_from_envelope_inner` exactly:
```rust
fn create_transaction_inner(conn: &Connection, input: &CreateTransactionInput) -> Result<Transaction, AppError> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared, import_batch_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            input.payee,
            input.amount_cents,
            input.date,
            input.envelope_id,
            if input.is_cleared { 1i64 } else { 0i64 },
            input.import_batch_id,
        ],
    )?;
    let id = tx.last_insert_rowid();
    let row = tx.query_row(
        "SELECT id, payee, amount_cents, date, envelope_id, is_cleared, import_batch_id, created_at
         FROM transactions WHERE id = ?1",
        rusqlite::params![id],
        map_transaction_row,
    )?;
    tx.commit()?;
    Ok(row)
}
```

Extract `map_transaction_row` as a named function to avoid duplicating the mapping closure across `get_transactions_inner`, `create_transaction_inner`, and `update_transaction_inner`.

### update_transaction_inner

Accepts `UpdateTransactionInput` with all fields except `id` optional. Pattern: build a SET clause based on which fields are Some(_). Re-SELECT the updated row after UPDATE and return it (same pattern as `update_envelope_inner` in `commands/mod.rs`). Validate that `id` exists; return `TRANSACTION_NOT_FOUND` AppError if 0 rows changed.

### CreateTransactionInput / UpdateTransactionInput Rust Structs

```rust
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransactionInput {
    pub payee: String,
    pub amount_cents: i64,
    pub date: String,              // "YYYY-MM-DD"
    pub envelope_id: Option<i64>,
    pub is_cleared: Option<bool>,  // defaults to false in SQL
    pub import_batch_id: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTransactionInput {
    pub id: i64,
    pub payee: Option<String>,
    pub amount_cents: Option<i64>,
    pub date: Option<String>,
    pub envelope_id: Option<i64>,
    pub is_cleared: Option<bool>,
}
```

### TypeScript Types (add to `src/lib/types.ts`)

```typescript
// Transaction domain types — mirrors Rust Transaction struct in commands/mod.rs
export interface Transaction {
  id: number;
  payee: string;
  amountCents: number;         // INTEGER cents — never display directly; use formatCurrency()
  date: string;                // ISO 8601 "YYYY-MM-DD"
  envelopeId: number | null;   // null = uncategorized
  isCleared: boolean;
  importBatchId: string | null; // null = manually entered
  createdAt: string;           // ISO 8601 UTC
}

// Input for create_transaction Tauri command.
export interface CreateTransactionInput {
  payee: string;
  amountCents: number;
  date: string;               // "YYYY-MM-DD"
  envelopeId?: number | null;
  isCleared?: boolean;        // defaults to false
  importBatchId?: string | null;
}

// Input for update_transaction Tauri command. All fields except id are optional.
export interface UpdateTransactionInput {
  id: number;
  payee?: string;
  amountCents?: number;
  date?: string;
  envelopeId?: number | null;
  isCleared?: boolean;
}
```

### useTransactionStore Shape

Replace the stub (`src/stores/useTransactionStore.ts`) with:

```typescript
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppError, Transaction, CreateTransactionInput, UpdateTransactionInput } from '@/lib/types';

interface TransactionState {
  transactions: Transaction[];
  isWriting: boolean;
  error: AppError | null;

  // Computed views — derived from transactions, not separately stored
  clearedTransactions: () => Transaction[];
  unclearedTransactions: () => Transaction[];

  // Actions
  loadTransactions: (monthKey?: string) => Promise<void>;
  createTransaction: (input: CreateTransactionInput) => Promise<void>;
  updateTransaction: (input: UpdateTransactionInput) => Promise<void>;
}
```

For `clearedTransactions` and `unclearedTransactions`, implement as selector functions (not state fields) to avoid duplication:
```typescript
clearedTransactions: () => get().transactions.filter(t => t.isCleared),
unclearedTransactions: () => get().transactions.filter(t => !t.isCleared),
```

Optimistic update pattern for `createTransaction`:
```typescript
createTransaction: async (input) => {
  const tempId = --_tempIdCounter;
  const tempTx: Transaction = {
    id: tempId,
    payee: input.payee,
    amountCents: input.amountCents,
    date: input.date,
    envelopeId: input.envelopeId ?? null,
    isCleared: input.isCleared ?? false,
    importBatchId: input.importBatchId ?? null,
    createdAt: new Date().toISOString(),
  };
  const prev = get().transactions;
  set({ transactions: [...prev, tempTx], isWriting: true, error: null });
  try {
    const created = await invoke<Transaction>('create_transaction', { input });
    set(state => ({
      transactions: state.transactions.map(t => t.id === tempId ? created : t),
      isWriting: false,
    }));
  } catch (err) {
    set({ transactions: prev, isWriting: false, error: err as AppError });
  }
},
```

### Router: Load Transactions on App Mount

In `src/router.tsx`, in `rootRoute.beforeLoad`, add after the existing store loads:

```typescript
import { useTransactionStore } from '@/stores/useTransactionStore';
import { pastTwelveMonths } from '@/lib/date-utils';

// Inside beforeLoad:
const currentMonth = pastTwelveMonths()[0]; // "YYYY-MM" for current month
await useTransactionStore.getState().loadTransactions(currentMonth);
```

`pastTwelveMonths()` already exists in `src/lib/date-utils.ts` — do not reinvent it.

### Rust Unit Tests to Add

Add to the `#[cfg(test)]` block in `commands/mod.rs`:

```
mod transaction_tests {
  - test_create_transaction_returns_inserted_row
  - test_create_transaction_is_uncleared_by_default
  - test_get_transactions_filters_by_month_key
  - test_get_transactions_returns_all_when_no_month_key
  - test_update_transaction_changes_fields
  - test_update_transaction_returns_not_found_for_invalid_id
}
```

Use `rusqlite::Connection::open_in_memory()` + `run_migrations()` for test setup (same pattern as `borrow_tests` in `commands/mod.rs`).

### File List for This Story

New files:
- `src-tauri/migrations/006_transactions.sql`
- `src/stores/useTransactionStore.test.ts`

Modified files:
- `src-tauri/src/migrations.rs` — register migration 6, bump test assertions to 6
- `src-tauri/src/commands/mod.rs` — Transaction struct, CreateTransactionInput, UpdateTransactionInput, get_transactions, create_transaction, update_transaction, Rust unit tests
- `src-tauri/src/lib.rs` — register get_transactions, create_transaction, update_transaction
- `src/lib/types.ts` — Transaction, CreateTransactionInput, UpdateTransactionInput
- `src/stores/useTransactionStore.ts` — replace stub with full implementation
- `src/router.tsx` — call loadTransactions in rootRoute.beforeLoad

### Pattern References

| Pattern | Reference file |
|---|---|
| Migration registration | `src-tauri/src/migrations.rs` — add to MIGRATIONS array, bump assertions |
| `unchecked_transaction()` + `tx.commit()` | `src-tauri/src/commands/mod.rs` — `allocate_envelopes_inner` (~line 604) |
| Optimistic update + rollback | `src/stores/useEnvelopeStore.ts` — `createEnvelope` action |
| Store stub replacement | `src/stores/useIncomeStore.ts` — complete reference |
| AppError shape | `src/lib/types.ts` — `AppError` interface |
| Test mock pattern | `src/stores/useEnvelopeStore.test.ts` — `vi.mock('@tauri-apps/api/core', ...)` with `vi.hoisted()` |
| `pastTwelveMonths()` | `src/lib/date-utils.ts` — already exists, use directly |

### Deferred Items (Do NOT Implement in This Story)

- OFX import (`import_ofx` Tauri command) — Story 3.2
- Ledger UI (LedgerView.tsx, TransactionRow.tsx) — Story 3.3
- Auto-match logic (`matchTransactions.ts`) — Story 3.4
- Merchant rule application during import — Story 4.x
- Month-scoped transaction queries beyond current month (all-time ledger scroll) — deferred
- `envelope_id` FK enforcement — Epic 6 (same pattern as `month_id` on envelopes)

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- Rust compile error E0597 (`stmt` lifetime) in `get_transactions_inner`: fixed by computing the full SQL string before `conn.prepare()` so both if/else branches share one `stmt` with a single scope. Pattern mirrors allocate_envelopes_inner block.

### Completion Notes List
- Migration 006 created at `src-tauri/migrations/006_transactions.sql` with `transactions` table, `idx_transactions_date`, `idx_transactions_envelope_id` indexes.
- `migrations.rs` updated to include migration 6; test assertions bumped from 5 → 6.
- `commands/mod.rs`: added `Transaction`, `CreateTransactionInput`, `UpdateTransactionInput` structs; `map_transaction_row` helper; `next_month()` helper; `get_transactions_inner`, `create_transaction_inner`, `update_transaction_inner`; three `#[tauri::command]` wrappers; `transaction_tests` module with 6 passing unit tests.
- `lib.rs`: registered `get_transactions`, `create_transaction`, `update_transaction` in `invoke_handler!`.
- `src/lib/types.ts`: added `Transaction`, `CreateTransactionInput`, `UpdateTransactionInput` interfaces.
- `src/stores/useTransactionStore.ts`: replaced stub with full Zustand store — `clearedTransactions`/`unclearedTransactions` as selector functions; optimistic create with temp negative ID and rollback; optimistic update with rollback.
- `src/router.tsx`: wired `loadTransactions(pastTwelveMonths()[0])` into `rootRoute.beforeLoad`.
- `src/stores/useTransactionStore.test.ts`: 12 passing tests covering all actions, computed views, optimistic updates, rollbacks.
- All 35 Rust tests pass. 12/12 new TS tests pass. Pre-existing BorrowOverlay failures (13) are unrelated to this story.

### File List
New files:
- `src-tauri/migrations/006_transactions.sql`
- `src/stores/useTransactionStore.test.ts`

Modified files:
- `src-tauri/src/migrations.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/lib.rs`
- `src/lib/types.ts`
- `src/stores/useTransactionStore.ts`
- `src/router.tsx`

### Change Log
- 2026-04-07: Story 3.1 implemented — transaction schema, Rust commands, TypeScript types, Zustand store, router wiring, and tests. All ACs satisfied.

## Review Findings

### Decision-Needed

- [x] [Review][Patch] D1→Patch: Fix `update_transaction_inner` to support clearing `envelope_id` to NULL — add `clearEnvelopeId: Option<bool>` field to `UpdateTransactionInput` (Rust + TS); when true, use `NULL` directly instead of COALESCE [`src-tauri/src/commands/mod.rs`, `src/lib/types.ts`]
- [x] [Review][Patch] D2→Patch: Add comment to `create_transaction_inner` documenting that blank payee is intentionally allowed (OFX imports may have no payee) — unlike income/envelope commands [`src-tauri/src/commands/mod.rs`]

### Patch

- [x] [Review][Patch] P1: SQL injection via string interpolation in `get_transactions_inner` [HIGH] [`src-tauri/src/commands/mod.rs`]
- [x] [Review][Patch] P2: `next_month` silently produces wrong SQL on malformed `month_key` input — added `validate_month_key` helper [`src-tauri/src/commands/mod.rs`]
- [x] [Review][Patch] P3: `_tempIdCounter` module-level variable not reset in test `beforeEach` — exported `_resetTempIdCounter`, called in `beforeEach` [`src/stores/useTransactionStore.test.ts`]
- [x] [Review][Patch] P4: `allocate_envelopes_inner` allows duplicate IDs in same batch — added `DUPLICATE_ENVELOPE_ID` guard [`src-tauri/src/commands/mod.rs`]
- [x] [Review][Patch] P5: `updateTransaction` store applies no pre-invoke optimistic mutation — added optimistic field-merge before await [`src/stores/useTransactionStore.ts`]

### Deferred

- [x] [Review][Defer] W1: No explicit `tx.rollback()` on early return in `allocate_envelopes_inner` and `delete_income_entry_inner` — relies on rusqlite drop-rollback guarantee; correct in practice [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing pattern
- [x] [Review][Defer] W2: Borrow source-balance check has TOCTOU window under WAL mode — single-writer desktop app, WAL not enabled [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing
- [x] [Review][Defer] W3: Optimistic `createTransaction` appends at wrong sort position (end of list vs. `date DESC`) — no ledger UI yet (Story 3.3) [`src/stores/useTransactionStore.ts`] — deferred, pre-existing
- [x] [Review][Defer] W4: `date` field in `CreateTransactionInput` not validated as ISO 8601 format — stored as-is, breaks date-range filter if malformed [`src-tauri/src/commands/mod.rs`] — deferred, input validation story
- [x] [Review][Defer] W5: `beforeLoad` store-load chain not wrapped in try/catch — exception in `loadIncomeEntries` leaves `loadTransactions` unreached [`src/router.tsx`] — deferred, pre-existing pattern
- [x] [Review][Defer] W6: Concurrent `loadTransactions` during in-flight `createTransaction` orphans the optimistic entry [`src/stores/useTransactionStore.ts`] — deferred, no concurrent navigation exists yet
- [x] [Review][Defer] W7: `borrow_from_envelope` does not block borrowing from savings envelopes — `is_savings` flag unused in borrow logic [`src-tauri/src/commands/mod.rs`] — deferred, Story 5.x concern
- [x] [Review][Defer] W8: `delete_transaction` command absent — explicitly listed in spec's Deferred Items [`src-tauri/src/commands/mod.rs`] — deferred, per spec
- [x] [Review][Defer] W9: `guardReadOnly` not reactive — only evaluated at `beforeLoad`, live `isReadOnly` state changes do not redirect [`src/router.tsx`] — deferred, pre-existing pattern
