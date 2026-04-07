# Story 2.2: Create and Manage Envelopes

Status: done

## Story

As Tom,
I want to create budget categories with a type (Rolling, Bill, or Goal) and a priority (Need, Should, or Want),
So that my budget structure reflects how I actually think about my spending.

## Acceptance Criteria

1. **Given** Tom is on the Budget screen (`/`)
   **When** he clicks "Add Envelope"
   **Then** an inline creation form appears (no modal) with fields: name input, type selector (Rolling/Bill/Goal), priority selector (Need/Should/Want); a Secondary "Save" button and Ghost "Cancel" button are shown

2. **Given** Tom fills in a valid name, type, and priority and clicks "Save"
   **When** the `create_envelope` command succeeds
   **Then** the new envelope appears in the envelope list immediately; the creation form closes; no page refresh required (FR12, FR13)

3. **Given** Tom clicks directly on an envelope name in the card
   **When** the click occurs
   **Then** the name field enters inline edit mode; pressing Enter or blurring the field confirms the edit and calls `update_envelope`; pressing Escape cancels without saving (UX-DR19)

4. **Given** Tom clicks the settings icon (⋯ / gear) on an envelope card
   **When** the delete action is selected
   **Then** a Destructive confirmation dialog appears with title "Delete [envelope name]", body explaining the consequence, and buttons: Ghost "Cancel" (left) + Destructive "Delete" (right)

5. **Given** Tom confirms deletion in the dialog
   **When** `delete_envelope` succeeds
   **Then** the envelope is removed from the list immediately; the dialog closes; no manual refresh required

6. **Given** Tom cancels the delete dialog
   **When** cancellation occurs
   **Then** no data changes; the envelope remains in the list

7. **Given** the Budget screen loads
   **When** it renders
   **Then** all envelopes hydrated by `useEnvelopeStore` are displayed; each card shows: name, type badge, priority badge, and formatted allocation amount (via `formatCurrency`)

## Tasks / Subtasks

- [x] Task 1: Add `delete_envelope` Rust command to `src-tauri/src/commands/mod.rs`
  - [x] Add `#[tauri::command] pub fn delete_envelope(state: State<DbState>, id: i64) -> Result<(), AppError>` using an `unchecked_transaction()` DELETE
  - [x] Return `ENVELOPE_NOT_FOUND` AppError (matching pattern from `update_envelope`) if `changes() == 0`
  - [x] Add Cargo test: delete existing envelope returns `Ok(())`; delete non-existent id returns `ENVELOPE_NOT_FOUND`

- [x] Task 2: Register `delete_envelope` in `src-tauri/src/lib.rs`
  - [x] Add `commands::delete_envelope` to the `invoke_handler![]` list alongside the three existing envelope commands

- [x] Task 3: Create `formatCurrency` utility at `src/lib/currency.ts`
  - [x] Implement `export function formatCurrency(cents: number): string` — converts integer cents to `$X.XX` format using `Intl.NumberFormat` with `currency: 'USD'`, `style: 'currency'`
  - [x] Add `src/lib/currency.test.ts` with: `formatCurrency(0)` → `'$0.00'`, `formatCurrency(100)` → `'$1.00'`, `formatCurrency(12345)` → `'$123.45'`, `formatCurrency(-500)` → `'-$5.00'`

- [x] Task 4: Add `deleteEnvelope` action to `src/stores/useEnvelopeStore.ts`
  - [x] Add `deleteEnvelope: (id: number) => Promise<void>` to the `EnvelopeState` interface
  - [x] Implement: optimistic remove (filter out by id), call `invoke<void>('delete_envelope', { id })`, on failure restore the pre-remove list and set `error`
  - [x] Always clear `isWriting` on success and failure (same pattern as `createEnvelope` / `updateEnvelope`)
  - [x] Add tests to `src/stores/useEnvelopeStore.test.ts`: delete success removes envelope; delete failure restores list and sets error

- [x] Task 5: Create `src/lib/currency.ts` (already listed above in Task 3 — see that task)

