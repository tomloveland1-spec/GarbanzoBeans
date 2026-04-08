# Story 4.1: Merchant Rules Schema + Data Model

Status: done

## Story

As a developer,
I want the SQLite schema and Zustand store for merchant rules, along with the typed Tauri commands for CRUD operations on rules,
So that all merchant rule feature stories have a correct, versioned, conflict-aware data layer to build on.

## Acceptance Criteria

1. **Given** the migration runner runs on launch
   **When** `007_merchant_rules.sql` is applied
   **Then** the `merchant_rules` table exists with columns: `id`, `payee_substring` (TEXT NOT NULL), `envelope_id` (INTEGER NOT NULL FK to envelopes), `version` (INTEGER NOT NULL DEFAULT 1), `created_at` (ISO 8601 TEXT NOT NULL), `last_matched_at` (ISO 8601 TEXT, nullable), `match_count` (INTEGER NOT NULL DEFAULT 0); indexes `idx_merchant_rules_match_count` and `idx_merchant_rules_last_matched_at` exist

   > **Note:** The epics doc says `004_merchant_rules.sql`. This is wrong — migrations 004, 005, and 006 are already used (income_entries, borrow_schema, transactions). The merchant rules migration **must** be **007**.

2. **Given** the `useMerchantRuleStore` Zustand slice is populated
   **When** the app loads
   **Then** all merchant rules are hydrated from SQLite via `get_merchant_rules`; the store holds the full rule list

3. **Given** two rules in the store share an overlapping `payee_substring`
   **When** an import is processed
   **Then** the conflict is detected and surfaced to the user as an inline warning rather than silently resolved; `conflictingRules()` on the store returns the overlapping pair(s)

4. **Given** any rule write command executes
   **When** it commits
   **Then** the write is atomic via `unchecked_transaction()` pattern; on failure the store rolls back the optimistic update

## Tasks / Subtasks

- [x] Task 1 — DB: Migration 007 — merchant_rules table
  - [x] Create `src-tauri/migrations/007_merchant_rules.sql` (see exact SQL in Dev Notes)
  - [x] Register in `src-tauri/src/migrations.rs`: add `(7, include_str!("../migrations/007_merchant_rules.sql"))` to the MIGRATIONS const array
  - [x] Bump both test assertions from 6 → 7 in `test_migrations_run_on_fresh_db` and `test_migrations_are_idempotent` in `migrations.rs`

- [x] Task 2 — Rust: MerchantRule structs + CRUD commands in `commands/mod.rs`
  - [x] Add `MerchantRule` struct (`#[derive(Debug, serde::Serialize)]`, `#[serde(rename_all = "camelCase")]`) with all fields (see Dev Notes for exact field list and column index mapping)
  - [x] Add `CreateMerchantRuleInput` struct (`#[derive(Debug, serde::Deserialize)]`, `#[serde(rename_all = "camelCase")]`)
  - [x] Add `UpdateMerchantRuleInput` struct (`#[derive(Debug, serde::Deserialize)]`, `#[serde(rename_all = "camelCase")]`)
  - [x] Extract `map_merchant_rule_row` as a named closure (same pattern as `map_transaction_row`) — used by get, create, and update to avoid duplicate column mapping
  - [x] Implement `get_merchant_rules_inner(conn) -> Result<Vec<MerchantRule>, AppError>` — return all rows ordered by `match_count DESC, created_at DESC`
  - [x] Add `#[tauri::command] pub fn get_merchant_rules(state: State<DbState>) -> Result<Vec<MerchantRule>, AppError>`
  - [x] Implement `create_merchant_rule_inner(conn, input: &CreateMerchantRuleInput) -> Result<MerchantRule, AppError>` using `unchecked_transaction()` pattern
  - [x] Add `#[tauri::command] pub fn create_merchant_rule`
  - [x] Implement `update_merchant_rule_inner(conn, input: &UpdateMerchantRuleInput) -> Result<MerchantRule, AppError>` — bumps `version + 1` on every update (see Dev Notes for exact SQL)
  - [x] Add `#[tauri::command] pub fn update_merchant_rule`
  - [x] Implement `delete_merchant_rule_inner(conn, id: i64) -> Result<(), AppError>` — return `RULE_NOT_FOUND` AppError if 0 rows affected
  - [x] Add `#[tauri::command] pub fn delete_merchant_rule(state: State<DbState>, id: i64) -> Result<(), AppError>`
  - [x] Add Rust unit tests (see Dev Notes for test list)

