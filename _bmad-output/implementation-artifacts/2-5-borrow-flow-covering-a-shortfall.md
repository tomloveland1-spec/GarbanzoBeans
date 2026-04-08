# Story 2.5: Borrow Flow — Covering a Shortfall

Status: done

## Story

As Tom,
I want to borrow money from other funded envelopes to cover a shortfall in one envelope,
so that I can handle unexpected expenses without the app making me feel bad about it.

## Acceptance Criteria

1. **Given** an envelope has no allocation (`allocatedCents === 0`) or is overspent (`spentCents > allocatedCents`)
   **When** Tom views the envelope card
   **Then** a "Borrow" button is visible on that card (hidden in read-only mode, hidden when state is `funded`)

2. **Given** Tom clicks "Borrow" on an unfunded or overspent envelope (the "target")
   **When** the `BorrowOverlay` Dialog opens
   **Then** it lists all other envelopes where `allocatedCents > 0` as candidate sources, sorted: Want priority first, then Should, then Need; the savings envelope (`isSavings: true`) appears last, separated by a visual divider; if no funded sources exist, shows an empty state message

3. **Given** the `BorrowOverlay` is open and Tom selects a source envelope and enters an amount
   **When** Tom types in the amount input
   **Then** the source envelope's displayed available balance decreases in real time; the target envelope's displayed shortfall decreases in real time; neither change is committed to the store or DB until Tom confirms

4. **Given** Tom selects the savings envelope as the borrow source and clicks "Borrow"
   **When** the borrow action is initiated
   **Then** the Dialog transitions to a savings confirmation view (not a nested Dialog): title reads `Borrow ${formatCurrency(amount)} from Savings`; body shows `New savings balance: ${formatCurrency(savingsBalance - amount)}`; copy reads "This is exactly what it's for."; Ghost Cancel on the left, Primary Confirm (lime) on the right

5. **Given** Tom confirms a borrow (from a regular or savings source)
   **When** the `borrow_from_envelope` Tauri command succeeds
   **Then** the source envelope's `allocatedCents` is reduced; the target envelope's `allocatedCents` is increased; a row is inserted into `borrow_events`; the store updates both envelopes with the authoritative DB response; the overlay closes; no follow-up modal

6. **Given** Tom cancels at any point — clicking Cancel in the source list, pressing Escape, clicking the savings confirmation Cancel, or clicking outside the Dialog
   **When** cancellation occurs
   **Then** no data is written; the overlay closes; both envelopes remain at their original `allocatedCents` values (no optimistic state was applied — preview is local-only until confirm)

7. **Given** Tom creates a new envelope via the Add Envelope form
   **When** he checks "This is my savings envelope"
   **Then** the envelope is saved with `is_savings = 1` in the DB; the borrow overlay will identify it as the savings source and display it separately

## Tasks / Subtasks

- [x] Task 1 — DB: Add borrow schema (AC: 2, 5, 7)
  - [x] Write `src-tauri/migrations/005_borrow_schema.sql`:
    - `ALTER TABLE envelopes ADD COLUMN is_savings INTEGER NOT NULL DEFAULT 0 CHECK (is_savings IN (0,1));`
    - `CREATE TABLE IF NOT EXISTS borrow_events (id INTEGER PRIMARY KEY AUTOINCREMENT, source_envelope_id INTEGER NOT NULL, target_envelope_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL CHECK (amount_cents > 0), created_at TEXT NOT NULL DEFAULT (datetime('now')));`
    - No `month_key` yet — Epic 6 adds month scoping (same pattern as `income_entries`)
  - [x] Register migration in `src-tauri/src/migrations.rs`: add `(5, include_str!("../migrations/005_borrow_schema.sql"))` to MIGRATIONS array
  - [x] Bump both test assertions: `assert_eq!(version, 5, ...)` in `test_migrations_run_on_fresh_db` and `test_migrations_are_idempotent`