- [x] Task 6: Create `src/features/envelopes/EnvelopeCard.tsx`
  - [x] Props: `envelope: Envelope` — reads from this prop, calls store for mutations
  - [x] Display: name (inline-editable), type badge, priority badge, `formatCurrency(envelope.allocatedCents)` (read-only in this story — allocation input comes in Story 2.4)
  - [x] Inline name edit: clicking the name replaces it with an `<Input>` (same value); `onBlur` → call `updateEnvelope({ id, name })`; `onKeyDown`: Enter → blur to confirm, Escape → restore original and exit edit mode without calling store
  - [x] Settings affordance: a small Ghost icon button (⋯ using `lucide-react` `MoreHorizontal`) in the card header that, when clicked, sets `deleteTargetId = envelope.id`
  - [x] Delete confirmation: when `deleteTargetId === envelope.id`, render the `Dialog` with Destructive confirmation (see Dev Notes: Delete Dialog)
  - [x] `aria-label` on the card: `"${envelope.name} envelope, ${envelope.type}, ${envelope.priority}"`

- [x] Task 7: Create `src/features/envelopes/EnvelopeCard.test.tsx`
  - [x] Test: renders name, type, priority, and formatted amount
  - [x] Test: clicking name activates edit mode (Input appears)
  - [x] Test: pressing Escape in edit mode restores original name without calling store
  - [x] Test: pressing Enter calls `updateEnvelope` with new name
  - [x] Test: blur on name input calls `updateEnvelope`
  - [x] Test: clicking ⋯ button opens delete confirmation dialog
  - [x] Test: clicking Ghost "Cancel" in dialog closes without calling `deleteEnvelope`
  - [x] Test: clicking Destructive "Delete" calls `deleteEnvelope(envelope.id)`

- [x] Task 8: Create `src/features/envelopes/EnvelopeList.tsx`
  - [x] Reads `envelopes` from `useEnvelopeStore`
  - [x] Renders a scrollable list of `EnvelopeCard` components
  - [x] "Add Envelope" button (Secondary / `variant="outline"`) at the bottom of the list
  - [x] Clicking "Add Envelope" shows the inline `AddEnvelopeForm` (see next task) below the last card
  - [x] While `isWriting` is true, disable the "Add Envelope" button
  - [x] Show inline error message below list if `error` is set (matches pattern from `SettingsPage`)

- [x] Task 9: Create `src/features/envelopes/AddEnvelopeForm.tsx`
  - [x] Inline form (no modal): name `<Input>`, type `<Select>` (Rolling/Bill/Goal), priority `<Select>` (Need/Should/Want)
  - [x] Secondary "Save" button (`variant="outline"`) — disabled while `isWriting` or if name is empty
  - [x] Ghost "Cancel" button (`variant="ghost"`) — calls `onCancel` prop
  - [x] On Save: call `useEnvelopeStore.getState().createEnvelope(...)`, on success call `onSuccess` prop
  - [x] Props: `onSuccess: () => void`, `onCancel: () => void`
  - [x] Default values: `envelopeType = 'Rolling'`, `priority = 'Need'`

- [x] Task 10: Create `src/features/envelopes/BudgetPage.tsx`
  - [x] Main budget view for route `/`
  - [x] Layout: full-height main area with `EnvelopeList` filling the content area
  - [x] Wealth panel area is a placeholder div with `data-testid="wealth-panel-placeholder"` (implemented in Epic 5)
  - [x] Import and render `EnvelopeList`

- [x] Task 11: Wire `BudgetPage` into `src/router.tsx`
  - [x] Import `BudgetPage` from `@/features/envelopes/BudgetPage`
  - [x] Replace `component: () => <Outlet />` on the `budgetRoute` with `component: BudgetPage`
  - [x] Remove the comment "replaced with BudgetPage in Story 2.2" from the route definition

## Dev Notes

---

### CRITICAL: delete_envelope Is a Net-New Command

Story 2.1 only implemented `get_envelopes`, `create_envelope`, and `update_envelope`. `delete_envelope` was intentionally deferred to this story because it requires a UI confirmation dialog.

**Pattern to follow for `delete_envelope` in `commands/mod.rs`:**

```rust
#[tauri::command]
pub fn delete_envelope(state: State<DbState>, id: i64) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;

    let tx = conn.unchecked_transaction()?;

    tx.execute("DELETE FROM envelopes WHERE id = ?1", rusqlite::params![id])?;

    if tx.changes() == 0 {
        return Err(AppError {
            code: "ENVELOPE_NOT_FOUND".to_string(),
            message: format!("No envelope found with id {}", id),
        });
    }

    tx.commit()?;
    Ok(())
}
```

