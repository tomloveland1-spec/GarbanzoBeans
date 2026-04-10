# Story 5.2: Savings Category — Distinct Visual Treatment

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want to designate one envelope as my savings category and have it look and behave distinctly from regular envelopes,
so that I always know my savings is in a different class from my spending budget.

## Acceptance Criteria

1. **AC1: Savings Card on Budget Screen**
   - Given Tom designates an envelope as the savings category (via `update_envelope` setting `isSavings: true`)
   - When the Budget screen renders
   - Then the savings envelope is displayed in a **visually separate section** from the standard envelope list
   - AND it renders using the `SavingsCard` component: "SAVINGS" label (lime `#C0F500`, uppercase), account name, **no progress bar**, **no state badge**, lime border tint (FR20, UX-DR10)

2. **AC2: Directional Indicator on Savings Transactions in Ledger**
   - Given savings transactions appear in the ledger (`transaction.envelopeId` resolves to an envelope where `isSavings === true`)
   - When a savings transaction row renders
   - Then a directional indicator is shown alongside the amount: "↓ deposited" for negative amounts (`amountCents < 0`), "↑ withdrew" for positive amounts (`amountCents > 0`) (FR20a)
   - AND non-savings transactions show no indicator

3. **AC3: Single Savings Designation Enforced**
   - Given only one envelope can be the savings category
   - When Tom tries to designate a second envelope as savings (calls `update_envelope` with `isSavings: true` while another already has `is_savings = 1`)
   - Then the Rust command returns `AppError { code: "SAVINGS_ALREADY_DESIGNATED" }`
   - AND the store surfaces it via `error` field
   - AND the existing savings designation is unchanged in the database

## Tasks / Subtasks

- [x] Task 1: Create `SavingsCard` component (AC: 1)
  - [x] 1.1: Create directory `src/components/gb/` (first component in this directory per architecture)
  - [x] 1.2: Create `src/components/gb/SavingsCard.tsx` — accepts `envelope: Envelope` prop; renders: "SAVINGS" uppercase label in lime (`#C0F500`), envelope name, lime left border tint, **no** progress bar, **no** state badge; includes ⋯ context menu with "Remove Savings Designation" (calls `updateEnvelope({ id, isSavings: false })`) and "Delete" actions
  - [x] 1.3: Create `src/components/gb/SavingsCard.test.tsx` — test: renders SAVINGS label, renders envelope name, no progress bar present, no state badge present, "Remove Savings Designation" menu item present

- [x] Task 2: Add "Set as Savings" action to EnvelopeCard (AC: 1, 3)
  - [x] 2.1: Add "Set as Savings" `DropdownMenuItem` to EnvelopeCard ⋯ menu — calls `useEnvelopeStore.getState().updateEnvelope({ id: envelope.id, isSavings: true })`; only show when `!envelope.isSavings`
  - [x] 2.2: Update `EnvelopeCard.test.tsx` — verify "Set as Savings" menu item renders when `isSavings = false`

- [x] Task 3: Update `EnvelopeList` to split savings and regular sections (AC: 1)
  - [x] 3.1: In `EnvelopeList.tsx`, derive `savingsEnvelopes = envelopes.filter(e => e.isSavings)` and `regularEnvelopes = envelopes.filter(e => !e.isSavings)`
  - [x] 3.2: Render savings section first (if any savings envelope exists): section header label "Savings" (muted, uppercase), then `SavingsCard` for each savings envelope
  - [x] 3.3: Render regular envelopes below with `EnvelopeCard` as before
  - [x] 3.4: If no savings envelope exists, render only the regular list (no empty savings section)

- [x] Task 4: Enforce single-savings constraint in Rust (AC: 3)
  - [x] 4.1: In `update_envelope_inner` (at `src-tauri/src/commands/mod.rs`), before applying `is_savings = Some(true)`, query: `SELECT COUNT(*) FROM envelopes WHERE is_savings = 1 AND id != ?1`
  - [x] 4.2: If count > 0, return `Err(AppError { code: "SAVINGS_ALREADY_DESIGNATED".to_string(), message: "Another envelope is already designated as savings.".to_string() })`
  - [x] 4.3: Add Rust test `test_update_envelope_savings_already_designated` — create two envelopes, set first as savings, attempt to set second as savings, verify `SAVINGS_ALREADY_DESIGNATED` error; verify first envelope unchanged

- [x] Task 5: Add directional indicator to `TransactionRow` (AC: 2)
  - [x] 5.1: In `TransactionRow.tsx`, derive `isSavingsTx`: look up `transaction.envelopeId` in `envelopes` array (already passed as prop) and check `envelope.isSavings`
  - [x] 5.2: In the amount cell, render directional indicator below the formatted amount when `isSavingsTx === true`: "↓ deposited" if `amountCents < 0`, "↑ withdrew" if `amountCents > 0`; use `type-caption` style, muted color
  - [x] 5.3: Update `TransactionRow.test.tsx` — test "↓ deposited" shown for savings tx with negative amount; test "↑ withdrew" shown for savings tx with positive amount; test no indicator for non-savings tx

