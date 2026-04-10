# Story 7.4: Envelope Card & Actions Completeness

Status: done

## Story

As Tom,
I want each envelope card to display complete financial data and support a full edit flow,
So that I can see and manage my envelopes without ambiguity.

## Acceptance Criteria

1. **Given** an envelope card is rendered / **When** Tom looks at the card / **Then** three labelled values are shown: "Allocated" (the budgeted amount), "Spent" (transactions charged to this envelope this month), and "Remaining" (allocated minus spent); no amount appears without a label.

2. **Given** Tom clicks the ⋯ button on an envelope card / **When** the action menu opens / **Then** at minimum two options are present: "Edit" and "Delete"; clicking outside the menu dismisses it without action.

3. **Given** Tom clicks "Edit" from the ⋯ menu / **When** the edit form opens / **Then** all envelope fields are editable: name, type (Rolling/Bill/Goal), and priority (Need/Should/Want); the form pre-populates with current values; saving commits the update; cancelling discards changes.

4. **Given** the Budget screen has no envelopes / **When** the empty state renders / **Then** an empty-state message is shown (e.g. "No envelopes yet. Add one to start budgeting.") with the Add Envelope button; the screen is not a blank canvas.

5. **Given** the ⋯ button renders on an envelope card / **When** a screen reader encounters it / **Then** the `aria-label` accurately describes the action (e.g. "Envelope options" or "Envelope actions"), not "Envelope settings".

## Tasks / Subtasks