- [x] Task 2 — Rust: Update Envelope struct and all SELECT queries (AC: 1–7)
  - [x] Add `pub is_savings: bool` to the `Envelope` struct in `commands/mod.rs`; deserialize as `row.get::<_, i64>(7)? != 0` (index 7 in all queries)
  - [x] Update ALL four SELECT queries to include `is_savings` at position 7
  - [x] Add `pub is_savings: Option<bool>` to `CreateEnvelopeInput`; wire into INSERT
  - [x] Add `pub is_savings: Option<bool>` to `UpdateEnvelopeInput`; wire into UPDATE

- [x] Task 3 — Rust: `borrow_from_envelope` command (AC: 3, 4, 5)
  - [x] Add `BorrowInput` struct (Deserialize, camelCase)
  - [x] Add `BorrowResult` struct (Serialize, camelCase)
  - [x] Implement `borrow_from_envelope_inner` with all validations and transaction
  - [x] Add `#[tauri::command] pub fn borrow_from_envelope`
  - [x] Register `borrow_from_envelope` in `src-tauri/src/lib.rs`
  - [x] Add unit tests for `borrow_from_envelope_inner` (5 tests in `borrow_tests` module)

- [x] Task 4 — TypeScript: Type updates (AC: 1–7)
  - [x] Add `isSavings: boolean` to `Envelope` interface in `src/lib/types.ts`
  - [x] Add `isSavings?: boolean` to `CreateEnvelopeInput` interface
  - [x] Add `isSavings?: boolean` to `UpdateEnvelopeInput` interface
  - [x] Add `BorrowInput` interface: `{ sourceEnvelopeId: number; targetEnvelopeId: number; amountCents: number }`
  - [x] Add `BorrowResult` interface: `{ source: Envelope; target: Envelope }`

- [x] Task 5 — Store: `borrowFromEnvelope` action (AC: 3, 5, 6)
  - [x] Add `borrowError: AppError | null` to `EnvelopeState` interface; initialize to `null`
  - [x] Add `borrowFromEnvelope(input: BorrowInput) => Promise<void>` to `useEnvelopeStore`

- [x] Task 6 — UI: `BorrowOverlay` component (AC: 2, 3, 4, 5, 6)
  - [x] Create `src/features/envelopes/BorrowOverlay.tsx`
  - [x] Single Dialog with `step: 'select' | 'confirm-savings'` state
  - [x] Source list sorted Want → Should → Need; savings last with divider
  - [x] Real-time preview, disabled Borrow button logic, amount validation
  - [x] Savings confirmation view with correct title, balance, and copy
  - [x] Inline borrowError display; onOpenChange resets state

- [x] Task 7 — UI: `EnvelopeCard` Borrow button (AC: 1)
  - [x] Add `isBorrowOpen` state; show Borrow button when `caution` or `overspent` and not read-only
  - [x] Render `<BorrowOverlay>` at bottom of card

- [x] Task 8 — UI: `AddEnvelopeForm` — is_savings checkbox (AC: 7)
  - [x] Add `isSavings` state; add checkbox "This is my savings envelope"
  - [x] Pass `isSavings` to `createEnvelope`

- [x] Task 9 — Tests (AC: 1–7)
  - [x] `src/features/envelopes/BorrowOverlay.test.tsx` — 13 tests covering all ACs
  - [x] `src-tauri/src/commands/mod.rs` — 5 Rust unit tests in `borrow_tests` module
  - [x] `src/stores/useEnvelopeStore.test.ts` — 3 borrow store tests added

## Dev Notes

### Savings Envelope Identification

The `envelopes` table gains `is_savings INTEGER NOT NULL DEFAULT 0` in migration 005. This is the minimal flag needed for Story 2.5. Epic 5 (Story 5-2) will add full savings visual treatment and formalize savings semantics. For now, `is_savings = 1` is the sole signal used by the borrow overlay to separate and handle the savings envelope.

No DB constraint enforces "at most one savings envelope" — that is left to the UI (checkbox behavior). Tom is the sole user; this is acceptable for MVP.

### No Nested Dialogs — Single Dialog with Step State