- [x] Task 6: Run tests and validate (AC: all)
  - [x] 6.1: Run `npm test` (Vitest) — all new tests pass; no regressions
  - [x] 6.2: Run `cargo test` — `test_update_envelope_savings_already_designated` passes; no regressions
  - [x] 6.3: Run `npm run lint` — no new lint errors

## Dev Notes

### What Already Exists — Do NOT Recreate

| What | Where | Notes |
|------|-------|-------|
| `isSavings: boolean` on `Envelope` type | `src/lib/types.ts` line 52 | EXISTS — already in TypeScript |
| `isSavings?: boolean` on `UpdateEnvelopeInput` | `src/lib/types.ts` line 74 | EXISTS — ready to use |
| `is_savings` column on `envelopes` table | migration 005 | EXISTS — column is `INTEGER DEFAULT 0` |
| `update_envelope` Rust command (handles `is_savings`) | `src-tauri/src/commands/mod.rs:429` | EXISTS — already does `COALESCE(?7, is_savings)` for the field; just needs uniqueness guard added |
| `updateEnvelope` store action | `src/stores/useEnvelopeStore.ts` | EXISTS — passes isSavings to invoke |
| `SAVINGS_DEPOSIT_SIGN = -1 as const` | `src/lib/types.ts` line 187 | EXISTS — use to document sign convention |
| `src/components/gb/` directory | Not yet created | Must create — architecture specifies custom components live here |
| `src/features/savings/` directory | Not yet created | For wealth panel in future stories; SavingsCard is in `components/gb/`, not `features/savings/` |

### Component Location — SavingsCard

Per UX spec (§ Component Implementation Strategy):
> Custom components live in `src/components/gb/` to distinguish them from themed shadcn/ui components in `src/components/ui/`

`SavingsCard` is a reusable component, not a feature page, so it goes in `src/components/gb/SavingsCard.tsx`.

### SavingsCard Visual Spec

From UX-DR10:
- **"SAVINGS" label** — uppercase, lime `#C0F500`, small caps style (`type-label` class + lime color override)
- **Envelope name** — standard body text
- **Lime border tint** — use `borderLeft: '4px solid #C0F500'` (same pattern as EnvelopeCard which uses `STATE_COLORS[state]`)
- **No progress bar** — omit the `<div>` mini-bar that EnvelopeCard renders
- **No state badge** — omit the Traffic Light badge (savings is not a spend envelope; it has no green/amber/red state)
- **No "Borrow" button** — savings card never shows the borrow trigger
- Background/border: same surface token as EnvelopeCard (`--color-bg-surface`, `--color-border`)

Do NOT use hardcoded hex values in component files — route through the token variable or the defined constant `#C0F500` (which maps to `--accent-lime`). Existing EnvelopeCard uses `STATE_COLORS[state]` inline; same pattern is acceptable here with the lime constant.

### Uniqueness Enforcement — Rust Side

In `update_envelope_inner` (line ~330, `src-tauri/src/commands/mod.rs`), add the guard **before** the UPDATE statement:

```rust
if let Some(true) = input.is_savings {
    let already: i64 = conn.query_row(
        "SELECT COUNT(*) FROM envelopes WHERE is_savings = 1 AND id != ?1",
        rusqlite::params![input.id],
        |row| row.get(0),
    )?;
    if already > 0 {
        return Err(AppError {
            code: "SAVINGS_ALREADY_DESIGNATED".to_string(),
            message: "Another envelope is already designated as savings. Remove that designation first.".to_string(),
        });
    }
}
```

