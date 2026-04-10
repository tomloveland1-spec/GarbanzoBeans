# Story 7.2: Read-Only Mode Enforcement

Status: ready-for-dev

## Story

As Tom,
I want the UI to fully enforce read-only mode when a second instance has the lock,
So that I cannot accidentally mutate data from the secondary window.

## Acceptance Criteria

1. **Given** the app is running in read-only mode (`isReadOnly = true`) / **When** the Budget screen renders / **Then** the Add Envelope button is disabled and non-interactive; the ⋯ action button on every envelope card is hidden or disabled; no mutation can be triggered from this instance.

2. **Given** the app is running in read-only mode / **When** the Ledger screen renders / **Then** the Add Transaction button and OFX import button are disabled and non-interactive.

3. **Given** the app is running in read-only mode / **When** any write action is attempted programmatically / **Then** the store guard or UI guard prevents the call from reaching the Tauri backend; the read-only banner remains visible.

## Tasks / Subtasks

- [ ] Verify AC1 — Budget screen already enforced (AC: #1)
  - [ ] Confirm `EnvelopeList.tsx` Add Envelope button is `disabled={isReadOnly}` — already present, no change needed
  - [ ] Confirm `EnvelopeCard.tsx` ⋯ button is `disabled={isReadOnly}` — already present, no change needed
  - [ ] Confirm borrow button is hidden when `isReadOnly` via `!isReadOnly &&` guard — already present

- [ ] Implement AC2 — Ledger screen read-only enforcement (AC: #2)
  - [ ] Add `isReadOnly` from `useSettingsStore` to `LedgerView.tsx`
  - [ ] Disable Add Transaction button when `isReadOnly` in `LedgerView.tsx`
  - [ ] Hide or disable OFX importer controls when `isReadOnly` in `OFXImporter.tsx`
  - [ ] Guard the drag-drop handler in `OFXImporter.tsx` so drop events are ignored when `isReadOnly`

- [ ] Implement AC3 — Store-level write guard (AC: #3)
  - [ ] Add `isReadOnly` early-exit guard to `useTransactionStore.createTransaction`
  - [ ] Add `isReadOnly` early-exit guard to `useTransactionStore.importOFX`
  - [ ] Add `isReadOnly` early-exit guard to `useTransactionStore.updateTransaction`

- [ ] Add tests (AC: #1, #2, #3)
  - [ ] `LedgerView.test.tsx`: Add test — Add Transaction button is disabled when `isReadOnly = true`
  - [ ] `OFXImporter.test.tsx`: Add test — Browse button is disabled when `isReadOnly = true`
  - [ ] `OFXImporter.test.tsx`: Add test — drag-drop event is ignored when `isReadOnly = true`
  - [ ] `useTransactionStore.test.ts`: Add test — `createTransaction` does nothing when `isReadOnly = true`
  - [ ] `useTransactionStore.test.ts`: Add test — `importOFX` does nothing when `isReadOnly = true`

## Dev Notes

### Current State — What's Already Done vs. What's Missing

**AC1 — Budget screen: ALREADY FULLY IMPLEMENTED. Verify only.**

- `src/features/envelopes/EnvelopeList.tsx:60`: `disabled={isWriting || showAddForm || isReadOnly}` — Add Envelope button already disabled ✓
- `src/features/envelopes/EnvelopeList.tsx:65`: `{!isReadOnly && (` — Allocate button hidden in read-only ✓
- `src/features/envelopes/EnvelopeCard.tsx:223`: `disabled={isReadOnly}` — ⋯ button already disabled ✓
- `src/features/envelopes/EnvelopeCard.tsx:205`: `{(state === 'caution' || state === 'overspent') && !isReadOnly && (` — Borrow button already hidden ✓
- `src/features/envelopes/EnvelopeCard.tsx:66`: `if (isReadOnly) return;` — name click already guarded ✓
- Tests exist: `EnvelopeCard.test.tsx` lines 258–277 test both ⋯ button disabled and name click blocked in read-only

**AC2 — Ledger screen: TWO COMPONENTS NEED CHANGES.**

`LedgerView.tsx` — Add Transaction button has NO `isReadOnly` guard:
```tsx
// Current (line 71–76):
<Button variant="outline" onClick={() => setShowAddForm(true)} disabled={showAddForm}>
  Add Transaction
</Button>

// Required:
const isReadOnly = useSettingsStore((s) => s.isReadOnly);
// ...
<Button variant="outline" onClick={() => setShowAddForm(true)} disabled={showAddForm || isReadOnly}>
  Add Transaction
</Button>
```

`OFXImporter.tsx` — Browse button and drag-drop have NO `isReadOnly` guard:
- `handleBrowse` (line 63): opens the file dialog with no read-only check
- drag-drop handler (line 29–51): fires `handleImport` on `'drop'` event with no read-only check
- `Browse…` button (line 111–122): rendered with no `disabled` prop

**Required OFXImporter changes:**
1. Import and subscribe to `isReadOnly` from `useSettingsStore`
2. Disable the Browse button: `disabled={isReadOnly}`
3. Guard `handleBrowse` and the drag-drop `'drop'` case: return early if `isReadOnly`
4. Consider visual treatment: show a short read-only message instead of the drag target when `isReadOnly = true`, or simply disable the button and suppress the drag handler silently

**AC3 — Store guards: ADD EARLY-EXIT TO WRITE ACTIONS.**

All three write actions in `useTransactionStore` should guard against `isReadOnly`:

```ts
// At the top of createTransaction, importOFX, updateTransaction:
const { isReadOnly } = useSettingsStore.getState();
if (isReadOnly) return;
```

Import: `import { useSettingsStore } from '@/stores/useSettingsStore';`

This is a belt-and-suspenders guard. The AC says "store guard OR UI guard" so this satisfies AC3 even if UI guards are bypassed. Precedent: `useSettingsStore` uses `invoke` in `checkSentinel` and stores `isReadOnly` in Zustand state — `useSettingsStore.getState().isReadOnly` is synchronous and safe to call inside another store.

### Architecture Patterns

- **`isReadOnly` subscription pattern** (from existing code in `EnvelopeCard.tsx`, `EnvelopeList.tsx`, `SettingsPage.tsx`):
  ```tsx
  const isReadOnly = useSettingsStore((s) => s.isReadOnly);
  ```
- **Store-level read** (from `useTransactionStore.ts` pattern using other stores):
  ```ts
  import { useSettingsStore } from '@/stores/useSettingsStore';
  // inside action:
  const { isReadOnly } = useSettingsStore.getState();
  if (isReadOnly) return;
  ```
- **Disabling buttons**: Use `disabled={isReadOnly}` or `disabled={existingCondition || isReadOnly}` — no new UI patterns needed
- **Hiding vs. disabling the OFX importer**: The AC says buttons should be "disabled and non-interactive" — use `disabled` prop on the Browse button; the drag-drop drop event should silently drop the file (no processing). No requirement to hide the entire importer or show a special read-only state.

### File Structure

All changes are in existing files. No new files needed.

```
src/features/transactions/
  LedgerView.tsx             ← add isReadOnly import + button disabled
  LedgerView.test.tsx        ← add read-only test
  OFXImporter.tsx            ← add isReadOnly import + guards
  OFXImporter.test.tsx       ← add read-only tests
src/stores/
  useTransactionStore.ts     ← add isReadOnly guards to 3 write actions
  useTransactionStore.test.ts ← add read-only guard tests
```

### Testing Patterns

**LedgerView.test.tsx** — needs a `useSettingsStore` mock added (currently missing from that test file):

```tsx
const mockSettingsState = { isReadOnly: false };

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: vi.fn((selector: (s: typeof mockSettingsState) => unknown) =>
    selector(mockSettingsState),
  ),
}));
```

Then in test:
```tsx
it('disables Add Transaction button when isReadOnly', () => {
  mockSettingsState.isReadOnly = true;
  render(<LedgerView />);
  expect(screen.getByRole('button', { name: /add transaction/i })).toBeDisabled();
});
```

**OFXImporter.test.tsx** — already has a `useTransactionStore` mock; needs `useSettingsStore` mock added:

```tsx
const mockSettingsState = { isReadOnly: false };

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: vi.fn((selector: (s: typeof mockSettingsState) => unknown) =>
    selector(mockSettingsState),
  ),
}));
```

Drag-drop test pattern (already established in existing OFXImporter tests):
```tsx
it('ignores drop events when isReadOnly', async () => {
  mockSettingsState.isReadOnly = true;
  let capturedHandler: ((event: unknown) => void) | undefined;
  mockOnDragDropEvent.mockImplementation((handler) => {
    capturedHandler = handler;
    return Promise.resolve(() => {});
  });
  render(<OFXImporter />);
  await act(async () => {
    capturedHandler?.({ payload: { type: 'drop', paths: ['/some/file.ofx'] } });
  });
  expect(mockImportOFX).not.toHaveBeenCalled();
});
```

**useTransactionStore.test.ts** — add tests after the existing write-action tests:
```ts
it('createTransaction does nothing when isReadOnly', async () => {
  useSettingsStore.setState({ isReadOnly: true });
  await useTransactionStore.getState().createTransaction({ /* ... */ });
  expect(mockInvoke).not.toHaveBeenCalled();
});
```

Note: `useTransactionStore.test.ts` uses `vi.mock('@tauri-apps/api/core')` for `invoke`. The `useSettingsStore` state can be set directly via `useSettingsStore.setState({ isReadOnly: true })` since it's a real Zustand store in the test environment (not mocked).

### Previous Story Learnings (Story 7.1)

- Story 7.1 demonstrated that CSS pseudo-class states (hover) cannot be tested in jsdom — similar to `disabled` prop which CAN be tested via `toBeDisabled()` in `@testing-library/react`
- Pattern: The `BorrowOverlay.test.tsx` failures noted in 7.1 completion notes (`useEnvelopeStore.setState is not a function`) should be pre-existing and unrelated to this story
- All changes are in TypeScript/React — no Rust/Tauri backend changes needed for this story

### Deferred Work Context

From `_bmad-output/implementation-artifacts/deferred-work.md`:
- Line 84: "Read-only mode does not suppress write actions — Add Envelope button remains active" — This was a QA finding from Story 1.7 walkthrough. The Budget screen portion was subsequently fixed (EnvelopeList + EnvelopeCard now have guards). This story finishes the enforcement for the Ledger screen and adds store-level guards.
- Line 158: "W9: `guardReadOnly` not reactive after route load" — this is explicitly noted as out of scope for this story; it is a separate deferred item about route guard reactivity.
- The `isReadOnly` refresh mechanism (frozen at startup, not reactive when other instance closes) is also separately deferred — do NOT address in this story.

### Project Structure Notes

- `useSettingsStore` lives at `src/stores/useSettingsStore.ts`; import as `@/stores/useSettingsStore`
- No new components or routes needed — this is purely a guard enforcement story
- `LedgerView.tsx` does NOT currently import `useSettingsStore` — this needs to be added
- `OFXImporter.tsx` does NOT currently import `useSettingsStore` — this needs to be added

### References

- [Source: src/features/envelopes/EnvelopeList.tsx#L13] — pattern for `isReadOnly` subscription
- [Source: src/features/envelopes/EnvelopeCard.tsx#L46,L66,L223] — all three guard patterns: early return, conditional render, disabled prop
- [Source: src/features/transactions/LedgerView.tsx#L71] — Add Transaction button (no guard, needs fix)
- [Source: src/features/transactions/OFXImporter.tsx#L63,L37] — Browse handler and drag-drop handler (no guards, needs fix)
- [Source: src/stores/useTransactionStore.ts#L49,L74,L105] — write actions needing guards
- [Source: src/stores/useSettingsStore.ts#L52-L57] — `checkSentinel` + `isReadOnly` field definition
- [Source: src/features/envelopes/EnvelopeCard.test.tsx#L258-L277] — test pattern for read-only UI enforcement
- [Source: src/features/transactions/OFXImporter.test.tsx] — drag-drop event test pattern
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#L84] — original QA finding this story resolves

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List

### Change Log
