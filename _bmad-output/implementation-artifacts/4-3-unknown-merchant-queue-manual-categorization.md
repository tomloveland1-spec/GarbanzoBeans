# Story 4.3: Unknown Merchant Queue — Manual Categorization

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want to see a queue of uncategorized transactions after an import and assign a category to each one,
so that every transaction is categorized before I close the import session.

## Acceptance Criteria

1. **Given** an import contains uncategorized transactions (no rule matched) or conflicted transactions (multiple rules matched)
   **When** the import completes
   **Then** the unknown merchant queue is displayed inside `LedgerView`, showing a header with the count ("4 transactions need a category"); each queue item shows: payee name, date, amount, and a category Select dropdown; conflicted items show an additional inline conflict warning.

2. **Given** Tom selects a category from the dropdown for a queue item
   **When** the selection is made
   **Then** `updateTransaction` is called with the chosen `envelopeId`; the transaction is removed from the queue immediately; the affected envelope's balance and state update in real time; the matched-rule annotation for that item (if any) is not added — the user-chosen category stands.

3. **Given** the last item in the queue is categorized
   **When** it resolves
   **Then** the queue empties naturally with no completion modal; the import session continues normally; the ledger summary line remains visible.

4. **Given** the category Select is open for a queue item
   **When** Tom navigates it
   **Then** most recently used categories float to the top of the list; the Select is keyboard-navigable (arrow keys, Enter to select, Escape to dismiss); navigation follows the existing shadcn/ui Select behavior already in the app.

5. **Given** `importResult.uncategorizedIds` and `importResult.conflictedIds` are both empty
   **When** `LedgerView` renders
   **Then** the unknown merchant queue section is not shown at all.

## Tasks / Subtasks

- [x] Task 1: Extend `useTransactionStore.updateTransaction` to remove IDs from the queue arrays when a category is assigned (AC: 2, 3, 5)
  - [x] In `updateTransaction`, when `input.envelopeId` is provided (not `clearEnvelopeId`), remove `input.id` from `importResult.uncategorizedIds` and `importResult.conflictedIds` if present — do this inside the same `set()` call that clears `categorizedAnnotations`.
  - [x] Do NOT remove the ID when `clearEnvelopeId: true` is used — un-categorizing should add the item back to the queue state is not needed; simply leave queue state untouched when clearing a category.
  - [x] Ensure existing `categorizedAnnotations` cleanup logic from Story 4.2 is preserved (it already strips the annotation when `envelopeId` changes).

- [x] Task 2: Create `UnknownMerchantQueue.tsx` component in `src/features/transactions/` (AC: 1, 2, 3, 4)
  - [x] Accept props: `queueIds: number[]`, `transactions: Transaction[]`, `envelopes: Envelope[]`.
  - [x] Derive `queueItems` by filtering `transactions` to only IDs present in `queueIds`; preserve order of `queueIds`.
  - [x] Render a queue header: "N transactions need a category" where N is `queueIds.length`.
  - [x] For each queue item, render: payee name, formatted date (same `formatTxDate` pattern as `TransactionRow`), formatted amount (`formatCurrency`), and a category Select sourced from `envelopes`.
  - [x] Track MRU envelope IDs in local `useState<number[]>` (max 3 entries); update on each successful assignment; move a used envelope to the front of the list; deduplicate.
  - [x] Sort `envelopes` for each Select: MRU envelopes appear first (in MRU order), remaining envelopes follow in their original order.
  - [x] On Select value change: call `useTransactionStore.getState().updateTransaction({ id, envelopeId: Number(val) })` then `useEnvelopeStore.getState().loadEnvelopes()` (matches the existing `TransactionRow` category commit pattern exactly).
  - [x] For IDs in `conflictedIds` (passed as a separate prop or derived by the parent): render an inline conflict note below the payee: "Multiple rules matched — choose manually". Style with `var(--color-text-secondary)` and `type-caption` class.
  - [x] Do NOT implement the "Save as rule" toggle or Substring Rule Builder — those are Story 4.4.
  - [x] Do NOT use a modal at any point — the queue is rendered inline in the ledger area.

- [x] Task 3: Integrate `UnknownMerchantQueue` into `LedgerView.tsx` (AC: 1, 5)
  - [x] Subscribe to `importResult` from `useTransactionStore`.
  - [x] Derive `queueIds = [...(importResult?.uncategorizedIds ?? []), ...(importResult?.conflictedIds ?? [])]` — render deduplicated, preserving order (uncategorized first, then conflicted).
  - [x] Render `<UnknownMerchantQueue>` between the sticky header and the `AddTransactionForm` / transaction table, only when `queueIds.length > 0`.
  - [x] Pass `conflictedIds={importResult?.conflictedIds ?? []}` as a prop so the component can show the conflict message on the right items.
  - [x] Do not remove or alter the existing sticky header, `AddTransactionForm` slot, or the transaction table.