Radix UI (used by shadcn) has a single focus trap and portal per Dialog. **Do not nest two `<Dialog>` components.** Instead, `BorrowOverlay` uses a single `Dialog` with local `step: 'select' | 'confirm-savings'` state:
- `step === 'select'` renders the source list
- `step === 'confirm-savings'` renders the savings confirmation

Clicking Cancel from the savings confirmation sets `step` back to `'select'`; it does NOT close the Dialog. The Dialog only closes on final confirm or explicit cancel from the source list.

[Source: Radix UI Dialog docs — single focus trap per Dialog portal]

### Runway Estimate Deferred to Epic 5

Epic 5 (FR21–FR25) introduces runway calculation. The savings confirmation dialog (AC4) in the epics spec says "body shows resulting savings balance and runway estimate." **For Story 2.5, omit the runway estimate.** Show only `New savings balance: ${formatCurrency(savingsBalance - amount)}`. Add a note in `deferred-work.md` that runway estimate in borrow confirmation is deferred to Epic 5.

### BorrowOverlay — Local-Only Preview (No Premature Optimistic Update)

The real-time balance preview in the overlay is **purely local state** — it does NOT call `borrowFromEnvelope` until Tom confirms. The store's optimistic update only happens after Tom confirms (inside `borrowFromEnvelope`). This means:

- Preview: `selectedSource.allocatedCents - parsedCents` (computed from props + local input state)
- Cancel is always safe — no rollback needed because nothing was written
- This avoids the "rollback on cancel" complexity

### All Envelope SELECT Queries Must Be Updated

Migration 005 adds `is_savings` to the `envelopes` table. Every Rust function that SELECT from `envelopes` must include `is_savings` in the query and map it in the `Envelope` struct. There are **4 affected functions** in `commands/mod.rs`:

1. `get_envelopes_inner`
2. `create_envelope_inner` (re-SELECT after INSERT)
3. `update_envelope_inner` (re-SELECT after UPDATE)
4. `allocate_envelopes_inner` (re-SELECT after bulk UPDATE)

**Recommended column order for all selects:**
```sql
SELECT id, name, type, priority, allocated_cents, month_id, created_at, is_savings
```
Map: indices 0–6 as before; `is_savings` at index 7 as `row.get::<_, i64>(7)? != 0`.

[Source: src-tauri/src/commands/mod.rs — all existing SELECT patterns must be extended]

### `borrow_from_envelope` IPC Field Names

The Tauri command receives `BorrowInput` with `#[serde(rename_all = "camelCase")]`. On the TypeScript side, invoke as:

```typescript
invoke<BorrowResult>('borrow_from_envelope', {
  input: {
    sourceEnvelopeId: sourceId,
    targetEnvelopeId: targetId,
    amountCents: amountCents,
  },
})
```

The Rust struct fields `source_envelope_id`, `target_envelope_id`, `amount_cents` map to camelCase automatically.

[Source: src-tauri/src/commands/mod.rs — serde camelCase pattern used throughout]

### Priority Sort Order in BorrowOverlay

Funded source envelopes (non-savings) are sorted by priority descending disposability: Want (borrow from first) → Should → Need. Savings is always last regardless of its priority field. Implementation:

```typescript
const PRIORITY_ORDER: Record<EnvelopePriority, number> = { Want: 0, Should: 1, Need: 2 };
const sortedSources = sources
  .filter(e => !e.isSavings)
  .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
const savingsSource = sources.find(e => e.isSavings);
```

