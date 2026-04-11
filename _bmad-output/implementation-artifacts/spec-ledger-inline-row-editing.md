---
title: 'Ledger Inline Row Editing'
type: 'feature'
created: '2026-04-10'
status: 'done'
baseline_commit: 'a6ae7cae75f64a6eda5980dec14413016d7569e7'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The TransactionDetailPanel is a 380px side pane that opens on row click, stealing screen real estate and requiring a separate Save workflow to edit any field. It feels clunky, and its sharp-edged panel design is inconsistent with the app's direction.

**Approach:** Replace it entirely with inline row editing. Clicking any editable cell enters edit mode for that row — cells render as inputs in-place — with a compact Save / × button pair in a new actions column. The Cleared column becomes a direct click toggle with no edit mode. Delete TransactionDetailPanel.

## Boundaries & Constraints

**Always:**
- In read-only mode (`isReadOnly = true`): block entering edit mode; Cleared toggle must be a no-op.
- `updateTransaction` in the store handles optimistic updates and read-only guard — call it unchanged.
- Clicking a different row while one row is in edit mode discards the unsaved draft (no prompt, no auto-save).
- Memo remains a sub-line within the Payee cell in both view and edit mode — no new column (Goal B is deferred).
- Remove the "Savings Deposit / Savings Withdrawal" sub-label from the Amount cell.

**Ask First:**
- If `updateTransaction` resolves with a store error, ask the user before choosing a new error-surfacing pattern (inline vs. toast).

**Never:**
- Do not auto-save on blur — Tom explicitly requires a Save button.
- Do not introduce Goals B (memo column setting) or C (import memo-as-payee) — both are in deferred-work.md.
- Do not add new shadcn components — compose from existing `Input` and `Select`.

</frozen-after-approval>

## Code Map

- `src/features/transactions/LedgerView.tsx` — main component: add editingRowId/draft state, inline inputs per column, Cleared toggle, actions column, remove TransactionDetailPanel usage and savings sublabel
- `src/features/transactions/TransactionDetailPanel.tsx` — DELETE this file
- `src/features/transactions/LedgerView.test.tsx` — remove panel and stale tests; add inline editing coverage

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enter edit mode | Click any non-Cleared cell on a non-editing row | Row swaps all editable cells to inputs; Save / × appear in actions column | — |
| Save valid edit | Edit fields, click Save | `updateTransaction` called with draft; row returns to view mode | — |
| Save invalid amount | Non-numeric string in Amount input, click Save | Save blocked; inline error shown below Amount input | Show error text, do not call `updateTransaction` |
| Cleared toggle | Click Cleared cell (normal mode) | `updateTransaction({ id, isCleared: !current })` immediately; no edit mode | — |
| Cleared toggle read-only | Click Cleared cell when `isReadOnly = true` | No-op | — |
| Click another row while editing | Row A in edit mode → click Row B | Draft for Row A discarded; Row B enters edit mode | — |
| Read-only, click cell | `isReadOnly = true`, click any non-Cleared cell | Edit mode blocked; cells stay display-only | — |

## Tasks & Acceptance

**Execution:**
- [x] `src/features/transactions/LedgerView.tsx` — Add `editingRowId: number | null` and `draft` state (payee, amountStr, date, category, isCleared, memo). Remove `selectedId` state and `handleRowSelect`. On row click (not Cleared cell), set `editingRowId` and initialize `draft` from row values; guard with `!isReadOnly`. Re-define each column's `cell` renderer: when `editingRowId === row.original.id`, render an `Input` (for date, payee, amount) or shadcn `Select` (for category); otherwise render existing display markup unchanged. In the Payee cell edit mode, add a small `<textarea>` below the payee `Input` for memo. Add an `actions` column (no header, narrow fixed width) that renders "Save" (Button) and "×" (ghost Button) only when the row is editing. On Save: validate amount with `parseFloat`/`isNaN`, show inline error and abort if invalid, otherwise call `updateTransaction` and clear edit state. Add `handleClearedToggle(id, current)` that calls `updateTransaction({ id, isCleared: !current })`; attach to Cleared cell `onClick` with `e.stopPropagation()`. Guard with `isReadOnly`. Remove `TransactionDetailPanel` from JSX and its import. Remove the isSavingsTx "Savings Deposit / Savings Withdrawal" sub-label from the Amount cell.
- [x] `src/features/transactions/TransactionDetailPanel.tsx` — Delete file.
- [x] `src/features/transactions/LedgerView.test.tsx` — Remove stale `it('renders Inflow and Outflow balance labels')` test. Remove any test referencing `transaction-detail-panel`. Update any import-summary text assertions to match current component output. Add tests: clicking a row enters edit mode (inputs rendered); clicking Save calls `updateTransaction` with correct payload; invalid amount shows error and does not call `updateTransaction`; clicking Cleared cell calls `updateTransaction` immediately without edit mode; edit mode is blocked when `isReadOnly = true`.