- [x] Task 4: Add Vitest tests for the store extension and queue component (AC: 1–5)
  - [x] In `src/stores/useTransactionStore.test.ts`: add tests for `updateTransaction` queue-removal — assigning an `envelopeId` removes the transaction ID from `uncategorizedIds` and `conflictedIds`; using `clearEnvelopeId: true` does NOT alter queue arrays.
  - [x] Create `src/features/transactions/UnknownMerchantQueue.test.tsx`: test that the header count renders correctly; that selecting a category calls `updateTransaction` with the correct ID and `envelopeId`; that conflicted items render the conflict note; that the queue section is absent when `queueIds` is empty.
  - [x] Extend `src/features/transactions/LedgerView.test.tsx`: test that the `UnknownMerchantQueue` renders when `importResult.uncategorizedIds` is non-empty, and does not render when both arrays are empty.
  - [x] Run full test suite and confirm no regressions; pre-existing `BorrowOverlay.test.tsx` failures are known and unrelated.

## Dev Notes

### Story Intent

Story 4.3 is a UI-only story: no new Rust commands, no new SQLite columns, no new Tauri IPC calls. All the backend plumbing (`uncategorizedIds`, `conflictedIds`) was established by Story 4.2. This story surfaces that data as an actionable queue and wires it to the existing `update_transaction` command.

### Data Already Available

Story 4.2 added to `ImportResult` (in both Rust and `src/lib/types.ts`):
- `uncategorizedIds: number[]` — IDs of new transactions matching no rule
- `conflictedIds: number[]` — IDs of new transactions matching more than one rule
- `categorizedAnnotations: Record<string, string>` — already handled by Story 4.2

These are display-only fields on `ImportResult`, stored in store state, not in SQLite. They persist in `useTransactionStore.importResult` until `clearImportResult()` is called.

### Store Extension — Queue Removal Pattern

The current `updateTransaction` already handles `categorizedAnnotations` cleanup (Story 4.2 review fix):

```typescript
// Existing pattern in updateTransaction (store):
if (importResult && (input.envelopeId !== undefined || input.clearEnvelopeId)) {
  const { [String(input.id)]: _removed, ...remaining } = importResult.categorizedAnnotations;
  importResult = { ...importResult, categorizedAnnotations: remaining };
}
```

Extend this same block to also remove `input.id` from `uncategorizedIds` and `conflictedIds` **only when** `input.envelopeId !== undefined` (i.e., assigning a category, not clearing one):

```typescript
if (importResult && input.envelopeId !== undefined) {
  importResult = {
    ...importResult,
    uncategorizedIds: importResult.uncategorizedIds.filter(id => id !== input.id),
    conflictedIds: importResult.conflictedIds.filter(id => id !== input.id),
  };
}
```

Keep both mutations in the same `set()` call in the `try` block (after `invoke` resolves), not the optimistic update — queue removal should only happen on confirmed success.

### Component Architecture

Create `src/features/transactions/UnknownMerchantQueue.tsx` as a pure presentational component with one side-effect: calling `updateTransaction` on category assignment.

**Do NOT create** `src/features/merchant-rules/` for this story — the queue lives entirely within `src/features/transactions/`.

**Shadcn/ui Select** is already available at `src/components/ui/select.tsx` with the same import pattern used in `TransactionRow.tsx`:
```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```
Keyboard navigation (arrow keys, Enter, Escape) is built into the shadcn/ui Select — no additional wiring needed beyond what `TransactionRow` already demonstrates.

**MRU Implementation**: Local `useState<number[]>` tracking up to 3 recently used envelope IDs per import session. On each successful assignment, prepend the used ID and deduplicate. Reset when the component unmounts (i.e., natural reset when the queue empties and the component is gone).

```typescript
// Example MRU sort function:
function sortWithMRU(envelopes: Envelope[], mruIds: number[]): Envelope[] {
  const mruSet = new Set(mruIds);
  const mru = mruIds.map(id => envelopes.find(e => e.id === id)).filter(Boolean) as Envelope[];
  const rest = envelopes.filter(e => !mruSet.has(e.id));
  return [...mru, ...rest];
}
```