[Source: _bmad-output/planning-artifacts/epics.md#Story 2.5 — "Want envelopes first, then Should, then Need; savings envelope appears last"]

### `borrowError` Placement in Store

Per the architecture spec, `EnvelopeStore` exposes `borrowError: string | null` (the spec uses string; use `AppError | null` for consistency with `error`). Clear `borrowError` to `null` at the start of each `borrowFromEnvelope` call (alongside setting `isWriting: true`).

[Source: _bmad-output/planning-artifacts/architecture.md — "Store exposes error per domain area: borrowError, allocationError"]

### Savings Confirmation UX

Per UX-DR16: "action-stating title ('Borrow $80 from Savings'), consequence body (new balance, new runway), supportive copy tone ('This is exactly what it's for'), Primary confirm (lime) + Ghost cancel with cancel on left."

Button order in DialogFooter: `<Button variant="ghost">Cancel</Button>` THEN `<Button>Confirm</Button>` — cancel must be on the left per spec. Use `justify-between` or `flex-row` layout in the footer to enforce this order.

[Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR16]

### `AddEnvelopeForm` Location

The file is `src/features/envelopes/AddEnvelopeForm.tsx`. Verify this path before modifying. The form submits via `useEnvelopeStore().createEnvelope(input)`. The `isSavings` field maps to `CreateEnvelopeInput.isSavings` and flows to `create_envelope_inner` which inserts `is_savings = 1` when true.

### Previous Story Patterns to Reuse

- **Transaction pattern**: `unchecked_transaction()` + `tx.commit()` — match exactly the pattern in `allocate_envelopes_inner` (`src-tauri/src/commands/mod.rs:604`)
- **Optimistic update + rollback**: `prev = get().envelopes` → optimistic → invoke → on success replace with DB response using `Map` — match `allocateEnvelopes` in `useEnvelopeStore.ts:121-148`
- **Error code style**: SCREAMING_SNAKE_CASE strings (e.g., `INSUFFICIENT_BALANCE`, `INVALID_BORROW_SAME_ENVELOPE`) matching existing codes in `mod.rs`
- **Test mocking**: `vi.mock('@tauri-apps/api/core', ...)` with `vi.hoisted()` for all mock functions — see `AllocationPage.test.tsx` for the correct hoisting pattern that avoids Vitest hoisting errors
- **Dialog import**: `import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'` — already available

### File List for This Story

New files:
- `src-tauri/migrations/005_borrow_schema.sql`
- `src/features/envelopes/BorrowOverlay.tsx`
- `src/features/envelopes/BorrowOverlay.test.tsx`

Modified files:
- `src-tauri/src/migrations.rs` — register migration 5, bump test assertions
- `src-tauri/src/commands/mod.rs` — Envelope struct, all 4 SELECT queries, CreateEnvelopeInput, UpdateEnvelopeInput, borrow command + types + tests
- `src-tauri/src/lib.rs` — register `borrow_from_envelope`
- `src/lib/types.ts` — Envelope.isSavings, CreateEnvelopeInput.isSavings, UpdateEnvelopeInput.isSavings, BorrowInput, BorrowResult
- `src/stores/useEnvelopeStore.ts` — borrowError, borrowFromEnvelope action
- `src/features/envelopes/EnvelopeCard.tsx` — Borrow button, BorrowOverlay render
- `src/features/envelopes/AddEnvelopeForm.tsx` — is_savings checkbox

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5] — Epic ACs verbatim
- [Source: _bmad-output/planning-artifacts/architecture.md#BorrowOverlay] — Component name, file location, store field names
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR16] — Dialog button order, supportive copy tone
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Borrow-from-Savings] — Savings flow diagram
- [Source: src-tauri/src/commands/mod.rs] — Reference implementation for all Rust patterns
- [Source: src/stores/useEnvelopeStore.ts] — Reference implementation for store pattern (esp. `allocateEnvelopes`)
- [Source: src/features/envelopes/AllocationPage.test.tsx] — Vitest `vi.hoisted()` mock pattern to avoid hoisting errors
- [Source: _bmad-output/implementation-artifacts/2-4-envelope-allocation-monthly-planning-session.md] — Previous story patterns, deferred items

## Review Findings