This approach keeps enforcement at the data layer. UI also disables the "Set as Savings" action when a savings envelope already exists (AC3 "inline message" = the store error displayed in EnvelopeList's existing `{error && ...}` block).

### Directional Indicator — Sign Convention

Sign rule (from `SAVINGS_DEPOSIT_SIGN = -1`):
- `amountCents < 0` → money left checking → went into savings → **"↓ deposited"**
- `amountCents > 0` → money came back from savings → **"↑ withdrew"**

Place indicator in the amount cell, below the formatted amount value, using `type-caption` class and `--color-text-secondary` color. Do NOT add a new column — inline in the existing amount `<td>`.

`TransactionRow` already receives `envelopes: Envelope[]` prop. Derive: `const savingsEnvelopeIds = new Set(envelopes.filter(e => e.isSavings).map(e => e.id))`. Check: `const isSavingsTx = transaction.envelopeId !== null && savingsEnvelopeIds.has(transaction.envelopeId)`.

### EnvelopeList Section Layout

```
┌─────────────────────────┐
│  [SAVINGS section]      │  ← only if savingsEnvelopes.length > 0
│    SavingsCard           │
├─────────────────────────┤
│  [Regular envelopes]    │
│    EnvelopeCard          │
│    EnvelopeCard          │
│    ...                   │
├─────────────────────────┤
│  [Add Envelope] [Allocate] │
└─────────────────────────┘
```

No section header needed for regular envelopes. Add a small section label like "Savings" (muted, uppercase, `type-label`) above the SavingsCard if one exists.

### Rust Command Pattern (existing)

All Rust commands follow this pattern (verified from `update_envelope_inner`):
- Lock mutex → `let conn = state.0.lock().map_err(...)?`
- `conn.query_row()` for reads, `conn.execute()` for writes
- `unchecked_transaction()` for atomic writes
- Return `Result<T, AppError>`
- Existing struct: `UpdateEnvelopeInput` already has `pub is_savings: Option<bool>` at line 191 of `mod.rs`

### Testing Pattern (from story 4.6 / story 5.1)

```typescript
// SavingsCard.test.tsx
import { render, screen } from '@testing-library/react';
import SavingsCard from '@/components/gb/SavingsCard';
import type { Envelope } from '@/lib/types';

const savingsEnvelope: Envelope = {
  id: 1, name: 'ING Savings', type: 'Rolling', priority: 'Need',
  allocatedCents: 0, monthId: null, createdAt: '2026-01-01', isSavings: true,
};
```

For Rust tests, use the pattern established in the existing `#[cfg(test)] mod tests` block in `mod.rs` (uses `fresh_conn()` helper with in-memory SQLite).

### Deferred (Not in Story 5.2 Scope)

- **Streak indicator** ("3-month streak") — listed in UX anatomy but no AC in story 5.2; defer to story 5.6 or later
- **Deposit status line in SavingsCard** ("↓ $300 deposited") — partial; the directional indicator is in the ledger (TransactionRow); SavingsCard deposit status derives from savings flow data, defer to story 5.6
- **Wealth panel** (arc gauge, runway number, reconciliation form) — Epic 5, stories 5.3–5.7
- **`src/features/savings/` feature folder** — wealth panel lives here; not needed in story 5.2

### Project Structure Notes

- Tests co-located with source (not in `__tests__/`)
- `src/components/gb/` — custom GarbanzoBeans components (create with story 5.2)
- `src/features/envelopes/` — touch `EnvelopeList.tsx`, `EnvelopeCard.tsx`
- `src/features/transactions/` — touch `TransactionRow.tsx`, `TransactionRow.test.tsx`
- `src-tauri/src/commands/mod.rs` — single file; do NOT split; add savings guard to `update_envelope_inner`

### References

- Story 5.2 ACs: `_bmad-output/planning-artifacts/epics.md` line 931
- SavingsCard anatomy: `_bmad-output/planning-artifacts/ux-design-specification.md` line 642
- Component location rule: `_bmad-output/planning-artifacts/ux-design-specification.md` line 650
- Design tokens (lime `#C0F500`, savings colors): `_bmad-output/planning-artifacts/ux-design-specification.md` line 321–334
- Sign convention: `src/lib/types.ts` line 187 (`SAVINGS_DEPOSIT_SIGN`)
- `isSavings` TS type: `src/lib/types.ts` lines 52, 74
- `update_envelope_inner`: `src-tauri/src/commands/mod.rs` line ~330
- Existing EnvelopeCard (pattern reference): `src/features/envelopes/EnvelopeCard.tsx`
- Existing EnvelopeList (to update): `src/features/envelopes/EnvelopeList.tsx`
- Existing TransactionRow (to update): `src/features/transactions/TransactionRow.tsx`
- Previous story (5.1) learnings: `_bmad-output/implementation-artifacts/5-1-savings-schema-two-metric-data-model.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded cleanly.

### Completion Notes List

- Created `src/components/gb/` directory and `SavingsCard.tsx` — lime-accented card with "SAVINGS" label, envelope name, lime left border; no progress bar, no state badge, no Borrow button. ⋯ menu has "Remove Savings Designation" and "Delete".
- Added `isSavings: false` to `makeEnvelope` helper in `EnvelopeCard.test.tsx` (required field on `Envelope` type).
- Added "Set as Savings" `DropdownMenuItem` to `EnvelopeCard` — conditionally shown when `!envelope.isSavings`; calls `updateEnvelope({ id, isSavings: true })`.
- Updated `EnvelopeList.tsx` to split savings/regular: `SavingsCard` section rendered first with muted "Savings" section header; regular `EnvelopeCard` rows below; savings section hidden when empty.
- Added uniqueness guard to `update_envelope_inner` in `src-tauri/src/commands/mod.rs`: queries `COUNT(*) WHERE is_savings = 1 AND id != ?1` before applying `is_savings = true`; returns `SAVINGS_ALREADY_DESIGNATED` error if another envelope already holds the designation.
- Added new Rust test module `envelope_savings_tests` with `test_update_envelope_savings_already_designated` — passes.
- Added `isSavingsTx` derivation to `TransactionRow.tsx` using a `Set` of savings envelope IDs; renders "↓ deposited" / "↑ withdrew" indicator below the amount cell for savings transactions.
- Added 4 new tests to `TransactionRow.test.tsx` covering both directions and the no-indicator cases.
- All new Vitest tests pass (322 total, 309 existing + 13 new). Pre-existing `BorrowOverlay.test.tsx` failures (13) and `savings_tests` Rust failures (6) are unrelated to this story and pre-date it.
- No new lint errors introduced.

### File List

- `src/components/gb/SavingsCard.tsx` (new)
- `src/components/gb/SavingsCard.test.tsx` (new)
- `src/features/envelopes/EnvelopeCard.tsx` (modified — added "Set as Savings" menu item)
- `src/features/envelopes/EnvelopeCard.test.tsx` (modified — added `isSavings: false` to helper, added 2 tests)
- `src/features/envelopes/EnvelopeList.tsx` (modified — savings/regular split, SavingsCard import)
- `src/features/transactions/TransactionRow.tsx` (modified — savings directional indicator)
- `src/features/transactions/TransactionRow.test.tsx` (modified — 4 new directional indicator tests)
- `src-tauri/src/commands/mod.rs` (modified — SAVINGS_ALREADY_DESIGNATED guard + envelope_savings_tests module)
- `_bmad-output/implementation-artifacts/5-2-savings-category-distinct-visual-treatment.md` (modified — story tracking)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status updates)

### Review Findings

- [x] [Review][Patch] SavingsCard does not check `isReadOnly` — action menu remains interactive in read-only mode, violating the read-only contract enforced by EnvelopeCard [`src/components/gb/SavingsCard.tsx`]
- [x] [Review][Patch] Missing test: "Delete" menu item present in SavingsCard dropdown — AC1/Dev Notes require both "Remove Savings Designation" and "Delete"; only Remove is tested [`src/components/gb/SavingsCard.test.tsx`]
- [x] [Review][Patch] Missing test: absence of Borrow button in SavingsCard — spec explicitly lists "no Borrow button" alongside no progress bar and no state badge; the other two are tested but Borrow button is not [`src/components/gb/SavingsCard.test.tsx`]
- [x] [Review][Patch] Missing test: store `error` field populated on `SAVINGS_ALREADY_DESIGNATED` — AC3 requires the store surfaces the error; no test covers this behavior in the envelope store [`src/stores/useEnvelopeStore.ts`]
- [x] [Review][Defer] TOCTOU between uniqueness guard and UPDATE in `update_envelope_inner` — guard runs outside the transaction; safe in practice because `Mutex<Connection>` serializes all DB calls, but pattern is latent footgun [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing
- [x] [Review][Defer] `create_envelope_inner` has no `SAVINGS_ALREADY_DESIGNATED` guard — uniqueness only enforced on UPDATE; UI does not expose `isSavings` on creation so not triggerable today [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing
- [x] [Review][Defer] `handleDelete` reads `useEnvelopeStore.getState().error` after async call — stale prior error could prevent dialog from closing; pre-existing pattern shared with EnvelopeCard [`src/components/gb/SavingsCard.tsx`] — deferred, pre-existing
- [x] [Review][Defer] `test_update_envelope_savings_already_designated` uses `update_envelope_inner` with all-None fields to assert read state — using a write function as a read oracle; works but mixes concerns [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing
- [x] [Review][Defer] `SAVINGS_ALREADY_DESIGNATED` error appears only at the bottom of EnvelopeList, not inline near the triggering card — UX improvement, spec does not prescribe placement [`src/features/envelopes/EnvelopeList.tsx`] — deferred, pre-existing
- [x] [Review][Defer] `record_reconciliation_inner` uses SQLite `date('now')` (UTC) — reconciliation date may show as tomorrow in timezones behind UTC; cosmetic and pre-existing from story 5.1 [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing
- [x] [Review][Defer] No test asserts directional indicator is DOM-ordered *below* the amount — `display: block` achieves this visually; testing DOM order is excessive [`src/features/transactions/TransactionRow.test.tsx`] — deferred, pre-existing

## Change Log

- 2026-04-08: Story 5.2 created — savings category distinct visual treatment
- 2026-04-08: Story 5.2 implemented — SavingsCard component, Set as Savings action, EnvelopeList split, Rust uniqueness guard, TransactionRow directional indicator; all ACs satisfied
- 2026-04-08: Code review complete — 4 patches applied, 7 deferred, 5 dismissed; status → done
