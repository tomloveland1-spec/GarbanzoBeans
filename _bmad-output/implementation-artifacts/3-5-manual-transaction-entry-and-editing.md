# Story 3.5: Manual Transaction Entry and Editing

Status: done

## Story

As Tom,
I want to manually enter a transaction and edit any transaction's details without affecting merchant rules,
So that I can record spending before it clears and correct mistakes freely.

## Acceptance Criteria

1. **Given** Tom clicks "Add Transaction" in the ledger
   **When** the inline entry form appears
   **Then** fields are shown for: payee, amount, date (defaulting to today), category (envelope selector); the transaction saves as uncleared (`is_cleared=0`) on confirm (FR3)

2. **Given** Tom clicks on any field of an existing transaction row
   **When** the click occurs
   **Then** that field enters inline edit mode; Enter or blur confirms the change; Escape cancels (UX-DR19)

3. **Given** Tom changes a transaction's category
   **When** the `update_transaction` command succeeds
   **Then** the transaction's `envelope_id` is updated; the affected envelopes' balances and states recalculate immediately; the merchant rule for that payee is not modified (FR5)

4. **Given** Tom changes a transaction's amount
   **When** the update commits
   **Then** the cleared and working balance totals in the ledger header update immediately without a refresh

## Tasks / Subtasks

- [x] Task 1 — Extract `TransactionRow` from `LedgerView` (AC: 2, 3, 4)
  - [x] Create `src/features/transactions/TransactionRow.tsx` containing the `<tr>` row currently inlined in `LedgerView.tsx`
  - [x] Props: `transaction: Transaction`, `envelopeMap: Map<number, string>`, `envelopes: Envelope[]` (full list, for the category Select)
  - [x] Import `TransactionRow` in `LedgerView.tsx` and replace the inline `transactions.map(t => <tr ...>)` with `transactions.map(t => <TransactionRow key={t.id} transaction={t} envelopeMap={envelopeMap} envelopes={envelopes} />)`
  - [x] All existing LedgerView tests must still pass after this refactor

- [x] Task 2 — Add inline editing to `TransactionRow` (AC: 2, 3, 4)
  - [x] Manage a `editingField: 'payee' | 'amount' | 'date' | 'category' | null` state variable locally in `TransactionRow`
  - [x] Manage a `draftValue: string` state variable for the current in-progress edit value
  - [x] **Payee cell:** on click → set `editingField = 'payee'`, `draftValue = transaction.payee`; render `<input>` auto-focused; on Enter or blur → call `commitEdit('payee')`; on Escape → cancel (`setEditingField(null)`)
  - [x] **Amount cell:** on click → set `editingField = 'amount'`, `draftValue = (transaction.amountCents / 100).toFixed(2)`; render right-aligned `<input type="text">`; on Enter or blur → call `commitEdit('amount')`; on Escape → cancel
  - [x] **Date cell:** on click → set `editingField = 'date'`, `draftValue = transaction.date`; render `<input type="date" value={draftValue}>`; on change → `setDraftValue`; on Enter or blur → call `commitEdit('date')`; on Escape → cancel
  - [x] **Category cell:** on click → set `editingField = 'category'`; render shadcn/ui `<Select>` with all envelopes + a "None" option; on `onValueChange` → call `commitEdit('category', selectedValue)` immediately (no Enter needed for Select)
  - [x] `commitEdit(field, value?)` function: parse value, call `useTransactionStore.getState().updateTransaction(input)`, then `setEditingField(null)`
  - [x] Amount parsing: `const cents = Math.round(parseFloat(draftValue) * 100)` — if `isNaN(cents)`, cancel without calling store
  - [x] Category: value `'none'` maps to `{ id: input.id, clearEnvelopeId: true }`; any envelope id maps to `{ id: input.id, envelopeId: Number(value) }`
  - [x] After `commitEdit('category', ...)` succeeds: call `useEnvelopeStore.getState().loadEnvelopes()` to refresh envelope states (AC: 3) — see Dev Notes for why

