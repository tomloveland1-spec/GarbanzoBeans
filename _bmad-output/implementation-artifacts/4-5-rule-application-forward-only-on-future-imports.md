# Story 4.5: Rule Application — Forward-Only on Future Imports

Status: done

## Story

As Tom,
I want new merchant rules to apply automatically to all future imports without requiring any action from me,
so that the app gets smarter without me having to manage it.

## Acceptance Criteria

1. **Given** a merchant rule exists for "KROGER" → Groceries
   **When** the next OFX import runs and includes a transaction with "KROGER #0423" as the payee
   **Then** the transaction is auto-categorized to Groceries; the rule's `match_count` increments; `last_matched_at` updates (FR9)

2. **Given** a merchant rule is created or edited
   **When** the change is committed
   **Then** the rule applies only from that point forward; past transactions that previously matched are not retroactively recategorized; historical records are immutable

3. **Given** two rules both match the same payee on an import
   **When** the conflict is detected
   **Then** an inline conflict warning is shown on the affected transaction in the queue; the transaction is not silently resolved; Tom must manually select the correct category

## Tasks / Subtasks

- [x] Task 1: Refresh merchant rules store after a successful OFX import (AC: 1)
  - [x] In `src/stores/useTransactionStore.ts`, inside the `importOFX` try block, after the `set(...)` call that applies the import result, add: `await useMerchantRuleStore.getState().loadRules()`
  - [x] Add the necessary import at the top: `import { useMerchantRuleStore } from '@/stores/useMerchantRuleStore'`
  - [x] Verify that the `loadRules` call is inside the try block and will not suppress import errors (the `set(...)` for the result must still happen before `loadRules`)
  - [x] Do NOT call `loadRules` on import error paths — rule counts are only updated on successful import

- [x] Task 2: Write Vitest tests for store refresh after import (AC: 1)
  - [x] In `src/stores/useTransactionStore.test.ts`, add a describe block `'importOFX — merchant rule refresh'`
  - [x] Mock `useMerchantRuleStore` at the top of the file: `vi.mock('@/stores/useMerchantRuleStore', () => ({ useMerchantRuleStore: { getState: () => ({ loadRules: mockLoadRules }) } }))`; declare `const mockLoadRules = vi.fn().mockResolvedValue(undefined)` at module scope; add `mockLoadRules.mockClear()` in `beforeEach`
  - [x] Test: `importOFX calls loadRules after a successful import` — mock `invoke` to return a valid `ImportResult`; call `importOFX`; assert `mockLoadRules` was called once
  - [x] Test: `importOFX does NOT call loadRules when import fails` — mock `invoke` to reject; call `importOFX`; assert `mockLoadRules` was NOT called

- [x] Task 3: Write Vitest forward-only guarantee tests (AC: 2)
  - [x] In `src/stores/useMerchantRuleStore.test.ts`, add a describe block `'forward-only guarantee'`
  - [x] Test: `createRule does not modify existing transactions in useTransactionStore` — set `useTransactionStore` state with two pre-existing transactions; mock `invoke` for `create_merchant_rule` to return a new rule; call `createRule`; assert `useTransactionStore.getState().transactions` is unchanged (same array contents, no `envelopeId` changes)
  - [x] Test: `updateRule does not modify existing transactions in useTransactionStore` — same setup; mock `invoke` for `update_merchant_rule` to return the updated rule; call `updateRule`; assert `useTransactionStore.getState().transactions` is unchanged
  - [x] Note: Import `useTransactionStore` in the test file only for state inspection; do NOT mock it — use the real store to confirm isolation

- [x] Task 4: Verify conflict warning tests are complete (AC: 3)
  - [x] Confirm the following tests exist and pass in `src/features/transactions/UnknownMerchantQueue.test.tsx`:
    - `renders conflict note for conflicted items` → `data-testid="conflict-note-{id}"` shows "Multiple rules matched — choose manually"
    - `does NOT render conflict note for non-conflicted items`
  - [x] Confirm the following tests exist and pass in `src/features/transactions/LedgerView.test.tsx`:
    - `renders queue section when importResult.conflictedIds is non-empty`
    - `deduplicates queueIds when a transaction ID appears in both uncategorizedIds and conflictedIds`
  - [x] If any of these tests are missing or failing, add/fix them; do NOT duplicate tests that already exist and pass

## Dev Notes

### Story Intent

Story 4.5 completes the rule-application loop by ensuring:
1. The frontend merchant rules store is refreshed after each successful import (so `match_count` and `last_matched_at` are current for the upcoming Story 4.6 rules screen)
2. Forward-only behavior is explicitly tested as a regression guard
3. The conflict UI (inline warning) is confirmed complete with tests