- [x] Wire actual spent amounts from `useTransactionStore` into `EnvelopeCard` (AC: #1)
  - [x] Add `useTransactionStore` import to `EnvelopeCard.tsx`
  - [x] Compute `spentCents` by filtering `transactions` where `envelopeId === envelope.id` and summing: `const spentCents = Math.max(0, -transactions.filter(t => t.envelopeId === envelope.id).reduce((sum, t) => sum + t.amountCents, 0))`
  - [x] Replace hardcoded `0` in `deriveEnvelopeState(envelope.allocatedCents, 0)` with computed `spentCents`
  - [x] Replace hardcoded `formatCurrency(0)` for Spent display with `formatCurrency(spentCents)`
  - [x] Replace hardcoded `formatCurrency(envelope.allocatedCents)` for Remaining with `formatCurrency(Math.max(0, envelope.allocatedCents - spentCents))`
  - [x] Replace hardcoded `0` in `progressPct` calculation with `spentCents`

- [x] Add Name field to Edit dialog in `EnvelopeCard.tsx` (AC: #3)
  - [x] Add `editName` state: `const [editName, setEditName] = useState(envelope.name)`
  - [x] Reset `editName` to `envelope.name` inside `handleEditOpen`
  - [x] Add `<Input>` for name inside edit dialog (before Type and Priority selects)
  - [x] Include `name: editName.trim()` in `updateEnvelope` call in `handleEditSave` (only if non-empty and different)
  - [x] Add a Name label and `data-testid="edit-envelope-name-input"` to the input

- [x] Verify AC2, AC4, AC5 — no code changes needed (AC: #2, #4, #5)
  - [x] Confirm ⋯ DropdownMenu opens with Edit and Delete options — ALREADY IMPLEMENTED
  - [x] Confirm empty state message in `EnvelopeList.tsx` — ALREADY IMPLEMENTED
  - [x] Confirm `aria-label="Envelope actions"` on ⋯ button — ALREADY FIXED

- [x] Update `EnvelopeCard.test.tsx` for spent wiring and edit dialog name field (AC: #1, #3)
  - [x] Add mock for `useTransactionStore` at top of test file
  - [x] Update existing "renders three labeled amounts" test to use non-zero spent from mocked transactions
  - [x] Add test: spent amount derives from transactions (envelope with matched transactions shows correct Spent)
  - [x] Add test: remaining = allocated − spent (not always equal to allocated)
  - [x] Add test: overspent state when spentCents > allocatedCents (previously dead code path)
  - [x] Add test: Edit dialog contains Name input pre-populated with envelope name
  - [x] Add test: Edit dialog Name input change is included in `updateEnvelope` call on save

### Review Findings

- [x] [Review][Patch] Hardcoded `#ff5555` on Remaining span — replaced with `STATE_COLORS.overspent` [src/features/envelopes/EnvelopeCard.tsx]
- [x] [Review][Patch] Name `<Input>` in edit dialog lacks `id`; `<label>` lacks `htmlFor` — added `id="edit-envelope-name"` and `htmlFor="edit-envelope-name"` [src/features/envelopes/EnvelopeCard.tsx]
- [x] [Review][Defer] Spaces-only name save is a silent no-op — user clears field to whitespace and saves; dialog closes with no feedback and name is unchanged; matches spec "only if non-empty" constraint [src/features/envelopes/EnvelopeCard.tsx] — deferred, spec-aligned
- [x] [Review][Defer] `handleEditSave` fires store update even when no fields changed — type/priority always sent unconditionally; pre-existing behavior [src/features/envelopes/EnvelopeCard.tsx] — deferred, pre-existing

## Dev Notes

### Current State — What's Already Done vs. What's Missing

**ACs 2, 4, 5 ARE ALREADY IMPLEMENTED:**
- AC2: `EnvelopeCard.tsx` already has `DropdownMenu` with Edit, "Set as Savings" (conditional), and Delete items. The AC requires Edit and Delete; the extra "Set as Savings" item is fine.
- AC4: `EnvelopeList.tsx` already shows "No envelopes yet. Add one to start budgeting." when `envelopes.length === 0 && !showAddForm`.
- AC5: `aria-label="Envelope actions"` already set on the ⋯ button (was previously "Envelope settings" — already fixed).

**AC1 — Labeled amounts: LABELS PRESENT, SPENT HARDCODED TO 0**

`src/features/envelopes/EnvelopeCard.tsx` lines 117 and 195–201:
```tsx
// BUG: spentCents hardcoded — both of these use 0
const state = deriveEnvelopeState(envelope.allocatedCents, 0);         // ← fix
const progressPct = envelope.allocatedCents > 0
  ? Math.min(100, (0 / envelope.allocatedCents) * 100)                 // ← fix
  : 0;
// ...
<span className="text-xs tabular-nums">
  {formatCurrency(0)}                                                  // ← Spent: fix
</span>
// ...
<span className="text-xs tabular-nums">
  {formatCurrency(envelope.allocatedCents)}                            // ← Remaining: fix
</span>
```

This is the known deferred issue from `deferred-work.md` line 155: "Borrow button `overspent` condition is dead code — `deriveEnvelopeState` receives `spentCents=0` always; revisit when EnvelopeCard is connected to transaction data."

**AC3 — Edit dialog: TYPE AND PRIORITY PRESENT, NAME MISSING**

`EnvelopeCard.tsx` lines 277–329 show the Edit dialog has only Type and Priority selects — no Name field. Name is editable via inline click-to-edit (separate mechanism) but the Edit dialog spec requires it as well.

The `updateEnvelope` action in `useEnvelopeStore` supports `name` in its `UpdateEnvelopeInput`, and the optimistic update at line 89 already handles it:
```ts
...(input.name !== undefined && { name: input.name }),
```
So no store changes are needed — just add the Name input to the dialog.

### How to Wire Spent Amounts

**Where transactions live:** `useTransactionStore.getState().transactions` holds all current-month transactions (loaded at app startup in `src/router.tsx:71` via `loadTransactions(currentMonth)`). Transactions have negative `amountCents` for debits (spending).

**Sign convention (consistent with Rust `get_closeout_summary`'s `SUM(-amount_cents)`):**
```tsx
import { useTransactionStore } from '@/stores/useTransactionStore';

// Inside EnvelopeCard component:
const transactions = useTransactionStore((s) => s.transactions);

const spentCents = Math.max(
  0,
  -transactions
    .filter((t) => t.envelopeId === envelope.id)
    .reduce((sum, t) => sum + t.amountCents, 0),
);

const remainingCents = envelope.allocatedCents - spentCents;
const state = deriveEnvelopeState(envelope.allocatedCents, spentCents);
const progressPct = envelope.allocatedCents > 0
  ? Math.min(100, (spentCents / envelope.allocatedCents) * 100)
  : 0;
```

**Display update:**
```tsx
// Spent row:
<span className="text-xs tabular-nums">{formatCurrency(spentCents)}</span>
// Remaining row (can go negative if overspent — that's correct and intentional):
<span className="text-xs tabular-nums"
  style={{ color: state === 'overspent' ? '#ff5555' : 'var(--color-text-secondary)' }}>
  {formatCurrency(remainingCents)}
</span>
```

Note: `remainingCents` can legitimately be negative when overspent — display in red (`#ff5555`) to match the architecture spec: "amount displayed in red" for overspent envelopes.

### How to Add Name Field to Edit Dialog

Add state and reset in `handleEditOpen`:
```tsx
const [editName, setEditName] = useState(envelope.name);

const handleEditOpen = () => {
  setEnvelopeType(envelope.type);
  setEditPriority(envelope.priority);
  setEditName(envelope.name);      // ← add this
  setIsEditOpen(true);
};
```

Add to `handleEditSave`:
```tsx
const handleEditSave = async () => {
  await useEnvelopeStore.getState().updateEnvelope({
    id: envelope.id,
    envelopeType,
    priority: editPriority,
    ...(editName.trim() && editName.trim() !== envelope.name && { name: editName.trim() }),
  });
  if (!useEnvelopeStore.getState().error) {
    setIsEditOpen(false);
  }
};
```

Add input to dialog (before the Type select):
```tsx
<div className="flex flex-col gap-1.5">
  <label className="type-label" style={{ color: 'var(--color-text-muted)' }}>
    Name
  </label>
  <Input
    value={editName}
    onChange={(e) => setEditName(e.target.value)}
    data-testid="edit-envelope-name-input"
  />
</div>
```

### Test Updates in `EnvelopeCard.test.tsx`

**Add `useTransactionStore` mock** (at top of file, alongside existing store mocks):
```tsx
vi.mock('@/stores/useTransactionStore', () => {
  const store = { transactions: [] };
  const useTransactionStore = vi.fn((selector: (s: typeof store) => unknown) => selector(store));
  return { useTransactionStore };
});

import { useTransactionStore } from '@/stores/useTransactionStore';

// Helper to mock transactions
function mockTransactions(transactions: Partial<Transaction>[] = []) {
  vi.mocked(useTransactionStore).mockImplementation(
    (selector: (s: { transactions: Transaction[] }) => unknown) =>
      selector({ transactions: transactions as Transaction[] }),
  );
}
```

**Add to `beforeEach`:** `mockTransactions([]);` (reset to empty between tests)

**Update existing "three labeled amounts" test** (currently asserts `$0.00` for Spent — keep that assertion since mocked transactions are empty):
The test at line 90–101 should still pass after change because `spentCents=0` when transactions=[].

**New tests to add:**
```tsx
it('Spent amount derives from matched transactions', () => {
  mockTransactions([
    { id: 10, envelopeId: 1, amountCents: -3000, isCleared: false },
    { id: 11, envelopeId: 2, amountCents: -5000, isCleared: false }, // different envelope
  ]);
  const envelope = makeEnvelope({ id: 1, allocatedCents: 10000 });
  renderCard(envelope);

  expect(screen.getByText('Spent')).toBeInTheDocument();
  expect(screen.getByText('$30.00')).toBeInTheDocument(); // spentCents = 3000
});

it('Remaining = allocated − spent', () => {
  mockTransactions([
    { id: 10, envelopeId: 1, amountCents: -4000, isCleared: false },
  ]);
  const envelope = makeEnvelope({ id: 1, allocatedCents: 10000 });
  renderCard(envelope);

  // $100.00 allocated, $40.00 spent, $60.00 remaining
  expect(screen.getAllByText('$100.00').length).toBe(1);  // Allocated
  expect(screen.getByText('$40.00')).toBeInTheDocument(); // Spent
  expect(screen.getByText('$60.00')).toBeInTheDocument(); // Remaining
});

it('overspent state when spentCents > allocatedCents', () => {
  mockTransactions([
    { id: 10, envelopeId: 1, amountCents: -8000, isCleared: false },
  ]);
  const envelope = makeEnvelope({ id: 1, allocatedCents: 5000 });
  const { container } = renderCard(envelope);

  const card = container.firstChild as HTMLElement;
  expect(card.style.borderLeft).toBe(`4px solid ${STATE_COLORS.overspent}`);
  expect(screen.getByText('Over budget')).toBeInTheDocument();
});

it('Edit dialog contains Name input pre-populated with envelope name', async () => {
  const user = userEvent.setup();
  const envelope = makeEnvelope({ name: 'Groceries' });
  renderCard(envelope);

  await user.click(screen.getByRole('button', { name: 'Envelope actions' }));
  await user.click(await screen.findByText('Edit'));
  await screen.findByRole('dialog');

  const nameInput = screen.getByTestId('edit-envelope-name-input') as HTMLInputElement;
  expect(nameInput.value).toBe('Groceries');
});

it('Edit save includes updated name in updateEnvelope payload', async () => {
  const user = userEvent.setup();
  const envelope = makeEnvelope({ name: 'Groceries' });
  renderCard(envelope);

  await user.click(screen.getByRole('button', { name: 'Envelope actions' }));
  await user.click(await screen.findByText('Edit'));
  await screen.findByRole('dialog');

  const nameInput = screen.getByTestId('edit-envelope-name-input');
  await user.clear(nameInput);
  await user.type(nameInput, 'Supermarket');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => {
    expect(useEnvelopeStore.getState().updateEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, name: 'Supermarket' }),
    );
  });
});
```

**Note on `STATE_COLORS.overspent`:** Verify this key exists in `src/lib/envelopeState.ts`. The `EnvelopeDisplayState` type is `'funded' | 'caution' | 'overspent'`, so `STATE_COLORS['overspent']` should exist. Also verify `STATE_LABELS['overspent']` returns `'Over budget'`.

### Architecture Patterns

- **Component → Store, never skip:** `EnvelopeCard` reads from two stores already (`useEnvelopeStore`, `useSettingsStore`); adding `useTransactionStore` as a third is consistent.
- **Selector pattern:** Use `useTransactionStore((s) => s.transactions)` (selector form), not `useTransactionStore()`, to avoid re-rendering on unrelated store changes.
- **No new Tauri commands needed:** Spent amounts are derived in JS from the already-loaded transaction store.
- **Optimistic updates not needed for spent display:** Transactions are loaded at router level; `EnvelopeCard` is read-only for this derived value.
- **`deriveEnvelopeState` signature:** `(allocatedCents: number, spentCents: number = 0): EnvelopeDisplayState` — second arg already exists but was never passed. Wire it now.

### File Structure

Two files change:
```
src/features/envelopes/
  EnvelopeCard.tsx          ← add useTransactionStore import + spent wiring + Name in edit dialog
  EnvelopeCard.test.tsx     ← add useTransactionStore mock + new tests
```

No store changes, no Rust changes, no new component files.

### Key Constraints

- **No `allocatedCents` sign issues:** `allocatedCents` is always ≥ 0 from the DB. The `deriveEnvelopeState` function already handles the `allocatedCents=0` case (returns `'caution'`).
- **`remainingCents` can be negative:** When overspent, remaining = allocated − spent < 0. This is intentional — display as-is in red.
- **`formatCurrency` with negative cents:** Already handles negative values (e.g., `-$20.00`). No special casing needed.
- **Transactions from other months:** `router.tsx:71` loads `loadTransactions(currentMonth)` at app boot, so `useTransactionStore.transactions` is always current-month scope. No date filtering needed in `EnvelopeCard`.
- **Edit dialog Name: only send if different:** `handleEditSave` should only include `name` in the payload if it changed — this avoids a no-op name update on type/priority-only edits. Use the spread pattern shown above.
- **Inline name edit still works:** The existing inline click-to-edit pattern (lines 65–91 in `EnvelopeCard.tsx`) is separate from the dialog edit and should remain untouched.

### Previous Story Learnings (Story 7.3)

- "Verify existing implementation first, then add missing tests/code" — same pattern applies here. Verify ACs 2, 4, 5 first, then implement the two real changes (spent wiring + Name field).
- `toBeDisabled()` and `toBeInTheDocument()` from `@testing-library/jest-dom` are available — no new test utils needed.
- `fireEvent.change` works for plain `<Input>` components; `userEvent.type` works for both `<Input>` and clears via `userEvent.clear`.
- `BorrowOverlay.test.tsx` failures are pre-existing and unrelated — do not investigate them if they appear.

### References

- [EnvelopeCard.tsx:44-332](src/features/envelopes/EnvelopeCard.tsx) — full component (spent hardcoded at line 117, 120, 195, 199)
- [EnvelopeCard.test.tsx:1-326](src/features/envelopes/EnvelopeCard.test.tsx) — existing test file and mock patterns
- [EnvelopeList.tsx:21-28](src/features/envelopes/EnvelopeList.tsx) — empty state (already implemented)
- [useTransactionStore.ts:8-25](src/stores/useTransactionStore.ts) — `transactions: Transaction[]` in state
- [useEnvelopeStore.ts:76-112](src/stores/useEnvelopeStore.ts) — `updateEnvelope` supports `name` field
- [lib/types.ts:109-117](src/lib/types.ts) — `Transaction` type with `envelopeId` and `amountCents`
- [lib/envelopeState.ts:1-12](src/lib/envelopeState.ts) — `deriveEnvelopeState(allocatedCents, spentCents?)`
- [router.tsx:71](src/router.tsx) — `loadTransactions(currentMonth)` confirms current-month scope
- [deferred-work.md:155](_bmad-output/implementation-artifacts/deferred-work.md) — "revisit when EnvelopeCard is connected to transaction data" (this is that story)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No blocking issues encountered. BorrowOverlay.test.tsx failures (13 tests) are pre-existing and unrelated to this story.

### Completion Notes List

- Wired `useTransactionStore` selector into `EnvelopeCard` to compute real `spentCents` from current-month transactions. Replaced all three hardcoded `0` usages (state derivation, progress bar, Spent display) and fixed Remaining to use `remainingCents = allocatedCents - spentCents`. Remaining renders in red (#ff5555) when overspent.
- Added `editName` state to Edit dialog with reset on open, Name `<Input>` field (before Type/Priority), and conditional name inclusion in `updateEnvelope` payload (only when changed and non-empty).
- Confirmed ACs 2, 4, 5 already implemented: DropdownMenu with Edit+Delete, empty state message, aria-label="Envelope actions".
- Added 7 new tests: useTransactionStore mock + mockTransactions helper, spent derivation, remaining calculation, overspent state activation, Edit dialog Name pre-population, Edit save name payload.
- All 26 EnvelopeCard tests pass. 454/467 suite tests pass (13 pre-existing BorrowOverlay failures unrelated).

### File List

- src/features/envelopes/EnvelopeCard.tsx
- src/features/envelopes/EnvelopeCard.test.tsx

### Change Log

- 2026-04-09: Story 7.4 implemented — wired spent amounts from transaction store into EnvelopeCard; added Name field to Edit dialog; 7 new tests added; all ACs satisfied.