- [x] Task 3 — Add "Add Transaction" button and form (AC: 1)
  - [x] In `LedgerView.tsx`, add a secondary-tier "Add Transaction" button in the sticky header row (right-aligned, `variant="outline"`)
  - [x] Manage `showAddForm: boolean` state in `LedgerView`
  - [x] Create `src/features/transactions/AddTransactionForm.tsx` — rendered inline below the header when `showAddForm` is true
  - [x] Form fields:
    - Payee: `<Input placeholder="Payee" />` (blank payee is allowed — do NOT prevent submission for empty payee)
    - Amount: `<Input placeholder="Amount (e.g. -12.34)" />` — user types dollar amount with sign; right-aligned; validation: not empty, parseable as number
    - Date: `<Input type="date" defaultValue={today} />` where `today = new Date().toISOString().slice(0, 10)`
    - Category: shadcn/ui `<Select>` listing all envelopes from `useEnvelopeStore`; include first item "None" (value `'none'`)
  - [x] Props: `onSuccess: () => void`, `onCancel: () => void`
  - [x] On Save: parse `amountCents = Math.round(parseFloat(amountStr) * 100)`; if `isNaN(amountCents)` show inline error "Enter a valid amount (e.g. -12.34)"; else call `useTransactionStore.getState().createTransaction({ payee, amountCents, date, envelopeId: category === 'none' ? null : Number(category), isCleared: false })`
  - [x] On success (no `error` on store): call `onSuccess()` which closes form (`setShowAddForm(false)`)
  - [x] On failure: display `useTransactionStore.getState().error?.message` inline below the form
  - [x] On Cancel or Escape key: call `onCancel()` → `setShowAddForm(false)` with no side effects
  - [x] Keyboard: Escape in any form field cancels; Enter in text fields submits

- [x] Task 4 — Tests for `AddTransactionForm` (AC: 1)
  - [x] Create `src/features/transactions/AddTransactionForm.test.tsx`
  - [x] Test: renders payee, amount, date, category fields
  - [x] Test: submit with valid amount calls `createTransaction` with `isCleared: false` and correct `amountCents`
  - [x] Test: submit with invalid/empty amount does NOT call `createTransaction`; shows inline error
  - [x] Test: blank payee is allowed — form submits with `payee: ''`
  - [x] Test: clicking Cancel calls `onCancel` without calling `createTransaction`
  - [x] Test: category "None" submits with `envelopeId: null`

- [x] Task 5 — Tests for `TransactionRow` inline editing (AC: 2, 3, 4)
  - [x] Create `src/features/transactions/TransactionRow.test.tsx`
  - [x] Test: clicking payee cell activates edit mode — input with current payee value appears
  - [x] Test: Enter in payee edit calls `updateTransaction` with new payee and closes edit mode
  - [x] Test: Escape in payee edit cancels without calling `updateTransaction`
  - [x] Test: blur on payee edit calls `updateTransaction`
  - [x] Test: amount edit parses dollars to cents correctly (e.g., "-12.34" → `-1234`)
  - [x] Test: invalid amount (e.g., "abc") does NOT call `updateTransaction`
  - [x] Test: category select change calls `updateTransaction` with `envelopeId` and then calls `loadEnvelopes`
  - [x] Test: category "None" calls `updateTransaction` with `clearEnvelopeId: true`
  - [x] Update `LedgerView.test.tsx`: add `matchedTransactions: []` to the inline `importResult` mock objects (pre-existing TypeScript gap left from story 3.4)

## Dev Notes

### What Already Exists — Do NOT Recreate

The Rust backend commands and TypeScript types for this story are **fully implemented** from Stories 3.1–3.4. This story is **UI-only**.

