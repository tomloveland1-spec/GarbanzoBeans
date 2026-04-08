# Story 2.4: Envelope Allocation — Monthly Planning Session

Status: done

## Story

As Tom,
I want to allocate money to my envelopes for the month in a guided flow,
So that my budget is funded and ready before the month's spending begins.

## Acceptance Criteria

1. **Given** Tom is on the Budget screen with at least one envelope
   **When** he clicks "Allocate"
   **Then** the allocation screen opens showing each envelope by name with a dollar-amount input field pre-filled with its current allocated amount

2. **Given** Tom is on the allocation screen
   **When** he looks at the top of the screen
   **Then** he sees a section where he can add named income entries (e.g. "1st Paycheck $2,500", "2nd Paycheck $2,500") and the total of those entries is shown as "Available to Allocate: $X,XXX.XX"

3. **Given** Tom adds a new income entry with a name and amount
   **When** he submits it
   **Then** it appears in the income list immediately and the "Available to Allocate" balance increases by that amount

4. **Given** Tom deletes an income entry
   **When** he clicks the delete button on it
   **Then** it disappears and the "Available to Allocate" balance decreases accordingly

5. **Given** Tom changes the dollar amount in an envelope's input field
   **When** the "Available to Allocate" and allocated total are both visible
   **Then** they update live as he types so he can see exactly how much he has left or how much he is over

6. **Given** Tom types something invalid into an envelope input (letters, or a negative number) and then tabs away
   **When** his cursor leaves the field
   **Then** the field gets a red border and a short error message appears beneath it — no popup, no modal

7. **Given** Tom's envelope amounts add up to more than his income
   **When** he looks at the Confirm button
   **Then** it is disabled and a message tells him how much over budget he is (e.g. "Over budget by $150.00")

8. **Given** Tom's allocations are within his income and no inputs have errors
   **When** he clicks Confirm
   **Then** he is taken back to the Budget screen and every envelope's traffic-light badge reflects the new amounts immediately — no refresh needed

9. **Given** Tom closes and reopens the app, then navigates back to the allocation screen
   **When** the screen loads
   **Then** his income entries (names and amounts) are still there from his previous session

10. **Given** Tom is on the Budget screen with no envelopes yet
    **When** he opens the allocation screen
    **Then** he sees a message like "Add envelopes on the Budget screen before allocating." instead of an empty list

11. **Given** Tom is in read-only mode (a second instance of the app is open)
    **When** he is on the Budget screen
    **Then** the "Allocate" button is not visible

## Tasks / Subtasks

- [x] Task 1 — DB: Add `income_entries` migration (AC: 2, 3, 4, 9)
  - [x] Write migration `002_income_entries.sql` in `src-tauri/migrations/`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `name TEXT NOT NULL`, `amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0)`; no month_key column for now (Epic 6 will add month scoping)
  - [x] Run the migration through the existing migration runner (verify `apply_migrations` in `db.rs` picks it up by version number)

- [x] Task 2 — Rust: Income entry commands (AC: 5, 6, 7)
  - [x] Add `IncomeEntry` struct (mirrors DB row: `id`, `name`, `amount_cents`) with `#[derive(serde::Serialize)]`
  - [x] Add `CreateIncomeEntryInput` struct with `name: String`, `amount_cents: i64`
  - [x] Implement `get_income_entries_inner(conn) -> Result<Vec<IncomeEntry>, AppError>` — `SELECT id, name, amount_cents FROM income_entries ORDER BY id ASC`
  - [x] Implement `create_income_entry_inner(conn, input) -> Result<IncomeEntry, AppError>` — validate name non-empty and `amount_cents >= 0`; INSERT + re-SELECT
  - [x] Implement `delete_income_entry_inner(conn, id) -> Result<(), AppError>` — DELETE + `ENTRY_NOT_FOUND` if `changes() == 0`
  - [x] Register `#[tauri::command]` handlers for `get_income_entries`, `create_income_entry`, `delete_income_entry` in `lib.rs`
  - [x] Add unit tests for all three inner functions

