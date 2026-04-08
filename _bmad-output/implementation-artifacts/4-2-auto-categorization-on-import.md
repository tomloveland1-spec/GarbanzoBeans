# Story 4.2: Auto-Categorization on Import

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want imported transactions to be automatically categorized using my stored merchant rules,
so that familiar payees require zero manual work on future imports.

## Acceptance Criteria

1. **Given** merchant rules exist in the store
   **When** an OFX file is imported
   **Then** the `import_ofx` command applies each rule by checking if its `payee_substring` appears in the transaction payee string case-insensitively; when exactly one rule matches, the imported transaction is inserted with that rule's `envelope_id` automatically assigned. Preserve Story 3.4 auto-match behavior for existing uncleared transactions.

2. **Given** a transaction is auto-categorized during import
   **When** it appears in the latest import results
   **Then** the UI shows an inline label in the transaction row equivalent to `-> Groceries via Kroger rule`, and the matched rule's `match_count` increments while `last_matched_at` is updated atomically in the same Rust transaction.

3. **Given** a transaction payee matches no stored rule, or more than one stored rule
   **When** the import completes
   **Then** the transaction is inserted with `envelope_id = NULL`; no silent rule choice is made; the import result exposes enough metadata for Story 4.3's unknown merchant queue and for conflict messaging introduced by Story 4.1.

4. **Given** auto-categorized transactions are committed
   **When** the import resolves
   **Then** `useTransactionStore` merges the returned rows immediately with no manual refresh, and all UI already derived from transaction state reflects the new categorized rows for the latest import batch.

## Tasks / Subtasks

- [x] Task 1: Extend Rust import flow to apply merchant rules after Story 3.4 auto-match logic (AC: 1, 3)
  - [x] Keep the current `import_ofx_inner` control flow in `src-tauri/src/commands/mod.rs`: first attempt uncleared-transaction matching; only apply merchant-rule categorization for entries that become new inserts.
  - [x] Load merchant rules once per import using the existing `MerchantRule` row mapping; do not query rules inside the per-transaction loop.
  - [x] Perform case-insensitive substring checks against imported payees using the same normalization approach on every comparison.
  - [x] Treat `0` matches as unknown and `>1` matches as conflict/unknown; never pick one rule silently when multiple rules match the same payee.
  - [x] Insert unmatched/conflicted rows with `envelope_id = NULL`; insert uniquely matched rows with the matched rule's `envelope_id`.

- [x] Task 2: Update matched-rule bookkeeping atomically in Rust (AC: 2)
  - [x] When exactly one rule matches a new imported transaction, increment `merchant_rules.match_count` and set `last_matched_at` in the same `unchecked_transaction()` block as the transaction insert.
  - [x] Preserve all-or-nothing import semantics from Story 3.2: if any insert or rule update fails, nothing from that import batch commits.
  - [x] Do not mutate historical transactions or retroactively re-categorize older rows; rule application is forward-only.

- [x] Task 3: Extend the import result contract for UI-only import annotations (AC: 2, 3, 4)
  - [x] Add a Rust response shape for latest-import annotations instead of overloading persisted SQLite schema for display-only labels.
  - [x] Extend `ImportResult` in both Rust and `src/lib/types.ts` with metadata sufficient to render:
  - [x] which newly imported transaction IDs were auto-categorized
  - [x] which rule/payee substring produced the label text
  - [x] which imported transaction IDs remain uncategorized because no rule or conflicting rules applied
  - [x] Keep existing `transactions` and `matchedTransactions` arrays intact so current store merge behavior does not regress.

- [x] Task 4: Update frontend store and transaction UI for latest-import feedback (AC: 2, 4)
  - [x] Update `src/stores/useTransactionStore.ts` to preserve the richer `ImportResult` payload while keeping the current in-place merge of `matchedTransactions` plus append of new rows.
  - [x] Update transaction-row rendering so the latest imported, auto-categorized rows display the inline rule label without affecting older ledger rows.
  - [x] Reuse the existing envelope map from `LedgerView.tsx` to render the envelope portion of the label; do not add a duplicate envelope-name lookup path.
  - [x] Keep uncategorized imports readable for the future unknown-merchant queue flow; do not implement the full queue UI in this story.