### LedgerView Integration

The queue renders between the sticky header and the existing `AddTransactionForm` / transaction table. Render order in `LedgerView`:
1. Sticky header (balance + import summary line) — unchanged
2. `UnknownMerchantQueue` — new, conditional on `queueIds.length > 0`
3. `AddTransactionForm` — unchanged (only when `showAddForm`)
4. Scrollable transaction table — unchanged

Source the queue IDs from `importResult`:
```typescript
const importResult = useTransactionStore(s => s.importResult);
const queueIds = [
  ...(importResult?.uncategorizedIds ?? []),
  ...(importResult?.conflictedIds ?? []),
];
```

### Category Select — Commit Pattern

Follow the exact pattern from `TransactionRow.commitEdit('category')`:
```typescript
await useTransactionStore.getState().updateTransaction({ id: transaction.id, envelopeId: Number(val) });
await useEnvelopeStore.getState().loadEnvelopes();
```

Do not call `clearImportResult()` after categorization — the importResult persists until the user clicks "Import another". The queue simply empties as IDs are removed.

### UX Rules — Non-Negotiable

- **No completion modal** when the last queue item is resolved.
- **No toast notifications** for successful categorization.
- **Inline only** — the queue section collapses naturally when `queueIds.length === 0`.
- **Conflict items** get a `type-caption` note below the payee; they are NOT blocked from manual category assignment.
- **Keyboard nav** for Select is provided by shadcn/ui out of the box; no custom key handler needed beyond what `TransactionRow` already does.

### Formatting Utilities

Use existing utilities — do not add new ones:
- `formatCurrency` from `@/lib/currency`
- `formatTxDate` pattern: `new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })` — can be extracted to a shared helper or copied from `TransactionRow.tsx`

### Testing Requirements

- **Vitest + React Testing Library** only — no Playwright or WebdriverIO in this story.
- Mock `invoke` the same way existing store tests do.
- For component tests, use `render` + `screen` + `userEvent` or `fireEvent`.
- `UnknownMerchantQueue.test.tsx` should test the component in isolation, passing props directly — do not set up the full store.
- The `LedgerView.test.tsx` extension should mock the store and verify the queue section renders/hides correctly.
- Pre-existing `BorrowOverlay.test.tsx` failures (13 tests) are confirmed pre-existing and unrelated — do not fix them in this story.

### Library / Framework Requirements

Remain on pinned versions from `package.json`:
- React 19
- Zustand 5
- Tauri API v2
- Vitest 3
- shadcn/ui Select (already installed)

No new npm packages.
No new Rust crates.
No new Tauri commands.
No new SQL migrations.

### File Structure Requirements

Expected new files:
- `src/features/transactions/UnknownMerchantQueue.tsx`
- `src/features/transactions/UnknownMerchantQueue.test.tsx`

Expected modified files:
- `src/stores/useTransactionStore.ts` (extend `updateTransaction`)
- `src/stores/useTransactionStore.test.ts` (add queue-removal tests)
- `src/features/transactions/LedgerView.tsx` (integrate queue component)
- `src/features/transactions/LedgerView.test.tsx` (extend tests)

Do NOT create:
- `src/features/merchant-rules/` — out of scope for this story
- Any Rust file changes
- Any new migration files

### Out of Scope

- Story 4.4: "Save as rule" toggle and Substring Rule Builder
- Story 4.5: Forward-only rule application policy UI
- Story 4.6: Merchant rules management screen
- Re-categorizing transactions from previous import batches
- Envelope balance recalculation beyond what `loadEnvelopes()` already provides
- Any persistence of the MRU list across sessions

### Previous Story Intelligence (4.2)

- `ImportResult` already has `categorizedAnnotations`, `uncategorizedIds`, `conflictedIds` — use them, do not redesign.
- `updateTransaction` already has an `importResult` mutation pattern for `categorizedAnnotations` — extend it (do not replace it).
- `TransactionRow` already uses `Select`, `formatCurrency`, the category commit pattern — copy these patterns verbatim.
- `LedgerView` already builds `envelopeMap` and subscribes to `importResult` — extend it, do not refactor the existing subscriptions.
- Architecture doc mentions `src/features/merchant-rules/` — the actual repo has NOT created this folder yet. All transaction-adjacent UI stays in `src/features/transactions/`.

### Git / Repo Intelligence