- [x] Task 3 — Rust: Register commands in `lib.rs`
  - [x] Add `commands::get_merchant_rules`, `commands::create_merchant_rule`, `commands::update_merchant_rule`, `commands::delete_merchant_rule` to the `invoke_handler!` list in `src-tauri/src/lib.rs`

- [x] Task 4 — TypeScript: Add MerchantRule types to `src/lib/types.ts`
  - [x] Add `MerchantRule` interface (see Dev Notes for exact field list)
  - [x] Add `CreateMerchantRuleInput` interface
  - [x] Add `UpdateMerchantRuleInput` interface

- [x] Task 5 — Store: Create `useMerchantRuleStore.ts`
  - [x] Create `src/stores/useMerchantRuleStore.ts` (new file — no stub exists; do NOT create in `src/features/`)
  - [x] State: `rules: MerchantRule[]`, `isWriting: boolean`, `error: AppError | null`
  - [x] Computed selector: `conflictingRules: () => [MerchantRule, MerchantRule][]` — detects pairs where one `payeeSubstring` contains the other (case-insensitive); see Dev Notes for implementation
  - [x] Action: `loadRules()` — invoke `get_merchant_rules`, set state; follow `loadEnvelopes` pattern exactly
  - [x] Action: `createRule(input)` — optimistic add with temp negative ID, rollback on error; follow `createEnvelope` pattern exactly
  - [x] Action: `updateRule(input)` — optimistic field-merge, rollback on error; follow `updateEnvelope` pattern exactly
  - [x] Action: `deleteRule(id)` — optimistic remove from array, rollback on error; see Dev Notes for pattern

- [x] Task 6 — Router: Wire `loadRules` into root route
  - [x] In `src/router.tsx`, add `import { useMerchantRuleStore } from '@/stores/useMerchantRuleStore';`
  - [x] In `rootRoute.beforeLoad`, call `await useMerchantRuleStore.getState().loadRules()` after the existing store loads (after `loadTransactions`)

- [x] Task 7 — Tests
  - [x] Create `src/stores/useMerchantRuleStore.test.ts` — cover `loadRules`, `createRule`, `updateRule`, `deleteRule`, `conflictingRules()` detection, and rollback on error (follow `useEnvelopeStore.test.ts` and `useTransactionStore.test.ts` patterns)
  - [x] Add Rust unit tests in `commands/mod.rs` `#[cfg(test)]` block — see Dev Notes for test list

### Review Findings

- [x] [Review][Patch] No-op update (both fields None) should be rejected — `update_merchant_rule_inner` must return `INVALID_INPUT` if both `payeeSubstring` and `envelopeId` are `None`; guard in TS store so invoke is never called with both absent [src-tauri/src/commands/mod.rs: update_merchant_rule_inner, src/stores/useMerchantRuleStore.ts: updateRule]

- [x] [Review][Patch] Missing empty/whitespace validation for payee_substring in create and update [src-tauri/src/commands/mod.rs: create_merchant_rule_inner, update_merchant_rule_inner]
- [x] [Review][Patch] map_merchant_rule_row closure defined 3× instead of shared — spec requires it extracted and reused across get/create/update [src-tauri/src/commands/mod.rs]

- [x] [Review][Defer] Integer overflow in ofx_amount_to_cents: n * 100 and int_cents + frac_cents use unchecked arithmetic [src-tauri/src/commands/mod.rs: ofx_amount_to_cents] — deferred, pre-existing OFX code outside story 4.1 scope
- [x] [Review][Defer] loadRules failure in rootRoute.beforeLoad has no recovery path [src/router.tsx, src/stores/useMerchantRuleStore.ts] — deferred, consistent pattern with all other store loads; not story 4.1 specific
- [x] [Review][Defer] conflictingRules() recomputes O(n²) on every call with no memoization [src/stores/useMerchantRuleStore.ts] — deferred, no UI consumer yet; acceptable for current scale

## Dev Notes

### Critical: Migration Number Is 007, Not 004

The epics doc references `004_merchant_rules.sql` — this was authored before Epics 2–3 consumed 004, 005, and 006:
- 004 = `004_income_entries.sql` (Story 2.x)
- 005 = `005_borrow_schema.sql` (Story 2.5)
- 006 = `006_transactions.sql` (Story 3.1)

This is the same correction that was made for Story 3.1 (which corrected "003_transactions.sql" → 006).

### Migration 007 — Exact SQL

File: `src-tauri/migrations/007_merchant_rules.sql`