- [x] Task 3 — Rust: Bulk allocation command (AC: 3, 4, 8)
  - [x] Define `AllocateEnvelopesInput` struct with `allocations: Vec<AllocationItem>` where `AllocationItem` has `id: i64`, `allocated_cents: i64`
  - [x] Implement `allocate_envelopes_inner(conn, input) -> Result<Vec<Envelope>, AppError>`:
    - Open a single transaction
    - Validate all `allocated_cents >= 0`; return `INVALID_ALLOCATED_CENTS` on first failure
    - For each item: `UPDATE envelopes SET allocated_cents = ?2 WHERE id = ?1`; return `ENVELOPE_NOT_FOUND` if `changes() == 0`
    - After all updates: re-SELECT all modified envelopes; commit; return the updated `Vec<Envelope>`
  - [x] Register `#[tauri::command]` handler `allocate_envelopes` in `lib.rs`
  - [x] Add unit tests: happy path multi-envelope, zero-cents allowed, negative-cents rejected, unknown-id rejected

- [x] Task 4 — Store: Income entries (AC: 5, 6, 7)
  - [x] Create `src/stores/useIncomeStore.ts` following the same pattern as `useEnvelopeStore`:
    - State: `entries: IncomeEntry[]`, `isWriting: boolean`, `error: AppError | null`
    - Actions: `loadIncomeEntries()`, `createIncomeEntry(input)`, `deleteIncomeEntry(id)`
    - `createIncomeEntry` uses optimistic add (temp negative ID); `deleteIncomeEntry` uses optimistic remove; both roll back on error
  - [x] Add `IncomeEntry` and `CreateIncomeEntryInput` types to `src/lib/types.ts`
  - [x] Add `loadIncomeEntries()` call to the root route `beforeLoad` in `router.tsx` (alongside `loadEnvelopes`)

- [x] Task 5 — Store: Allocation action in `useEnvelopeStore` (AC: 3, 8)
  - [x] Add `allocateEnvelopes(allocations: { id: number; allocatedCents: number }[]) => Promise<void>` action to `useEnvelopeStore`
  - [x] Optimistic: snapshot `prev`, apply all `allocatedCents` changes immediately in the store
  - [x] On success: replace each affected envelope with the authoritative DB response (returned `Vec<Envelope>`)
  - [x] On error: rollback to `prev`; set `error`