- [x] Task 5: Add regression coverage in Rust and Vitest (AC: 1, 2, 3, 4)
  - [x] Add Rust tests around `import_ofx_inner` for: unique rule match, no rule match, multiple matching rules, `match_count` increment, `last_matched_at` update, and preservation of existing uncleared auto-match behavior.
  - [x] Add a Rust test that proves the import remains atomic when a rule-update or categorized insert fails.
  - [x] Extend `src/stores/useTransactionStore.test.ts` for the richer `ImportResult` payload and latest-batch merge behavior.
  - [x] Add or update UI tests in `src/features/transactions/OFXImporter.test.tsx`, `src/features/transactions/LedgerView.test.tsx`, and/or `src/features/transactions/TransactionRow.test.tsx` to verify the inline matched-rule label appears only for the current import results.

### Review Findings

- [x] [Review][Decision] `matchedRuleLabel` shows stale data after user manually reassigns envelope — Fixed: `updateTransaction` now removes the annotation from `importResult.categorizedAnnotations` when `envelopeId` or `clearEnvelopeId` changes. [`src/stores/useTransactionStore.ts`]
- [x] [Review][Decision] `uncategorized_ids` doesn't distinguish "no rule matched" from "multiple rules conflicted" — Fixed: added separate `conflicted_ids` (Rust) / `conflictedIds` (TS) field to `ImportResult`; multi-match transactions route to `conflicted_ids`, zero-match to `uncategorized_ids`. [`src-tauri/src/commands/mod.rs`, `src/lib/types.ts`]
- [x] [Review][Decision] `matchedTransactions` not appended to store if not already present — Fixed: `importOFX` now appends matched transactions whose IDs aren't already in `state.transactions`. [`src/stores/useTransactionStore.ts`]
- [x] [Review][Patch] `ImportResult.categorizedAnnotations` typed as `Record<number, string>` but JSON object keys are always strings — Fixed: type changed to `Record<string, string>`; lookup updated to `String(t.id)`. [`src/lib/types.ts`, `src/features/transactions/LedgerView.tsx`]
- [x] [Review][Patch] `ImportResult.count` excludes matched transactions — Pre-applied: `count` already uses `(transactions.len() + matched_transactions.len())` in the implementation. No change needed.
- [x] [Review][Patch] `latest_date` is null when all OFX entries are auto-matched — Pre-applied: `latest_date` is derived from all parsed OFX entries (not new transactions only). No change needed.
- [x] [Review][Patch] Missing test: matched-rule label disappears from transactions not annotated in a subsequent import batch — Fixed: test added. [`src/features/transactions/LedgerView.test.tsx`]
- [x] [Review][Defer] `importOFX` concurrent calls can produce duplicate transaction rows in store — deferred, pre-existing Zustand pattern; single-user desktop app makes concurrent invocation unlikely
- [x] [Review][Defer] `_tempIdCounter` module-level counter not reset across store recreations — deferred, pre-existing design; negative IDs don't collide with positive DB IDs
- [x] [Review][Defer] `unchecked_transaction()` instead of `conn.transaction()` — deferred, rusqlite API constraint with `&Connection` (not `&mut Connection`); not introduced by 4.2
- [x] [Review][Defer] `generate_batch_id` sequence resets on process restart — deferred, millis component provides sufficient entropy for single-user use; batch IDs are not used as external unique keys
- [x] [Review][Defer] `envelopeMap.get()` returns "Unknown" for deleted envelopes — deferred, pre-existing `?? 'Unknown'` fallback pattern; not introduced by 4.2

## Dev Notes

### Story Intent

- Story 4.2 is a backend-plus-ledger-feedback story, not a full import-session redesign.
- The core requirement is to auto-assign `envelope_id` on newly imported rows using merchant rules created in Story 4.1.
- Unknown queue interaction stays in Story 4.3; inline substring selection and rule creation stay in Story 4.4; rules management UI stays in Story 4.6.

### Existing Implementation to Extend