**Acceptance Criteria:**
- Given the ledger has transactions, when a user clicks any cell except the Cleared column, then that row enters edit mode with all fields rendered as inputs and Save / × buttons visible.
- Given a row is in edit mode, when the user clicks Save with valid values, then `updateTransaction` is called with the draft values and the row returns to display mode.
- Given a row is in edit mode with a non-numeric amount, when the user clicks Save, then an inline error appears and `updateTransaction` is not called.
- Given the ledger has a transaction, when a user clicks the Cleared cell, then `isCleared` is toggled immediately via `updateTransaction` without entering edit mode.
- Given `isReadOnly = true`, when a user clicks any row cell, then no edit mode is entered.
- Given a savings transaction, when the ledger renders, then no "Savings Deposit / Savings Withdrawal" sub-label appears under the amount.
- Given the project is built after TransactionDetailPanel.tsx is deleted, then `npm run build` produces no broken-import errors.

## Design Notes

**Actions column:** Rightmost column, no header, narrow fixed width (~100px). Renders empty in view mode (invisible cell). In edit mode renders a compact "Save" button (primary variant) and an "×" button (ghost variant) — side by side. This keeps the column visually recessive until needed.

**Amount input:** Pre-fill with decimal string (e.g. `"-50.00"`), right-aligned, `fontVariantNumeric: tabular-nums`. Validate on Save; render error as a small `type-caption` span in red below the input within the cell.

**Category select:** Reuse the same `<Select>` pattern from TransactionDetailPanel — `value={draft.category}`, options: "none" → Uncategorized, plus each envelope by id/name.

## Verification

**Commands:**
- `npm run build` — expected: zero TypeScript errors, no broken imports
- `npm test -- LedgerView` — expected: all tests pass

## Suggested Review Order

**Edit state machine (core of the change)**

- Entry point: row click handler initialises draft and enters edit mode
  [`LedgerView.tsx:206`](../../src/features/transactions/LedgerView.tsx#L206)

- Save handler: validates amount, calls updateTransaction, clears edit state
  [`LedgerView.tsx:226`](../../src/features/transactions/LedgerView.tsx#L226)

- Cleared toggle: direct updateTransaction without entering edit mode
  [`LedgerView.tsx:268`](../../src/features/transactions/LedgerView.tsx#L268)

**Column cell renderers (view ↔ edit mode swap)**

- Date cell: swaps to Input on editing row, stays display otherwise
  [`LedgerView.tsx:288`](../../src/features/transactions/LedgerView.tsx#L288)

- Payee cell: Input + memo textarea in edit mode; display with memo sub-line in view
  [`LedgerView.tsx:315`](../../src/features/transactions/LedgerView.tsx#L315)

- Category cell: shadcn Select in edit mode; pill chip in view
  [`LedgerView.tsx:360`](../../src/features/transactions/LedgerView.tsx#L360)

- Amount cell: Input + inline error in edit mode; formatCurrency in view (savings sublabel removed)
  [`LedgerView.tsx:455`](../../src/features/transactions/LedgerView.tsx#L455)

- Actions column: Save/× buttons visible only on the editing row
  [`LedgerView.tsx:510`](../../src/features/transactions/LedgerView.tsx#L510)

**Tests**

- Inline editing test coverage (edit mode, save, cancel, cleared toggle, read-only)
  [`LedgerView.test.tsx:231`](../../src/features/transactions/LedgerView.test.tsx#L231)