- [x] Task 6 — UI: Allocation screen (AC: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
  - [x] Create `src/features/envelopes/AllocationPage.tsx`
  - [x] Add route `/budget/allocate` in `router.tsx`; protect with `isReadOnly` guard (redirect to `/` if read-only)
  - [x] **Income section** (top): income entry list + add form + Available to Allocate total
  - [x] **Envelope list** (below income): empty state, per-envelope inputs pre-populated, blur validation, live running total
  - [x] **Footer**: Confirm button disabled on overage/errors, overage message, Cancel navigation
  - [x] On Confirm: call `allocateEnvelopes` with parsed cents values; on success navigate to `/`
  - [x] Show inline error from store on command failure

- [x] Task 7 — UI: Budget screen entry point (AC: 9)
  - [x] Add "Allocate" button to the Budget screen (in EnvelopeList) next to "Add Envelope"
  - [x] Button navigates to `/budget/allocate`
  - [x] Button is hidden (not just disabled) when `isReadOnly`

- [x] Task 8 — Tests (AC: 1–10)
  - [x] `src/stores/useIncomeStore.test.ts`: 8 tests — optimistic add, rollback on error, optimistic delete, rollback on delete error, load, load error
  - [x] `src/features/envelopes/AllocationPage.test.tsx`: 11 tests covering all ACs

### Review Findings

- [x] [Review][Patch] `handleConfirm` submits stale `d.cents` for unblurred fields — when the user edits an input but never blurs it before clicking Confirm, `d.cents` still holds the initial `env.allocatedCents` from `useState`, not the typed value. The `allValid` check correctly re-parses from `d.value`, but `allocations` is built with `d.cents!` — the wrong value is submitted. Fix: replace `d.cents!` with `parseCents(d.value)!` in the allocations mapping. [`src/features/envelopes/AllocationPage.tsx:handleConfirm`]
- [x] [Review][Defer] `loadIncomeEntries` sets `isWriting: true` for a read operation [`src/stores/useIncomeStore.ts:24`] — deferred, pre-existing pattern (same as `loadEnvelopes`, `loadSettings`)
- [x] [Review][Defer] `allocate_envelopes_inner` re-SELECT SQL hits `SQLITE_MAX_VARIABLE_NUMBER` limit at 999 envelopes [`src-tauri/src/commands/mod.rs`] — deferred, pathological for MVP
- [x] [Review][Defer] Concurrent income entry mutations can interleave optimistic state [`src/stores/useIncomeStore.ts`] — deferred, theoretical in single-user desktop context
- [x] [Review][Defer] `loadIncomeEntries` in root `beforeLoad` has no error handling [`src/router.tsx:59`] — deferred, pre-existing pattern
- [x] [Review][Defer] Optimistic delete can target a temp (negative) ID during in-flight create [`src/stores/useIncomeStore.ts`] — deferred, contrived race condition

## Dev Notes

### Income Entry Design (Named Paychecks — Tom's Direction)

Per Tom's explicit direction (2026-04-07), pay schedule dates were removed from onboarding. The replacement design is **named income entries** — Tom enters "1st Paycheck $2,500" and "2nd Paycheck $2,500" instead of dates. This is the authoritative implementation of that concept.

For Story 2.4, income entries are **not month-scoped** — they are stored globally and reused each month as a starting point. Epic 6 (Turn the Month) will add month-key scoping when the month lifecycle is introduced. This is acceptable MVP behavior; Tom's income is roughly consistent month-to-month.

[Source: _bmad-output/implementation-artifacts/deferred-work.md — "Pay schedule removed from onboarding — named paychecks deferred to Epic 2.4"]

### No `month_key` in Migration 002

`income_entries` intentionally omits `month_key` — Epic 6 will add it via a future migration when the `months` table and month lifecycle exist. This prevents premature coupling to a schema that doesn't exist yet.

### `allocate_envelopes` as a Bulk Atomic Command

The epics spec names `allocate_envelopes` explicitly (AC3 of the epic). Use a single transaction covering all updates — this is critical for integrity. Do NOT call `update_envelope` N times from the frontend; that is not atomic and would leave the DB in a partial state on failure.

The command returns `Vec<Envelope>` (all updated envelopes) so the store can replace store state with authoritative DB data in one pass.

[Source: _bmad-output/planning-artifacts/epics.md#Story 2.4]

### `update_envelope` COALESCE / `month_id` NULL Caveat

The existing `update_envelope` command uses `COALESCE(?6, month_id)` which cannot clear `month_id` to NULL. **Do not use `update_envelope` for the allocation flow** — use the new `allocate_envelopes` command which only touches `allocated_cents` and has no COALESCE ambiguity.

[Source: _bmad-output/implementation-artifacts/deferred-work.md — "update_envelope COALESCE cannot clear month_id to NULL"]

### Dollar Amount Input → Integer Cents Boundary

The allocation inputs accept dollar amounts from the user (e.g. "250.00"). Parse to integer cents at the blur boundary and store in the local draft state as cents. Never pass floats to `allocateEnvelopes`. The `formatCurrency` utility handles display-only conversion.

Use `Math.round(parseFloat(value) * 100)` for parsing; validate `Number.isFinite()` and `>= 0` after parsing.

[Source: _bmad-output/planning-artifacts/architecture.md — "Integer cents for all monetary values; formatCurrency() only at display boundary"]

### Optimistic Update Pattern

Both `useIncomeStore` and the `allocateEnvelopes` action in `useEnvelopeStore` must follow the established optimistic-update + rollback pattern:
1. Capture `prev = get().state`
2. Apply optimistic change immediately
3. Invoke Tauri command
4. On success: replace with authoritative DB response
5. On error: `set({ state: prev, error: err })`

[Source: src/stores/useEnvelopeStore.ts:71-107]

### Read-Only Guard on Allocation Route

The allocation route must be inaccessible in read-only mode. Implement as a `beforeLoad` guard in the route definition (same pattern as `guardOnboarding` in `router.tsx`). Also hide the "Allocate" button on the Budget screen when `isReadOnly`.

[Source: src/router.tsx — guardOnboarding pattern]

### Settings Screen Pay Schedule Fields

The Settings screen still has pay schedule fields from the old design (pay frequency / pay dates). These should be evaluated for removal or replacement when this story is designed, but are **out of scope** for Story 2.4 implementation. Log a deferred-work entry if they are not addressed.

### Project Structure Notes

New files:
- `src-tauri/migrations/002_income_entries.sql`
- `src-tauri/src/commands/income.rs` (or add to existing `commands/mod.rs`)
- `src/stores/useIncomeStore.ts`
- `src/features/envelopes/AllocationPage.tsx`
- `src/features/envelopes/AllocationPage.test.tsx`
- `src/stores/useIncomeStore.test.ts`

Modified files:
- `src-tauri/src/commands/mod.rs` — add `allocate_envelopes` command + structs + tests
- `src-tauri/src/lib.rs` — register new commands
- `src/stores/useEnvelopeStore.ts` — add `allocateEnvelopes` action
- `src/lib/types.ts` — add `IncomeEntry`, `CreateIncomeEntryInput`, `AllocateEnvelopesInput`
- `src/router.tsx` — add `/budget/allocate` route, read-only guard, `loadIncomeEntries` in `beforeLoad`
- `src/features/envelopes/EnvelopeList.tsx` (or budget screen) — add "Allocate" button

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4] — Epic ACs verbatim
- [Source: _bmad-output/planning-artifacts/architecture.md] — Store-first IPC, integer cents, optimistic update pattern
- [Source: src/stores/useEnvelopeStore.ts] — Reference implementation for store pattern
- [Source: src-tauri/src/commands/mod.rs] — Reference implementation for Rust commands, `AppError` struct, `unchecked_transaction` pattern
- [Source: src/router.tsx] — Route guard pattern (`guardOnboarding`)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — Named paychecks design direction, COALESCE caveat

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Rust E0505: `stmt` borrows `tx`; fixed by wrapping query in inner block with named local variable per compiler suggestion.
- Rust E0597: `stmt` lifetime issue with `?` operator; fixed by naming the collect result before ending the block.
- TypeScript TS6133: Removed unused `initDraft` callback from AllocationPage.
- Vitest hoisting error: `vi.mock` factory referenced top-level consts; fixed by moving all mock functions into `vi.hoisted()`.
- Live total test failure: `totalAllocatedCents` was reading `d.cents` (only set on blur); changed to parse `d.value` directly so total updates while typing.

### Completion Notes List

- Migration 004 adds `income_entries` table (no month_key — Epic 6 will add scoping).
- Rust: `get_income_entries`, `create_income_entry`, `delete_income_entry`, `allocate_envelopes` commands + 16 new unit tests (8 income, 6 allocation, 2 migration version bumps).
- `allocate_envelopes` is a single atomic transaction — validates all items before any UPDATE, rolls back on any failure.
- TypeScript: `IncomeEntry`, `CreateIncomeEntryInput`, `AllocateEnvelopesInput` added to `types.ts`.
- `useIncomeStore` follows optimistic-update + rollback pattern; `loadIncomeEntries` added to root `beforeLoad`.
- `allocateEnvelopes` action added to `useEnvelopeStore`; uses `Map` for O(1) lookup when merging DB response.
- `AllocationPage`: income section (named paychecks), envelope allocation inputs with blur validation, live running total (parses `value` string directly, not cached `cents`), overage guard, Confirm/Cancel.
- `/budget/allocate` route with `guardReadOnly()` guard; "Allocate" button in `EnvelopeList` hidden when `isReadOnly`.
- 127 total tests pass (up from 116).

### File List

- `src-tauri/migrations/004_income_entries.sql` — NEW
- `src-tauri/src/migrations.rs` — updated (migration 4, version assertions)
- `src-tauri/src/commands/mod.rs` — updated (income + allocation types, commands, tests)
- `src-tauri/src/lib.rs` — updated (4 new commands registered)
- `src/lib/types.ts` — updated (`IncomeEntry`, `CreateIncomeEntryInput`, `AllocateEnvelopesInput`)
- `src/stores/useIncomeStore.ts` — NEW
- `src/stores/useIncomeStore.test.ts` — NEW
- `src/stores/useEnvelopeStore.ts` — updated (`allocateEnvelopes` action)
- `src/router.tsx` — updated (`guardReadOnly`, `/budget/allocate` route, `loadIncomeEntries`)
- `src/features/envelopes/AllocationPage.tsx` — NEW
- `src/features/envelopes/AllocationPage.test.tsx` — NEW
- `src/features/envelopes/EnvelopeList.tsx` — updated ("Allocate" button)