- OFX parsing and import currently live in `src-tauri/src/commands/mod.rs` inside `import_ofx_inner`.
- Current import order is:
  - parse OFX
  - load uncleared transactions
  - auto-match existing uncleared rows by amount/payee/date window
  - insert unmatched rows with `envelope_id = NULL`
  - return `ImportResult { count, batch_id, latest_date, transactions, matched_transactions }`
- Story 4.2 should preserve that behavior and only add merchant-rule categorization for the rows currently inserted as new transactions.

### Backend Guardrails

- Keep commands centralized in `src-tauri/src/commands/mod.rs`. The architecture draft mentions feature-split Rust files, but the real repo still uses one command module.
- Reuse the existing `MerchantRule` schema and row mapping added by Story 4.1. Do not create a second merchant-rule model.
- Prefer deterministic rule evaluation:
  - normalize both payee and `payee_substring` with the same lowercase path
  - collect all matches first
  - if exactly one rule matches, apply it
  - if multiple rules match, mark the transaction as unresolved/conflicted
- Do not write any new database columns in this story. Display labels belong in the import response contract, not in SQLite.
- Preserve `Transaction` row shape and `map_transaction_row` ordering everywhere.

### Frontend Guardrails

- Current transaction UI lives under `src/features/transactions/`; there is no `src/features/merchant-rules/` UI tree yet. Follow the existing repo structure, not the older architecture example tree.
- `useTransactionStore.importOFX()` already merges:
  - `matchedTransactions` in place for existing uncleared rows
  - `transactions` as appended new imported rows
- Extend that path instead of introducing a parallel import-state store.
- Keep latest-import annotations scoped to `importResult`; do not permanently decorate every `Transaction` object unless a field is truly part of the domain model.
- `LedgerView.tsx` already builds `envelopeMap`; reuse it when rendering `Groceries` in a matched-rule label.

### Envelope-State Note

- The current budget/envelope UI does not yet derive live spent balances from transactions; `BudgetPage` renders `EnvelopeList` from envelope allocation state only.
- For this story, satisfy AC4 by ensuring transaction-ledger state updates immediately after import and by preserving the categorized `envelope_id` on inserted rows.
- If a UI surface already derives from transactions, it should update automatically. Do not expand this story into a full envelope-spending architecture rewrite.

### Previous Story Intelligence

- Story 4.1 already created:
  - migration `007_merchant_rules.sql`
  - `MerchantRule`, `CreateMerchantRuleInput`, `UpdateMerchantRuleInput`
  - `get/create/update/delete_merchant_rule` commands
  - `useMerchantRuleStore` with `conflictingRules()`
- Story 4.1 corrected an outdated epic reference: merchant rules use migration `007`, not `004`.
- Story 4.1 review fixes matter here:
  - blank/whitespace `payee_substring` is invalid
  - no-op rule updates are rejected
  - `map_merchant_rule_row` is shared and should stay that way
- Story 4.2 should build on that shared rule model and avoid duplicating conflict-detection ideas in an unrelated format.

### Git / Repo Intelligence

- Recent visible work patterns:
  - commands and migrations are implemented in-place rather than split into new backend modules
  - store tests use direct `invoke` mocks and assert optimistic/merge behavior
  - transaction import tests already focus on `import_ofx_inner` regression coverage
- Existing repo reality is more authoritative than the architecture draft when the two disagree.

### Testing Requirements

- Rust:
  - extend the existing `import_ofx_inner` test block in `src-tauri/src/commands/mod.rs`
  - reuse `fresh_conn()`, `insert_uncleared()`, and `make_ofx()` helpers where possible
  - add helper setup for envelopes and merchant rules rather than hand-writing raw SQL in every test
- TypeScript:
  - keep using Vitest + mocked `invoke`
  - extend current transaction-store import tests rather than creating a second import test suite
  - keep UI tests focused on rendered labels and latest-batch behavior, not full workflow simulation

### Library / Framework Requirements

- Stay within the currently pinned stack from `package.json`:
  - React 19
  - Zustand 5
  - Tauri API v2
  - TanStack Router v1
  - Vitest 3
- Continue using `invoke('import_ofx', { path })` from the store; no new frontend-side SQL or alternate IPC abstraction.