Add to `invoke_handler![]` in `src-tauri/src/lib.rs`:
```rust
commands::delete_envelope,   // NEW
```

Also add to the inner-function pattern used by 2.1's Cargo tests (a `delete_envelope_inner(&Connection, i64) -> Result<(), AppError>` helper) if you want unit-testable Cargo tests. The 2.1 implementation used `*_inner` helpers — follow that pattern.

---

### File Location Reality (Inherited from Story 2.1)

Story 2.1 established these actual locations — do NOT deviate:

| What | Architecture Spec Says | Actual Location (use this) |
|------|------------------------|----------------------------|
| Rust commands | `src-tauri/src/commands/envelopes.rs` | `src-tauri/src/commands/mod.rs` (single file) |
| TypeScript types | `src/types/envelope.ts` | `src/lib/types.ts` |
| Zustand store | `src/features/envelopes/useEnvelopeStore.ts` | `src/stores/useEnvelopeStore.ts` |

New files for this story belong in:
- `src/features/envelopes/` — all new React components (`EnvelopeCard.tsx`, `EnvelopeList.tsx`, `AddEnvelopeForm.tsx`, `BudgetPage.tsx`)
- `src/lib/currency.ts` — the `formatCurrency` utility
- Tests co-located alongside source (e.g., `EnvelopeCard.test.tsx` next to `EnvelopeCard.tsx`)

---

### formatCurrency Utility

No `formatCurrency` function exists yet. Create it at `src/lib/currency.ts`:

```typescript
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
```

**Rule:** `formatCurrency` is the ONLY place cents are converted to a display string. Never do `(cents / 100).toFixed(2)` in a component. Import from `@/lib/currency`.

---

### EnvelopeCard: Inline Name Editing

The name is directly clickable — no "Edit" button. Pattern:

```tsx
const [isEditing, setIsEditing] = useState(false);
const [editValue, setEditValue] = useState(envelope.name);

// On click: enter edit mode
const handleNameClick = () => {
  setEditValue(envelope.name);
  setIsEditing(true);
};

// On blur: commit if value changed and non-empty
const handleNameBlur = () => {
  if (editValue.trim() && editValue.trim() !== envelope.name) {
    useEnvelopeStore.getState().updateEnvelope({ id: envelope.id, name: editValue.trim() });
  }
  setIsEditing(false);
};

// On keydown: Enter blurs (which triggers commit); Escape restores without commit
const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') {
    e.currentTarget.blur();
  } else if (e.key === 'Escape') {
    setEditValue(envelope.name);   // restore
    setIsEditing(false);           // exit without calling blur handler
    e.preventDefault();
  }
};
```

**Important:** Use a ref to call `input.focus()` when `isEditing` becomes true (via `useEffect`). The input must auto-focus when edit mode activates.

---

### Delete Confirmation Dialog

Use the existing `Dialog` primitive from `src/components/ui/dialog.tsx`. The delete confirmation lives inside `EnvelopeCard` (controlled by local state `isDeleteOpen`):

```tsx
// Button layout per UX spec: Cancel (Ghost) on left, Delete (Destructive) on right
<Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete {envelope.name}</DialogTitle>
      <DialogDescription>
        This envelope and its allocation will be removed. This cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>
        Cancel
      </Button>
      <Button
        variant="destructive"
        onClick={handleDelete}
        disabled={isWriting}
      >
        Delete
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**UX rule (from spec):** Cancel is always on the left, destructive confirm on the right. The existing `DialogFooter` renders `flex-row justify-end` on sm+ screens — to get Cancel on left, it must come first in DOM order.

The `DialogFooter` default styles use `sm:flex-row sm:justify-end sm:space-x-2`. Adjust the footer class to `flex flex-row gap-2 justify-end` for Desktop-only layout (this app targets desktop only).

---

### Scope Boundaries — What This Story Does NOT Do

- **No traffic-light state colors** — `EnvelopeCard` has no color bar, no green/amber/red; the state bar comes in Story 2.3
- **No allocation input** — `allocated_cents` is displayed read-only via `formatCurrency(envelope.allocatedCents)` (will show `$0.00` for new envelopes); the editable allocation input comes in Story 2.4
- **No borrow flow** — Story 2.5
- **No wealth panel** — render a placeholder `<div data-testid="wealth-panel-placeholder" />` in BudgetPage; Epic 5 fills it
- **No new routes** — `BudgetPage` wires to the existing `/` route stub in `router.tsx`
- **No `month_id` filtering** — display all envelopes from the store (no month scope yet; month scoping arrives in Epic 6)

---

### Store: useEnvelopeStore — Adding deleteEnvelope

The store is at `src/stores/useEnvelopeStore.ts`. Append to the existing interface and implementation:

```typescript
// In EnvelopeState interface:
deleteEnvelope: (id: number) => Promise<void>;