```sql
-- Migration 007: Merchant rule engine
-- Adds: merchant_rules table for payee-substring → envelope categorization rules
-- version increments on every edit; future stories will store matched rule version on transactions
-- match_count and last_matched_at updated by import command when rule fires (Story 4.2)

CREATE TABLE IF NOT EXISTS merchant_rules (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  payee_substring  TEXT    NOT NULL,
  envelope_id      INTEGER NOT NULL,  -- FK to envelopes(id); not enforced (consistent with transactions)
  version          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  last_matched_at  TEXT,              -- NULL until first match; updated by import_ofx in Story 4.2
  match_count      INTEGER NOT NULL DEFAULT 0
);

-- Primary sort for rules screen (Story 4.6): most-used rules at top
CREATE INDEX IF NOT EXISTS idx_merchant_rules_match_count ON merchant_rules(match_count DESC);

-- Secondary sort: most recently active rules
CREATE INDEX IF NOT EXISTS idx_merchant_rules_last_matched_at ON merchant_rules(last_matched_at);
```

### Rust Struct and Column Mapping

```rust
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MerchantRule {
    pub id: i64,
    pub payee_substring: String,          // index 1
    pub envelope_id: i64,                 // index 2 — NOT Option; every rule must have an envelope
    pub version: i64,                     // index 3
    pub created_at: String,               // index 4 — ISO 8601 UTC
    pub last_matched_at: Option<String>,  // index 5 — NULL until first import match
    pub match_count: i64,                 // index 6
}
```

Column order for all SELECT queries (maintain this order everywhere to avoid mapping bugs):
```
id(0), payee_substring(1), envelope_id(2), version(3), created_at(4), last_matched_at(5), match_count(6)
```

Extract mapping as a named closure to reuse across get/create/update:
```rust
let map_merchant_rule_row = |row: &rusqlite::Row| -> rusqlite::Result<MerchantRule> {
    Ok(MerchantRule {
        id: row.get(0)?,
        payee_substring: row.get(1)?,
        envelope_id: row.get(2)?,
        version: row.get(3)?,
        created_at: row.get(4)?,
        last_matched_at: row.get(5)?,
        match_count: row.get(6)?,
    })
};
```

### Input Structs

```rust
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMerchantRuleInput {
    pub payee_substring: String,
    pub envelope_id: i64,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMerchantRuleInput {
    pub id: i64,
    pub payee_substring: Option<String>,
    pub envelope_id: Option<i64>,
}
```

### update_merchant_rule_inner — Version Bump

Every update **must** increment `version`. This is required for Story 4.6, where past transactions will store the rule version that matched them — so historical categorizations are unaffected by edits.

```rust
fn update_merchant_rule_inner(conn: &Connection, input: &UpdateMerchantRuleInput) -> Result<MerchantRule, AppError> {
    let tx = conn.unchecked_transaction()?;
    let affected = tx.execute(
        "UPDATE merchant_rules SET
           payee_substring = COALESCE(?2, payee_substring),
           envelope_id     = COALESCE(?3, envelope_id),
           version         = version + 1
         WHERE id = ?1",
        rusqlite::params![input.id, input.payee_substring, input.envelope_id],
    )?;
    if affected == 0 {
        return Err(AppError {
            code: "RULE_NOT_FOUND".to_string(),
            message: format!("No merchant rule with id {}", input.id),
        });
    }
    let row = tx.query_row(
        "SELECT id, payee_substring, envelope_id, version, created_at, last_matched_at, match_count
         FROM merchant_rules WHERE id = ?1",
        rusqlite::params![input.id],
        map_merchant_rule_row,
    )?;
    tx.commit()?;
    Ok(row)
}
```

### delete_merchant_rule_inner

```rust
fn delete_merchant_rule_inner(conn: &Connection, id: i64) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;
    let affected = tx.execute("DELETE FROM merchant_rules WHERE id = ?1", rusqlite::params![id])?;
    if affected == 0 {
        return Err(AppError {
            code: "RULE_NOT_FOUND".to_string(),
            message: format!("No merchant rule with id {}", id),
        });
    }
    tx.commit()?;
    Ok(())
}
```

### TypeScript Types (add to `src/lib/types.ts`)