### File Structure Requirements

- Expected modified files:
  - `src-tauri/src/commands/mod.rs`
  - `src/lib/types.ts`
  - `src/stores/useTransactionStore.ts`
  - `src/stores/useTransactionStore.test.ts`
  - `src/features/transactions/TransactionRow.tsx`
  - `src/features/transactions/TransactionRow.test.tsx`
  - `src/features/transactions/LedgerView.tsx`
  - `src/features/transactions/LedgerView.test.tsx`
  - optionally `src/features/transactions/OFXImporter.tsx` and `src/features/transactions/OFXImporter.test.tsx` if the latest import summary needs richer copy
- Avoid creating `src/features/merchant-rules/` in this story unless a small shared display component is truly necessary.

### Out of Scope

- Story 4.3 unknown merchant queue UI and category assignment flow
- Story 4.4 substring selector / save-rule inline builder
- Story 4.5 forward-only rule-application policy UI
- Story 4.6 dedicated merchant-rules screen and historical rule-version display
- Any database migration for `matched_rule_version`
- Any rewrite of envelope budgeting screens to compute transaction-derived spending

### Project Structure Notes

- The architecture document still describes some future-facing structure that the live repo has not adopted yet.
- Follow the existing codebase conventions first:
  - Rust commands stay in `src-tauri/src/commands/mod.rs`
  - transaction UI stays in `src/features/transactions/`
  - Zustand stores stay in `src/stores/`
- No `project-context.md` file was found in the repository; planning artifacts and current source code are the authoritative context for this story.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4: Merchant Rules & Smart Categorization — The App Learns Tom's Life]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2: Auto-Categorization on Import]
- [Source: _bmad-output/planning-artifacts/architecture.md#Tech Stack]
- [Source: _bmad-output/planning-artifacts/architecture.md#Source Tree]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Flow]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#The Weekly Import Ritual]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Unknown Queue Item]
- [Source: _bmad-output/planning-artifacts/prd.md#Functional Requirements]
- [Source: _bmad-output/implementation-artifacts/4-1-merchant-rules-schema-data-model.md#Dev Notes]
- [Source: src-tauri/src/commands/mod.rs#import_ofx_inner]
- [Source: src/stores/useTransactionStore.ts]
- [Source: src/features/transactions/LedgerView.tsx]
- [Source: src/features/transactions/TransactionRow.tsx]
- [Source: package.json]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Story created from Epic 4.2, Story 4.1 implementation notes, current repo structure, and live import/store code.
- Story explicitly preserves Story 3.4 uncleared auto-match behavior and Story 4.1 merchant-rule data model.
- Story documents architecture drift so the implementation follows the actual repository layout instead of stale planned folders.
- Implemented 2026-04-08: Rust `import_ofx_inner` extended to load merchant rules once before the loop, apply case-insensitive substring matching for new inserts only (not auto-matched rows), assign `envelope_id` on unique match, leave NULL on zero/conflict matches, and increment `match_count` + set `last_matched_at` atomically in the same transaction.
- `ImportResult` extended with `categorized_annotations: HashMap<i64, String>` and `uncategorized_ids: Vec<i64>` — display-only metadata, nothing written to SQLite.
- Frontend: `TransactionRow` accepts optional `matchedRuleLabel` prop and renders it as a `data-testid="matched-rule-label"` sub-line in the payee cell. `LedgerView` computes the label from `importResult.categorizedAnnotations` and `envelopeMap` and passes it down.
- 7 new Rust tests + 6 new TypeScript tests added. All 65 Rust tests and 217 TypeScript tests pass. Pre-existing `BorrowOverlay.test.tsx` failures (13) confirmed pre-existing and unrelated.

### File List

- _bmad-output/implementation-artifacts/4-2-auto-categorization-on-import.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src-tauri/src/commands/mod.rs
- src/lib/types.ts
- src/stores/useTransactionStore.test.ts
- src/features/transactions/TransactionRow.tsx
- src/features/transactions/TransactionRow.test.tsx
- src/features/transactions/LedgerView.tsx
- src/features/transactions/LedgerView.test.tsx
- src/features/transactions/OFXImporter.test.tsx