- [x] [Review][Patch] TOCTOU race — balance check SELECT runs on `conn` before transaction opens; concurrent write can let debit proceed with insufficient funds [`src-tauri/src/commands/mod.rs:721-742`]
- [x] [Review][Patch] Source envelope UPDATE never verified — `tx.changes()` checked only after target UPDATE, not source; a phantom source ID would debit nothing but credit the target [`src-tauri/src/commands/mod.rs:744-759`]
- [x] [Review][Patch] Stale `borrowError` flashes on overlay reopen — store's `borrowError` persists after dialog close; reopening shows prior error before any action [`src/features/envelopes/BorrowOverlay.tsx`]
- [x] [Review][Patch] Savings confirmation shows double-decremented balance — optimistic update fires on confirm, dropping `selectedSource.allocatedCents` in store; UI then subtracts `parsedCents` again showing `original - 2×amount` [`src/features/envelopes/BorrowOverlay.tsx:119-121`]
- [x] [Review][Patch] No validation message for zero or negative amount — `amountValid` blocks submission but shows no feedback when user enters 0 or negative value [`src/features/envelopes/BorrowOverlay.tsx`]
- [x] [Review][Patch] Source-selection footer uses `justify-end` instead of `justify-between` — inconsistent with savings confirmation footer; UX-DR16 implies `justify-between` layout [`src/features/envelopes/BorrowOverlay.tsx`]
- [x] [Review][Defer] `unchecked_transaction()` bypasses Rusqlite borrow-checker safety [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing (see 2-1 review)
- [x] [Review][Defer] `borrow_events` has no FK constraints on `source_envelope_id`/`target_envelope_id` [`src-tauri/migrations/005_borrow_schema.sql`] — deferred, pre-existing pattern
- [x] [Review][Defer] Multiple savings envelopes not enforced by DB UNIQUE constraint [`src-tauri/migrations/005_borrow_schema.sql`] — deferred, explicitly deferred in dev notes
- [x] [Review][Defer] Borrow button `state === 'overspent'` condition is dead code — `spentCents` hardcoded 0; unreachable until Epic 3 wires transactions [`src/features/envelopes/EnvelopeCard.tsx:205`] — deferred, intentional forward-compat
- [x] [Review][Defer] No index on `borrow_events(source_envelope_id)` / `(target_envelope_id)` [`src-tauri/migrations/005_borrow_schema.sql`] — deferred, pre-existing

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded cleanly. One dead-code warning for an unused `select_envelope_by_id` helper removed before final commit.

### Completion Notes List

- Implemented all 9 tasks per story spec in a single session (2026-04-07).
- Migration 005 adds `is_savings` to `envelopes` and creates `borrow_events` table. All 4 Rust SELECT queries updated to include `is_savings` at index 7.
- `borrow_from_envelope_inner` uses `unchecked_transaction()` matching the pattern from `allocate_envelopes_inner`. Validates amount > 0, same-envelope rejection, and insufficient balance before opening the transaction.
- `BorrowOverlay` uses a single Radix Dialog with `step` local state (`'select' | 'confirm-savings'`) as specified in Dev Notes — no nested Dialog.
- Real-time preview is local-only; store's optimistic update only fires on final confirm (per Dev Notes: "BorrowOverlay — Local-Only Preview").
- Runway estimate omitted from savings confirmation per Dev Notes; deferred item logged to `deferred-work.md`.
- No single-savings-envelope DB constraint added (deferred per Dev Notes); logged to `deferred-work.md`.
- 29/29 Rust tests + 143/143 TypeScript tests pass with no regressions.

### File List

New files:
- `src-tauri/migrations/005_borrow_schema.sql`
- `src/features/envelopes/BorrowOverlay.tsx`
- `src/features/envelopes/BorrowOverlay.test.tsx`

Modified files:
- `src-tauri/src/migrations.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/lib.rs`
- `src/lib/types.ts`
- `src/stores/useEnvelopeStore.ts`
- `src/stores/useEnvelopeStore.test.ts`
- `src/features/envelopes/EnvelopeCard.tsx`
- `src/features/envelopes/AddEnvelopeForm.tsx`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-07: Story 2.5 implemented — borrow flow, savings confirmation, is_savings schema (claude-sonnet-4-6)