| Concern | Already implemented |
|---|---|
| `create_transaction` Rust command | `src-tauri/src/commands/mod.rs` |
| `update_transaction` Rust command | `src-tauri/src/commands/mod.rs` |
| `get_transactions` Rust command | `src-tauri/src/commands/mod.rs` |
| `Transaction`, `CreateTransactionInput`, `UpdateTransactionInput` TS types | `src/lib/types.ts` |
| `useTransactionStore.createTransaction()` | `src/stores/useTransactionStore.ts` — with optimistic update |
| `useTransactionStore.updateTransaction()` | `src/stores/useTransactionStore.ts` — with optimistic update |
| `LedgerView.tsx` (read-only) | `src/features/transactions/LedgerView.tsx` |
| `LedgerPage.tsx` | `src/features/transactions/LedgerPage.tsx` |

Do NOT create new Tauri commands. Do NOT modify `useTransactionStore.ts`, `src/lib/types.ts`, or any Rust files.

### Envelope State Recalculation (AC: 3)

The `useEnvelopeStore` tracks `allocatedCents` (what's budgeted). Envelope traffic-light state is computed from allocated vs. spent. "Spent" comes from summing transactions that match each envelope's id. After changing a transaction's `envelope_id`, the affected envelope's spending total changes — so envelope state must refresh.

**Pattern:** After a successful `updateTransaction` that changes `envelopeId` (i.e., category change), call `useEnvelopeStore.getState().loadEnvelopes()`. This is the same pattern used in other cross-store interactions in this codebase.

**Do NOT** call `loadEnvelopes()` after payee, amount, or date changes — only after category changes (envelope_id changes).

**AC: 4 is free:** Cleared and working balances in `LedgerView` are derived inline from `useTransactionStore`'s `transactions` array:

```ts
const clearedBalance = transactions.filter(t => t.isCleared).reduce((s, t) => s + t.amountCents, 0);
const workingBalance = transactions.reduce((s, t) => s + t.amountCents, 0);
```

Since `updateTransaction` applies an optimistic update immediately to `transactions` in the store, balance totals update immediately without additional work.

### `UpdateTransactionInput.clearEnvelopeId` Flag

When setting a transaction's category to "None" (uncategorized), use:
```ts
updateTransaction({ id: transaction.id, clearEnvelopeId: true })
// NOT: updateTransaction({ id: transaction.id, envelopeId: null })
// envelopeId: null is ambiguous (undefined vs null); clearEnvelopeId: true is explicit
```

The Rust `update_transaction_inner` handles this:
```sql
envelope_id = CASE WHEN ?7 = 1 THEN NULL ELSE COALESCE(?5, envelope_id) END
```

### Inline Edit State Pattern

Manage edit state locally in `TransactionRow` — do NOT add edit state to the Zustand store. Local state is correct here: only one row is being edited at a time per user interaction, and edit state is transient UI state.

```tsx
const [editingField, setEditingField] = useState<'payee' | 'amount' | 'date' | 'category' | null>(null);
const [draftValue, setDraftValue] = useState('');

function startEdit(field: typeof editingField, initialValue: string) {
  setEditingField(field);
  setDraftValue(initialValue);
}

function cancelEdit() {
  setEditingField(null);
  setDraftValue('');
}
```

### Amount Input Convention

User enters a dollar value with sign: `-12.34` (expense) or `34.00` (income). Convert on save:
```ts
const cents = Math.round(parseFloat(draftValue) * 100);
if (isNaN(cents)) { /* cancel or show error */ return; }
```

For the "Add Transaction" form, show a placeholder like `Amount (e.g. -12.34)` to signal the convention.

### shadcn/ui Select — Category Picker

The `<Select>` component is already themed and in use in `AddEnvelopeForm.tsx`. Follow the same pattern:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

<Select
  value={transaction.envelopeId !== null ? String(transaction.envelopeId) : 'none'}
  onValueChange={(val) => commitEdit('category', val)}
>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="none">None</SelectItem>
    {envelopes.map(e => (
      <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Design System — Inline Edit Styling

Use the same `var(--color-bg-surface)`, `var(--color-border)`, `var(--color-text-primary)` tokens already in use throughout `LedgerView`. No new color tokens needed.

Edit mode inputs should fit naturally in their table cells — avoid adding significant height or visual disruption. A thin `1px solid var(--color-border)` border on the active input is sufficient.

Buttons:
- "Add Transaction": `<Button variant="outline">` — secondary tier
- Form "Save": `<Button variant="outline">` — secondary tier, disabled while `isWriting`
- Form "Cancel": `<Button variant="ghost">`

### Test Mocking Pattern for `useTransactionStore`

The existing `LedgerView.test.tsx` mocks the store with a module-level state object. Follow the same pattern in new test files, extending it to include `createTransaction` and `updateTransaction`:

```ts
const mockState = {
  transactions: [] as Transaction[],
  importResult: null,
  isWriting: false,
  error: null,
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
};
vi.mock('@/stores/useTransactionStore', () => ({
  useTransactionStore: vi.fn((selector) => selector(mockState)),
}));
```

Also mock `useTransactionStore.getState()` for direct store access:
```ts
// After the vi.mock block:
import { useTransactionStore } from '@/stores/useTransactionStore';
(useTransactionStore as unknown as { getState: () => typeof mockState }).getState = () => mockState;
```

### Pre-existing: `LedgerView.test.tsx` ImportResult Missing `matchedTransactions`

The inline `importResult` mocks in `LedgerView.test.tsx` are missing `matchedTransactions: []` (added in story 3.4 to the type but not to this test file). This causes TypeScript errors. Fix as part of Task 5 — add `matchedTransactions: []` to each `importResult` mock object in that file. This is the only change to the existing test file.

### File Structure

```
src/features/transactions/
  LedgerPage.tsx              ← no changes needed
  LedgerView.tsx              ← add "Add Transaction" button + showAddForm state
  LedgerView.test.tsx         ← update: add matchedTransactions: [] to import mocks
  OFXImporter.tsx             ← no changes needed
  OFXImporter.test.tsx        ← no changes needed
  TransactionRow.tsx          ← NEW: extracted from LedgerView + inline editing
  TransactionRow.test.tsx     ← NEW: inline editing tests
  AddTransactionForm.tsx      ← NEW: add transaction form
  AddTransactionForm.test.tsx ← NEW: form tests
```

### References

- Story 3.5 AC source: [Source: _bmad-output/planning-artifacts/epics.md — Story 3.5]
- FR3 (manual transaction entry): [Source: _bmad-output/planning-artifacts/epics.md — FR3]
- FR5 (edit without affecting merchant rules): [Source: _bmad-output/planning-artifacts/epics.md — FR5]
- UX-DR19 (inline editing): [Source: _bmad-output/planning-artifacts/epics.md — UX-DR19]
- `create_transaction_inner`: [Source: src-tauri/src/commands/mod.rs]
- `update_transaction_inner`: [Source: src-tauri/src/commands/mod.rs]
- `Transaction`, `CreateTransactionInput`, `UpdateTransactionInput` types: [Source: src/lib/types.ts]
- `useTransactionStore` — `createTransaction`, `updateTransaction`: [Source: src/stores/useTransactionStore.ts]
- `AddEnvelopeForm.tsx` for form + Select pattern: [Source: src/features/envelopes/AddEnvelopeForm.tsx]
- `LedgerView.tsx` current state: [Source: src/features/transactions/LedgerView.tsx]
- `LedgerView.test.tsx` current tests: [Source: src/features/transactions/LedgerView.test.tsx]
- Architecture — store-first IPC (ADR-5): [Source: _bmad-output/planning-artifacts/architecture.md — ADR-5]
- Architecture — optimistic update pattern: [Source: _bmad-output/planning-artifacts/architecture.md]
- Architecture — `clearEnvelopeId` flag: [Source: src/lib/types.ts — UpdateTransactionInput]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Radix UI Select `scrollIntoView` not a function in JSDOM: fixed by adding `window.HTMLElement.prototype.scrollIntoView = () => {}` polyfill to `src/setupTests.ts`
- `BorrowOverlay.test.tsx` shows 13 pre-existing failures (`useEnvelopeStore.setState is not a function`) — unrelated to Story 3.5, not introduced by these changes

### Completion Notes List

- Created `TransactionRow.tsx` extracted from `LedgerView.tsx` with full inline editing for payee, amount, date, and category fields
- Inline edit state is local to `TransactionRow` (not in Zustand store) per story spec
- `commitEdit('category', ...)` calls `useEnvelopeStore.getState().loadEnvelopes()` after success to refresh envelope traffic-light states (AC: 3)
- `clearEnvelopeId: true` used for "None" category per the `UpdateTransactionInput` spec (not `envelopeId: null`)
- Created `AddTransactionForm.tsx` with payee/amount/date/category fields; blank payee allowed; amount validated client-side
- "Add Transaction" button added to LedgerView sticky header (right-aligned, `variant="outline"`)
- AC: 4 satisfied automatically: balances are derived from store's `transactions` array which updates optimistically on `updateTransaction`
- 27 tests added/updated: 8 `AddTransactionForm.test.tsx`, 8 `TransactionRow.test.tsx`, 11 `LedgerView.test.tsx` (with matchedTransactions fix)
- All 27 story-3.5-related tests pass; no regressions introduced in the 196 other passing tests

### File List

- src/features/transactions/TransactionRow.tsx (NEW)
- src/features/transactions/TransactionRow.test.tsx (NEW)
- src/features/transactions/AddTransactionForm.tsx (NEW)
- src/features/transactions/AddTransactionForm.test.tsx (NEW)
- src/features/transactions/LedgerView.tsx (MODIFIED — add import, showAddForm state, Add Transaction button, AddTransactionForm render)
- src/features/transactions/LedgerView.test.tsx (MODIFIED — add matchedTransactions: [] to importResult mocks)
- src/setupTests.ts (MODIFIED — add scrollIntoView JSDOM polyfill)

### Change Log

- 2026-04-08: Story 3.5 implemented — TransactionRow extracted with inline editing, AddTransactionForm created, LedgerView updated with Add Transaction button. 27 tests added/updated, all passing.

### Review Findings

- [x] [Review][Patch] Escape+onBlur double-fire: pressing Escape cancels but blur then calls commitEdit with empty draftValue — saves empty payee or empty date string [src/features/transactions/TransactionRow.tsx] — fixed 2026-04-08
- [x] [Review][Patch] commitEdit clears edit state before NaN validation — invalid amount input is silently dropped with no user feedback [src/features/transactions/TransactionRow.tsx:47-48] — fixed 2026-04-08
- [x] [Review][Patch] Category Select has no outside-click/dismiss handler — clicking away from the dropdown without selecting leaves editingField stuck at 'category' indefinitely [src/features/transactions/TransactionRow.tsx] — fixed 2026-04-08
- [x] [Review][Defer] loadEnvelopes called on every category commit, including same-value re-selection — unnecessary backend round-trip [src/features/transactions/TransactionRow.tsx:63] — deferred
- [x] [Review][Defer] `today` in AddTransactionForm computed once at mount — default date goes stale if form stays open across midnight [src/features/transactions/AddTransactionForm.tsx:23] — deferred
- [x] [Review][Defer] updateTransaction errors in TransactionRow are silently swallowed — no user feedback on Tauri command failure during inline edits [src/features/transactions/TransactionRow.tsx] — deferred
- [x] [Review][Defer] Date input does not validate format before sending to backend — malformed date strings from data corruption would save empty/invalid dates silently [src/features/transactions/TransactionRow.tsx] — deferred