// Implementation:
deleteEnvelope: async (id) => {
  const prev = get().envelopes;
  set({ envelopes: prev.filter((e) => e.id !== id), isWriting: true, error: null });
  try {
    await invoke<void>('delete_envelope', { id });
    set({ isWriting: false });
  } catch (err) {
    set({ envelopes: prev, isWriting: false, error: err as AppError });
  }
},
```

**Note:** The existing `isWriting` flag is shared across all operations. The UI must disable write controls (Add Envelope button, Save button, Delete button) while `isWriting` is true.

---

### Button Variants Cheat Sheet

| Use case | Variant |
|----------|---------|
| "Save" in inline form | `variant="outline"` (Secondary — lime border/text) |
| "Add Envelope" | `variant="outline"` (Secondary) |
| "Cancel" in form/dialog | `variant="ghost"` |
| "Delete" in confirmation | `variant="destructive"` (red outline) |

**Never use default (lime bg) buttons** for envelope CRUD — that's reserved for Primary actions like saving global settings.

---

### Design Tokens for EnvelopeCard

Use CSS variables, not hardcoded hex values:
- Card background: `var(--color-bg-surface)` (`#1C1E21`)
- App background: `var(--color-bg-app)` (`#111214`)
- Text primary: `var(--color-text-primary)` (`#EEEEF0`)
- Text secondary: `var(--color-text-secondary)` (`#888A90`)
- Border: `var(--color-border)` (`#26282C`)
- Accent / interactive: `var(--color-interactive)` (`#C0F500`)

Type and priority badges are plain neutral (`var(--color-bg-surface)` + `var(--color-border)`) in this story. Colors are added in Story 2.3.

---

### BudgetPage Layout

The UX spec targets a two-panel layout (wealth panel top ~220px + envelope list fills remaining). For Story 2.2, the wealth panel is a placeholder:

```tsx
export default function BudgetPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Wealth panel — placeholder until Epic 5 */}
      <div
        data-testid="wealth-panel-placeholder"
        className="shrink-0 h-[56px] border-b"
        style={{ borderColor: 'var(--color-border)' }}
      />
      {/* Envelope list — fills remaining height */}
      <div className="flex-1 overflow-y-auto">
        <EnvelopeList />
      </div>
    </div>
  );
}
```

The placeholder height is minimal (56px) — just enough to hold space so the layout isn't jarring when the wealth panel arrives in Epic 5.

---

### Available UI Components

All existing in `src/components/ui/`:
- `Button` — use with `variant` and `size` props
- `Input` — use for name field (inline edit + creation form)
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` — for type and priority dropdowns
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` — for delete confirmation
- `Badge` — for type and priority display on EnvelopeCard
- `Separator` — optional dividers between cards

Icons from `lucide-react` (already installed): `MoreHorizontal` for the settings affordance.

---

### Testing

**Vitest + RTL tests (co-located):**

`src/features/envelopes/EnvelopeCard.test.tsx`:
- Mock `useEnvelopeStore` — return a test envelope, mock `updateEnvelope` and `deleteEnvelope`
- Test: card renders `envelope.name`, type, priority, `formatCurrency(envelope.allocatedCents)`
- Test: clicking name → Input appears with current value
- Test: Escape in edit input → name text restored, Input gone, `updateEnvelope` NOT called
- Test: Enter in edit input → `updateEnvelope` called with trimmed name
- Test: blur on edit input → `updateEnvelope` called
- Test: clicking ⋯ → dialog opens (DialogTitle contains envelope name)
- Test: Ghost Cancel in dialog → `deleteEnvelope` NOT called, dialog closes
- Test: Destructive Delete in dialog → `deleteEnvelope(envelope.id)` called

`src/lib/currency.test.ts`:
- `formatCurrency(0)` → `'$0.00'`
- `formatCurrency(100)` → `'$1.00'`
- `formatCurrency(12345)` → `'$123.45'`