**Important:** Most of the behavioral implementation was done in Stories 4.1–4.4:
- Auto-categorization in `import_ofx` (Rust) — Story 4.2 ✅
- `match_count` / `last_matched_at` updates in DB — Story 4.2 ✅
- `conflictedIds` in `ImportResult` — Stories 4.1/4.2 ✅
- Inline conflict note in `UnknownMerchantQueue` — Story 4.3 ✅
- Forward-only architecture (DB-level: only new inserts are categorized) — by design ✅

The **only new production code** is the `loadRules()` call in `importOFX`. The rest of this story is tests.

### Code Change — useTransactionStore.ts

Current `importOFX` success path (inside try block):
```typescript
const result = await invoke<ImportResult>('import_ofx', { path });
set(state => {
  const existingIds = new Set(state.transactions.map(t => t.id));
  // ... merge logic ...
  return { transactions: [...], importResult: result, isWriting: false };
});
// ← ADD AFTER SET:
await useMerchantRuleStore.getState().loadRules();
```

**Why after `set`?** The `set` call is synchronous and applies the importResult immediately; `loadRules` then fetches updated match_count from DB. The UI stays responsive during `loadRules` (rules screen not yet shown).

**Why not in `finally`?** `loadRules` should only fire on success — failed imports don't update match_count in the DB.

Import to add at top of `useTransactionStore.ts`:
```typescript
import { useMerchantRuleStore } from '@/stores/useMerchantRuleStore';
```

### Forward-Only Behavior — How It Works

`import_ofx` (Rust) applies rules only when inserting new transaction rows:
```sql
INSERT OR IGNORE INTO transactions (payee, ..., envelope_id)
-- envelope_id set from rule match only if payee_substring LIKE '%{rule.payee_substring}%' (case-insensitive)
```
Past transaction rows are never touched by `import_ofx`. The `update_merchant_rule` and `create_merchant_rule` commands only modify the `merchant_rules` table — they never touch `transactions`. This is the forward-only guarantee. The Vitest tests in Task 3 document and lock this invariant at the store level.

### Existing Tests — Do NOT Duplicate

These already exist and pass; do not re-implement them:
- `LedgerView.test.tsx`: "renders matched-rule label for auto-categorized transactions" (AC1 rendering)
- `LedgerView.test.tsx`: "renders queue section when importResult.conflictedIds is non-empty" (AC3 queue)
- `LedgerView.test.tsx`: "deduplicates queueIds when a transaction ID appears in both uncategorizedIds and conflictedIds"
- `UnknownMerchantQueue.test.tsx`: "renders conflict note for conflicted items" (AC3 inline note)
- `UnknownMerchantQueue.test.tsx`: "does NOT render conflict note for non-conflicted items"
- `useTransactionStore.test.ts`: "importResult preserves categorizedAnnotations and uncategorizedIds from backend"
- `useTransactionStore.test.ts`: "removes transaction ID from conflictedIds when envelopeId is assigned"
- Rust tests in `mod.rs`: all `test_merchant_rule_*` tests covering DB-level behavior

### Mock Pattern for useMerchantRuleStore in useTransactionStore.test.ts

Use module-level mock consistent with how `useEnvelopeStore` is mocked in `LedgerView.test.tsx`:
```typescript
const mockLoadRules = vi.fn().mockResolvedValue(undefined);

vi.mock('@/stores/useMerchantRuleStore', () => ({
  useMerchantRuleStore: {
    getState: () => ({ loadRules: mockLoadRules }),
  },
}));
```
Call `mockLoadRules.mockClear()` in `beforeEach` alongside existing `vi.clearAllMocks()`.

**Note:** The mock must return the real store shape that `getState()` produces; only `loadRules` needs to be mocked since that's all `importOFX` calls.

### Forward-Only Test — useTransactionStore Import in useMerchantRuleStore.test.ts

Use the real `useTransactionStore` (not mocked) for the forward-only tests:
```typescript
import { useTransactionStore } from './useTransactionStore';
// In beforeEach:
useTransactionStore.setState({ transactions: [existingTx1, existingTx2], isWriting: false, error: null, importResult: null, importError: null });
// After createRule:
expect(useTransactionStore.getState().transactions).toEqual([existingTx1, existingTx2]); // unchanged
```
The two stores are independent Zustand slices — `useMerchantRuleStore` has no reference to `useTransactionStore`, so isolation is guaranteed by design.

### Pre-Existing Test Failures