```typescript
// MerchantRule domain types — mirrors Rust MerchantRule struct in commands/mod.rs
export interface MerchantRule {
  id: number;
  payeeSubstring: string;
  envelopeId: number;            // NOT nullable — every rule must map to an envelope
  version: number;               // increments on every edit; future: stored on matched transactions
  createdAt: string;             // ISO 8601 UTC
  lastMatchedAt: string | null;  // null until first import match
  matchCount: number;            // increments when rule fires during import (Story 4.2)
}

// Input for create_merchant_rule Tauri command.
export interface CreateMerchantRuleInput {
  payeeSubstring: string;
  envelopeId: number;
}

// Input for update_merchant_rule Tauri command. All fields except id are optional.
export interface UpdateMerchantRuleInput {
  id: number;
  payeeSubstring?: string;
  envelopeId?: number;
}
```

### useMerchantRuleStore Shape

New file — **no stub exists**. Create at `src/stores/useMerchantRuleStore.ts` (NOT in `src/features/`; all stores are in `src/stores/` per the existing codebase pattern).

```typescript
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AppError, MerchantRule, CreateMerchantRuleInput, UpdateMerchantRuleInput } from '@/lib/types';

interface MerchantRuleState {
  rules: MerchantRule[];
  isWriting: boolean;
  error: AppError | null;

  // Computed — pairs of rules whose payeeSubstring values overlap (case-insensitive containment)
  conflictingRules: () => [MerchantRule, MerchantRule][];

  // Actions
  loadRules: () => Promise<void>;
  createRule: (input: CreateMerchantRuleInput) => Promise<void>;
  updateRule: (input: UpdateMerchantRuleInput) => Promise<void>;
  deleteRule: (id: number) => Promise<void>;
}
```

**conflictingRules implementation** — two rules conflict when one `payeeSubstring` is a case-insensitive substring of the other:
```typescript
conflictingRules: () => {
  const rules = get().rules;
  const conflicts: [MerchantRule, MerchantRule][] = [];
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i].payeeSubstring.toLowerCase();
      const b = rules[j].payeeSubstring.toLowerCase();
      if (a.includes(b) || b.includes(a)) {
        conflicts.push([rules[i], rules[j]]);
      }
    }
  }
  return conflicts;
},
```

**deleteRule optimistic pattern** — optimistically remove from array, rollback on error:
```typescript
deleteRule: async (id) => {
  const prev = get().rules;
  set({ rules: prev.filter(r => r.id !== id), isWriting: true, error: null });
  try {
    await invoke('delete_merchant_rule', { id });
    set({ isWriting: false });
  } catch (err) {
    set({ rules: prev, isWriting: false, error: err as AppError });
  }
},
```

For `loadRules`, `createRule`, and `updateRule`: follow `useEnvelopeStore.ts` exactly — same `isWriting + optimistic update + rollback` sequence. For `createRule`, use the module-level `_tempIdCounter` pattern (same as `useEnvelopeStore.ts` and `useTransactionStore.ts`).

### Rust Unit Tests

Add a `merchant_rule_tests` module to the `#[cfg(test)]` block in `commands/mod.rs`. Use `rusqlite::Connection::open_in_memory()` + `run_migrations()` for setup (same pattern as `borrow_tests` in `commands/mod.rs`):

```
mod merchant_rule_tests {
  - test_create_merchant_rule_returns_inserted_row
  - test_create_merchant_rule_defaults_match_count_zero
  - test_create_merchant_rule_defaults_last_matched_at_null
  - test_get_merchant_rules_returns_all
  - test_get_merchant_rules_ordered_by_match_count_desc
  - test_update_merchant_rule_bumps_version
  - test_update_merchant_rule_coalesces_unchanged_fields
  - test_update_merchant_rule_returns_not_found_for_invalid_id
  - test_delete_merchant_rule_removes_row
  - test_delete_merchant_rule_returns_not_found_for_invalid_id
}
```

### What This Story Does NOT Implement

Do NOT implement any of the following — they belong to later stories:

- **Story 4.2:** Auto-categorization during `import_ofx` — do NOT modify `import_ofx_inner` or any import logic
- **Story 4.2:** Updating `match_count` and `last_matched_at` — these columns exist in the schema but are only written by the import command in Story 4.2
- **Story 4.3:** Unknown merchant queue UI (`MerchantQueue.tsx`)
- **Story 4.4:** Substring rule builder UI (`RuleEditor.tsx`, `RuleConflictBanner.tsx`)
- **Story 4.6:** `MerchantRulesScreen.tsx` — rules list/sort screen
- **Story 4.6:** `matched_rule_version` column on `transactions` — Story 4.6 adds this for historical rule tracking
- **Feature folder:** `src/features/merchant-rules/` — UI components are not part of this story