- Rust commands remain in `src-tauri/src/commands/mod.rs` (single file, not split by domain).
- Zustand stores use optimistic update → rollback on failure pattern.
- shadcn/ui Select is the canonical category picker pattern; do not introduce a native `<select>` element.
- Recent commits are sparse in git log (only through Story 2.2 visible); the live codebase is more recent than git history reflects. Read source files directly, not git history.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3: Unknown Merchant Queue]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4: Merchant Rules & Smart Categorization]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Weekly Import Session]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Unknown Queue Item]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Feedback Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Flow]
- [Source: _bmad-output/implementation-artifacts/4-2-auto-categorization-on-import.md#Dev Notes]
- [Source: src/lib/types.ts#ImportResult]
- [Source: src/stores/useTransactionStore.ts#updateTransaction]
- [Source: src/features/transactions/LedgerView.tsx]
- [Source: src/features/transactions/TransactionRow.tsx]
- [Source: src/components/ui/select.tsx]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_No blockers encountered._

### Completion Notes List

Story created 2026-04-08. Comprehensive context engine analysis completed — all data structures from Story 4.2 are ready; no Rust changes required; the queue is a pure frontend addition wired to the existing `update_transaction` command and `importResult` store state.

Implemented 2026-04-08:

- **Task 1 (Store):** Extended `updateTransaction` success handler in `useTransactionStore.ts` to filter `uncategorizedIds` and `conflictedIds` when `input.envelopeId !== undefined`. The `clearEnvelopeId` path deliberately leaves queue arrays untouched. Both mutations live in the same `set()` call as the existing `categorizedAnnotations` cleanup.

- **Task 2 (Component):** Created `UnknownMerchantQueue.tsx` as a pure presentational component with one side-effect (calling `updateTransaction` on selection). Uses shadcn/ui `Select`, `formatTxDate` / `formatCurrency` utilities, MRU tracking via local `useState<number[]>` (max 3, deduped), and `sortWithMRU` helper. Conflict items get a `type-caption` note. No modal, no toast.

- **Task 3 (Integration):** Integrated into `LedgerView.tsx` between sticky header and `AddTransactionForm`. Queue is derived as `[...uncategorizedIds, ...conflictedIds]` from `importResult`; renders only when `queueIds.length > 0`.

- **Task 4 (Tests):** 4 new store tests (queue removal), 9 new component tests (header count, category assignment, conflict note, filtering), 4 new LedgerView integration tests (queue present/absent). All 237 tests pass; 13 pre-existing BorrowOverlay failures unchanged.

### File List

- `src/stores/useTransactionStore.ts` (modified — Task 1: queue removal in updateTransaction)
- `src/stores/useTransactionStore.test.ts` (modified — Task 4a: queue removal tests)
- `src/features/transactions/UnknownMerchantQueue.tsx` (new — Task 2)
- `src/features/transactions/UnknownMerchantQueue.test.tsx` (new — Task 4b)
- `src/features/transactions/LedgerView.tsx` (modified — Task 3: integrate queue)
- `src/features/transactions/LedgerView.test.tsx` (modified — Task 4c: LedgerView queue tests)

### Review Findings

- [x] [Review][Patch] queueIds not deduplicated — IDs in both uncategorizedIds and conflictedIds render duplicate rows [src/features/transactions/LedgerView.tsx:92]
- [x] [Review][Patch] handleAssign updates MRU on failure — setMruIds runs even when updateTransaction rejects [src/features/transactions/UnknownMerchantQueue.tsx:51]
- [x] [Review][Patch] Select not disabled during in-flight assignment — user can fire concurrent updateTransaction calls for same transaction [src/features/transactions/UnknownMerchantQueue.tsx:102]
- [x] [Review][Patch] Queue header count uses queueIds.length not queueItems.length — shows wrong count when transactions are missing from txMap [src/features/transactions/UnknownMerchantQueue.tsx:71]
- [x] [Review][Defer] formatTxDate appends T00:00:00 without validating date format — pre-existing pattern from TransactionRow; matches spec guidance [src/features/transactions/UnknownMerchantQueue.tsx:14]
- [x] [Review][Defer] importOFX: result.transactions not deduplicated against result.matchedTransactions — pre-existing API contract concern, outside story 4-3 scope [src/stores/useTransactionStore.ts:importOFX]
- [x] [Review][Defer] sortWithMRU recomputed every render without useMemo — premature optimization; envelope lists are small in current usage [src/features/transactions/UnknownMerchantQueue.tsx:22]
- [x] [Review][Defer] _tempIdCounter is a module-level singleton — pre-existing pattern; tests reset store state; no realistic collision risk in current usage [src/stores/useTransactionStore.ts:31]