The 13 `BorrowOverlay.test.tsx` failures are pre-existing and unrelated. Run the full suite and confirm no NEW failures beyond those 13.

### Library / Framework Requirements

Remain on pinned versions:
- React 19, Zustand 5, Tauri API v2, Vitest 3
- **No new npm packages**, no new Rust crates, no new Tauri commands, no new SQL migrations

### File Structure Requirements

**Modified files only (no new files):**
- `src/stores/useTransactionStore.ts` — add `loadRules()` call + import
- `src/stores/useTransactionStore.test.ts` — extend with merchant rule refresh tests
- `src/stores/useMerchantRuleStore.test.ts` — extend with forward-only guarantee tests

**Do NOT create or modify:**
- Any Rust files (`.rs`)
- `src/lib/types.ts`
- Any migration files
- `src/features/` directory (UI is complete; no component changes needed)
- `src/stores/useMerchantRuleStore.ts` (store logic is correct; only tests added)

**Do NOT create:**
- `RuleConflictBanner.tsx` — that is Story 4.6
- `MerchantRulesScreen.tsx` — that is Story 4.6
- Any `/merchant-rules` route — that is Story 4.6

### Out of Scope

- Story 4.6: Merchant Rules Screen (`/merchant-rules` route, `MerchantRulesScreen`, `RuleEditor`, `RuleConflictBanner`)
- Retroactive rule application (explicitly forbidden by architecture)
- Rule versioning on transaction rows (`matched_rule_version` column — architecture marks as future)
- Conflict resolution UI beyond the existing inline note in `UnknownMerchantQueue`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5: Rule Application]
- [Source: _bmad-output/planning-artifacts/architecture.md#Merchant rule engine]
- [Source: _bmad-output/implementation-artifacts/4-4-substring-rule-builder-creating-rules-inline.md#Dev Notes]
- [Source: src/stores/useTransactionStore.ts#importOFX]
- [Source: src/stores/useMerchantRuleStore.ts]
- [Source: src/stores/useTransactionStore.test.ts]
- [Source: src/stores/useMerchantRuleStore.test.ts]
- [Source: src/features/transactions/UnknownMerchantQueue.tsx#conflictedSet]
- [Source: src-tauri/src/commands/mod.rs#import_ofx_inner]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Story created 2026-04-08. This is a thin story — the core behavioral implementation was completed in Stories 4.2–4.4. The only new production code is one `loadRules()` call in `useTransactionStore.importOFX` (so the merchant rules store reflects updated match_count after import). The rest of the story is tests: store refresh verification, forward-only guard tests, and conflict UI confirmation.

Implementation completed 2026-04-08. Added `useMerchantRuleStore.getState().loadRules()` at the end of the `importOFX` success path in `useTransactionStore.ts`. Added 2 merchant-rule-refresh tests in `useTransactionStore.test.ts` (AC1). Added 4 forward-only guarantee tests in `useMerchantRuleStore.test.ts` (AC2) confirming `createRule` and `updateRule` never touch existing transactions. All pre-existing AC3 conflict UI tests confirmed present and passing. Full suite: 261 pass, 13 pre-existing BorrowOverlay failures (unchanged).

### File List

- `src/stores/useTransactionStore.ts` (modified — added `loadRules()` call after importOFX success + import)
- `src/stores/useTransactionStore.test.ts` (modified — added merchant rule refresh tests)
- `src/stores/useMerchantRuleStore.test.ts` (modified — added forward-only guarantee tests)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)
- `_bmad-output/implementation-artifacts/4-5-rule-application-forward-only-on-future-imports.md` (modified)

### Review Findings

- [x] [Review][Patch] loadRules() failure corrupts successful import state — loadRules() is inside the import try block; if it rejects, the catch handler fires and sets importError, overwriting a successful importResult. Fix: add .catch(() => {}) on the loadRules call. [src/stores/useTransactionStore.ts:90]
- [x] [Review][Patch] mockLoadRules.mockClear() not added to beforeEach — spec dev notes explicitly require it alongside vi.clearAllMocks(); implementation omits it (functionally covered but a spec non-conformance). [src/stores/useTransactionStore.test.ts]
- [x] [Review][Defer] Forward-only tests don't assert transaction array reference identity [src/stores/useMerchantRuleStore.test.ts] — deferred, pre-existing design gap; low practical risk

### Change Log

- Story 4.5 implemented: loadRules() refresh after importOFX + forward-only guarantee tests (Date: 2026-04-08)
- Code review completed (Date: 2026-04-08): 2 patches, 1 deferred, 10 dismissed