`src/stores/useEnvelopeStore.test.ts` — add to existing test file:
- `deleteEnvelope` removes envelope on success
- `deleteEnvelope` restores list and sets error on failure

**Cargo tests in `src-tauri/src/commands/mod.rs`** (in existing `envelope_tests` module):
- `test_delete_envelope_ok`: create then delete returns `Ok(())`
- `test_delete_envelope_not_found`: delete non-existent id returns `ENVELOPE_NOT_FOUND` error

---

### Previous Story Intelligence (Story 2.1)

Story 2.1 (Envelope Schema + Data Model) is **complete and in review** as of 2026-04-06. Key established patterns:

1. **Inner helper pattern in Rust:** `create_envelope_inner(&Connection, ...) -> Result<...>` functions exist alongside the Tauri command wrappers, enabling unit testing without Tauri State. Follow this for `delete_envelope_inner`.

2. **Optimistic update + rollback pattern** is established in `useEnvelopeStore`. Follow the exact same structure for `deleteEnvelope`.

3. **Migration version:** The DB is at migration version 3. This story adds NO new migrations.

4. **`stores.test.ts`** tests all six stores for `isWriting: false` initial state. Verify it still passes after adding `deleteEnvelope` to the interface.

5. **`isWriting` race guard:** Only one write at a time. Disable UI write controls while `isWriting === true`.

6. **Architecture spec vs reality gap** (documented in 2.1): The architecture spec shows `src/features/envelopes/useEnvelopeStore.ts` — the actual location is `src/stores/useEnvelopeStore.ts`. Components IMPORT from `@/stores/useEnvelopeStore`.

---

### Architecture Compliance

- **No new Tauri routes or HTTP** — Tauri commands only
- **Store-first IPC** — components never call `invoke()` directly; they call `useEnvelopeStore` actions
- **formatCurrency at UI boundary only** — never store or compute display-formatted strings; always use raw `allocatedCents` in logic
- **Test co-location** — `EnvelopeCard.test.tsx` lives next to `EnvelopeCard.tsx` in `src/features/envelopes/`
- **`isWriting` always clears** — success and failure paths must both clear `isWriting`
- **Errors inline** — `useEnvelopeStore.error` is surfaced as inline text below the list; no error modals

---

### Project Structure Notes

**New files for this story:**
```
src/
  lib/
    currency.ts                   ← formatCurrency utility (new)
    currency.test.ts              ← unit tests (new)
  features/
    envelopes/
      BudgetPage.tsx              ← main budget view (new)
      EnvelopeList.tsx            ← scrollable list + Add Envelope (new)
      AddEnvelopeForm.tsx         ← inline creation form (new)
      EnvelopeCard.tsx            ← single envelope card (new)
      EnvelopeCard.test.tsx       ← RTL tests (new)
  stores/
    useEnvelopeStore.ts           ← add deleteEnvelope action (modified)
    useEnvelopeStore.test.ts      ← add deleteEnvelope tests (modified)
src-tauri/
  src/
    commands/mod.rs               ← add delete_envelope command + tests (modified)
    lib.rs                        ← register delete_envelope (modified)
```

**No changes expected:**
- `src/lib/types.ts` — all envelope types exist; no new types needed for delete
- `src/router.tsx` — only the `component:` field of `budgetRoute` changes
- All other stores, Epic 1 components — untouched
- `src-tauri/migrations/` — no new migration

### References

- Epics file: `_bmad-output/planning-artifacts/epics.md` — Story 2.2 section (lines 503–527)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — file tree (lines 631–639), naming conventions (lines 361–366), test co-location (lines 381–388)
- UX spec: `_bmad-output/planning-artifacts/ux-design-specification.md` — button variants (lines 683–700), inline editing (lines 745–748), delete confirmation (lines 770–779)
- Previous story: `_bmad-output/implementation-artifacts/2-1-envelope-schema-data-model.md`
- Button component: `src/components/ui/button.tsx` — variant definitions
- Dialog component: `src/components/ui/dialog.tsx`
- Design tokens: `src/styles.css` and `src/lib/design-tokens.ts`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `delete_envelope_inner` following the established `*_inner` pattern for Cargo unit testability; Tauri command wrapper added alongside the three existing envelope commands.
- `formatCurrency` utility created at `src/lib/currency.ts` using `Intl.NumberFormat`; all four test cases pass including negative values.
- `deleteEnvelope` added to `useEnvelopeStore` with optimistic remove + rollback on failure; `isWriting` cleared in both success and failure paths.
- `EnvelopeCard` implements inline name editing via click-to-edit with Enter/Escape/blur handling and auto-focus via `useEffect`+ref. Delete confirmation dialog uses `Dialog` primitive with Cancel (Ghost) left, Delete (Destructive) right per UX spec.
- `EnvelopeList`, `AddEnvelopeForm`, and `BudgetPage` created; `BudgetPage` wired to `/` route, replacing the `<Outlet />` stub. `Outlet` import removed from router as no longer needed.
- All 83 Vitest tests and 11 Cargo tests pass. No new ESLint errors in modified/created files.