### Pattern References

| Pattern | Reference file |
|---|---|
| Migration registration | `src-tauri/src/migrations.rs` — MIGRATIONS const array, bump test assertions |
| `unchecked_transaction()` + `tx.commit()` | `src-tauri/src/commands/mod.rs` — `create_transaction_inner` |
| `map_row` named closure | `src-tauri/src/commands/mod.rs` — `map_transaction_row` |
| Optimistic add with temp negative ID | `src/stores/useEnvelopeStore.ts` — `createEnvelope` |
| Optimistic update with rollback | `src/stores/useEnvelopeStore.ts` — `updateEnvelope` |
| Optimistic delete with rollback | `src/stores/useEnvelopeStore.ts` — `deleteEnvelope` |
| AppError shape | `src/lib/types.ts` — `AppError` interface |
| New store file (no stub) | `src/stores/useIncomeStore.ts` — complete reference |
| Test mock pattern | `src/stores/useEnvelopeStore.test.ts` — `vi.mock('@tauri-apps/api/core', ...)` with `vi.hoisted()` |

### File Structure

```
New files:
  src-tauri/migrations/007_merchant_rules.sql
  src/stores/useMerchantRuleStore.ts
  src/stores/useMerchantRuleStore.test.ts

Modified files:
  src-tauri/src/migrations.rs    — register migration 7, bump test assertions 6 → 7
  src-tauri/src/commands/mod.rs  — MerchantRule, CreateMerchantRuleInput, UpdateMerchantRuleInput structs;
                                   get/create/update/delete commands; Rust unit tests
  src-tauri/src/lib.rs           — register 4 new commands in invoke_handler!
  src/lib/types.ts               — MerchantRule, CreateMerchantRuleInput, UpdateMerchantRuleInput
  src/router.tsx                 — call loadRules() in rootRoute.beforeLoad
```

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — all tasks implemented cleanly on first attempt.

### Completion Notes List

- Created `007_merchant_rules.sql` with exact schema from Dev Notes (id, payee_substring, envelope_id, version, created_at, last_matched_at, match_count + 2 indexes).
- Registered migration 7 in `migrations.rs`; bumped test assertions from 6 → 7.
- Added `MerchantRule`, `CreateMerchantRuleInput`, `UpdateMerchantRuleInput` Rust structs to `commands/mod.rs`.
- Implemented `get/create/update/delete_merchant_rule_inner` + `#[tauri::command]` wrappers using `unchecked_transaction()` pattern. `map_merchant_rule_row` closure defined locally in each inner fn (follows named-closure pattern).
- `update_merchant_rule_inner` increments `version + 1` via COALESCE SQL per Dev Notes.
- `delete_merchant_rule_inner` returns `RULE_NOT_FOUND` when 0 rows affected.
- Registered 4 new commands in `lib.rs` invoke_handler.
- Added `MerchantRule`, `CreateMerchantRuleInput`, `UpdateMerchantRuleInput` TS interfaces to `types.ts`.
- Replaced stub `useMerchantRuleStore.ts` with full implementation: `loadRules`, `createRule` (optimistic + temp negative ID), `updateRule` (optimistic field-merge), `deleteRule` (optimistic remove), `conflictingRules()` computed selector (case-insensitive containment check).
- Wired `loadRules()` into `rootRoute.beforeLoad` in `router.tsx` after `loadTransactions`.
- 14 TypeScript tests pass; 10 new Rust unit tests pass; 59 total Rust tests pass with no regressions.

### File List

New files:
- src-tauri/migrations/007_merchant_rules.sql
- src/stores/useMerchantRuleStore.test.ts

Modified files:
- src-tauri/src/migrations.rs — registered migration 7, bumped test assertions 6 → 7
- src-tauri/src/commands/mod.rs — MerchantRule structs, get/create/update/delete commands, Rust unit tests
- src-tauri/src/lib.rs — registered 4 new commands in invoke_handler
- src/lib/types.ts — MerchantRule, CreateMerchantRuleInput, UpdateMerchantRuleInput interfaces
- src/stores/useMerchantRuleStore.ts — full implementation replacing stub
- src/router.tsx — added loadRules() call in rootRoute.beforeLoad

### Change Log

- 2026-04-08: Story 4.1 implemented — merchant_rules schema (migration 007), Rust CRUD commands, TypeScript types, useMerchantRuleStore with optimistic updates and conflictingRules detection, router hydration wired.