### Change Log

- 2026-04-06: Story 2.2 implemented — delete_envelope Rust command, formatCurrency utility, deleteEnvelope store action, EnvelopeCard/EnvelopeList/AddEnvelopeForm/BudgetPage components, BudgetPage wired to / route.

### File List

**New files:**
- `src/lib/currency.ts`
- `src/lib/currency.test.ts`
- `src/features/envelopes/EnvelopeCard.tsx`
- `src/features/envelopes/EnvelopeCard.test.tsx`
- `src/features/envelopes/EnvelopeList.tsx`
- `src/features/envelopes/AddEnvelopeForm.tsx`
- `src/features/envelopes/BudgetPage.tsx`

**Modified files:**
- `src-tauri/src/commands/mod.rs` — added `delete_envelope_inner`, `delete_envelope` command, two Cargo tests
- `src-tauri/src/lib.rs` — registered `commands::delete_envelope` in `invoke_handler![]`
- `src/stores/useEnvelopeStore.ts` — added `deleteEnvelope` to interface and implementation
- `src/stores/useEnvelopeStore.test.ts` — added `deleteEnvelope` success and failure tests
- `src/router.tsx` — replaced `<Outlet />` stub with `BudgetPage`, removed unused `Outlet` import

### Review Findings

- [x] [Review][Patch] AC2 — `AddEnvelopeForm` calls `onSuccess()` unconditionally; form closes even when `createEnvelope` fails and store rolls back [src/features/envelopes/AddEnvelopeForm.tsx:28-33]
- [x] [Review][Patch] AC3 — Escape key race: input unmount triggers `onBlur` with stale dirty `editValue`, can call `updateEnvelope` with cancelled value [src/features/envelopes/EnvelopeCard.tsx:48-57]
- [x] [Review][Patch] `handleDelete` closes dialog unconditionally on backend failure, hiding the error from the user [src/features/envelopes/EnvelopeCard.tsx:60-63]
- [x] [Review][Patch] Optimistic tempId uses `-Date.now()` — collides if `createEnvelope` called twice within the same millisecond [src/stores/useEnvelopeStore.ts:~33]
- [x] [Review][Patch] `src-tauri/migrations/003_envelopes.sql` is untracked — Story 2.1 migration not committed; will be absent at deploy time
- [x] [Review][Defer] FK constraint errors on `DELETE` will surface as generic rusqlite errors once Epic 6 enables FK enforcement — deferred, pre-existing
- [x] [Review][Defer] All-`None` `UpdateEnvelopeInput` performs a no-op UPDATE that succeeds silently, returning the unchanged envelope — deferred, pre-existing
- [x] [Review][Defer] Concurrent optimistic rollback (`prev` snapshot) can overwrite an interleaved successful write — deferred, pre-existing (from Story 2.1)
- [x] [Review][Defer] `month_id` cannot be cleared to `NULL` via COALESCE update — deferred, pre-existing (from Story 2.1)
- [x] [Review][Defer] `aria-label="Envelope settings"` on ⋯ button is misleading (button only opens delete dialog) — deferred, minor UX debt
- [x] [Review][Defer] `formatCurrency` silently renders `NaN`/`Infinity` for corrupt `allocatedCents` input — deferred, low-priority edge case
- [x] [Review][Defer] `isWriting: true` set in `loadEnvelopes` (read op) disables Add Envelope button during initial load — deferred, pre-existing (from Story 2.1)
- [x] [Review][Defer] `loadEnvelopes` in root `beforeLoad` re-fetches on every route navigation — deferred, pre-existing (from Story 2.1)
