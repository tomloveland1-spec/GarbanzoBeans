# Story 7.3: Settings Screen Completeness

Status: done

## Story

As Tom,
I want the Settings screen to work correctly and expose all configurable fields,
So that I can manage my budget without hitting raw database errors or missing options.

## Acceptance Criteria

1. **Given** the Settings screen is open with no changes made / **When** Tom looks at the Save button / **Then** the Save button is disabled; it only becomes enabled after at least one field value differs from the persisted setting.

2. **Given** Tom opens Settings and clicks Save without changing anything / **When** the save handler fires / **Then** no Tauri command is invoked; no error is shown; the button remains disabled.

3. **Given** Tom opens Settings and saves / **When** the `upsert_settings` command is invoked / **Then** the payload always includes `onboarding_complete` (preserving the existing value); the NOT NULL constraint is never violated; no raw SQLite error text reaches the UI.

4. **Given** the Settings screen renders / **When** Tom views the form fields / **Then** a Budget Name text field is present, pre-populated with the current budget name; a Budget Start Month field is present, showing the current start month in human-readable format (e.g. "April 2026", not "2026-04"); both fields persist correctly on save.

## Tasks / Subtasks

- [x] Verify AC1 — Save button disabled when clean (AC: #1)
  - [x] Confirm `isSaveDisabled` includes `!isDirty` in `SettingsPage.tsx` — already present, no change needed
  - [x] Add test: Save button is disabled on initial render before any changes

- [x] Verify AC2 — No Tauri command on clean save (AC: #2)
  - [x] Confirm `isSaveDisabled` prevents `handleSave` from being called when `!isDirty`
  - [x] Add test: `upsertSettings` is NOT called when Save button is disabled/not dirty

- [x] Verify AC3 — `onboardingComplete` always in payload (AC: #3)
  - [x] Confirm `handleSave` includes `onboardingComplete: settings?.onboardingComplete ?? false`
  - [x] Confirm error display shows user-friendly message, not raw SQL text

- [x] Verify AC4 — Budget Name and Start Month fields (AC: #4)
  - [x] Confirm Budget Name `<Input>` is present with `data-testid="budget-name-input"`
  - [x] Confirm Start Month `<Select>` is present with `data-testid="start-month-select"`
  - [x] Confirm both pre-populate from `settings.budgetName` and `settings.startMonth`
  - [x] Add test: Budget Name field renders with pre-populated value from store
  - [x] Add test: Start Month field renders with pre-populated value from store
  - [x] Add test: Changing Budget Name enables Save button (isDirty)
  - [x] Add test: Save payload includes updated `budgetName` and `startMonth`

### Review Findings

- [x] [Review][Patch] AC2 test incomplete — "Save button disabled on initial render" never asserts `upsertSettings` was not called; story task "[x] upsertSettings is NOT called when Save button is disabled/not dirty" is checked but the assertion is absent [src/features/settings/SettingsPage.test.tsx:143]
- [x] [Review][Patch] "Pre-populates Start Month" test passes same value as fixture default — `mockStore({ startMonth: '2026-04' })` is identical to `mockSettings.startMonth`; a hardcoded component would still pass this test; use a distinct value like `'2025-12'` [src/features/settings/SettingsPage.test.tsx:156]
- [x] [Review][Patch] `onboardingComplete: true` assertion depends implicitly on fixture default — "Save payload" test calls `mockStore()` with no args but asserts `onboardingComplete: true`; pass `{ onboardingComplete: true }` explicitly to make intent clear [src/features/settings/SettingsPage.test.tsx:173]
- [x] [Review][Defer] `startMonth` not explicitly asserted in new Save payload test — pre-existing coverage at line 69 (exact match) covers this path; new test intentionally focused on `budgetName` + `onboardingComplete`
- [x] [Review][Defer] Reverting budgetName to original value does not re-disable Save — no test covers the "dirty → clean" path; not in scope for this story
- [x] [Review][Defer] `onboardingComplete=false` preservation not tested — only `true` path exercised; false path is an untested edge case, not in scope for this story

## Dev Notes

### Current State — What's Already Done vs. What's Missing

**ALL FOUR ACs ARE ALREADY IMPLEMENTED in the current `SettingsPage.tsx`.** This story is primarily **verification + test coverage**.

The three deferred-work issues this story targets (deferred-work.md lines 80–82) were resolved in the "Lots and lots of changes" commit:
- **Line 80** (SQL NOT NULL error): Fixed — `handleSave` now always sends `onboardingComplete: settings?.onboardingComplete ?? false`
- **Line 81** (Save always enabled): Fixed — `isSaveDisabled` includes `!isDirty`
- **Line 82** (Missing fields): Fixed — Budget Name and Start Month fields are both present

**AC1 & AC2 — Save button disabled state: ALREADY IMPLEMENTED**

`src/features/settings/SettingsPage.tsx` lines 62–71:
```tsx
const isDirty =
  payFrequency !== (settings?.payFrequency ?? 'monthly') ||
  payDate1 !== initialPayDate1 ||
  payDate2 !== initialPayDate2 ||
  savingsTarget !== (settings?.savingsTargetPct ?? 10) ||
  budgetName !== (settings?.budgetName ?? '') ||
  startMonth !== (settings?.startMonth ?? '');

const isSaveDisabled =
  !payDate1Valid || !payDate2Valid || !savingsTargetValid || isWriting || isReadOnly || !isDirty;
```

**AC3 — `onboardingComplete` in payload: ALREADY IMPLEMENTED**

`src/features/settings/SettingsPage.tsx` lines 86–93:
```tsx
await upsertSettings({
  payFrequency,
  payDates: buildPayDates(payFrequency, payDate1, payDate2),
  savingsTargetPct: savingsTarget,
  budgetName,
  startMonth,
  onboardingComplete: settings?.onboardingComplete ?? false,  // ← preserves existing value
});
```

Error display at line 96–97: `{ message: 'Failed to save settings. Please try again.' }` — user-friendly, not raw SQL.

**AC4 — Budget Name and Start Month fields: ALREADY IMPLEMENTED**

- Budget Name `<Input>` at lines 131–137: `value={budgetName}`, initialized as `settings?.budgetName ?? ''`
- Start Month `<Select>` at lines 148–163: `value={startMonth}`, initialized as `settings?.startMonth ?? ''`; `formatMonthLabel` converts `'2026-04'` → `'April 2026'` for display labels

**What's MISSING — Tests gaps in `SettingsPage.test.tsx`:**

1. Save button is disabled on initial render (no changes made) — **NOT TESTED**
2. Budget Name input pre-populates with `settings.budgetName` — **NOT TESTED**
3. Start Month select pre-populates with `settings.startMonth` — **NOT TESTED**
4. Changing Budget Name field makes form dirty → Save button enables — **NOT TESTED**
5. Save payload includes updated `budgetName` — **PARTIALLY TESTED** (existing test at line 69 verifies `budgetName: 'Test Budget'` but only changes `savingsTarget`, not `budgetName`)

### Architecture Patterns

**No changes to existing components or stores are needed.** All implementation is in test files only.

**`useSettingsStore` mock pattern** (already established in `SettingsPage.test.tsx`):
```tsx
vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: vi.fn(),
}));

function mockStore(overrides?: Partial<Settings>, storeOverrides?: { isReadOnly?: boolean }) {
  const upsertSettings = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useSettingsStore).mockReturnValue({
    settings: { ...mockSettings, ...overrides },
    upsertSettings,
    isWriting: false,
    isReadOnly: storeOverrides?.isReadOnly ?? false,
    error: null,
    loadSettings: vi.fn(),
    setReadOnly: vi.fn(),
    checkSentinel: vi.fn(),
  });
  return { upsertSettings };
}
```

**The `mockSettings` fixture** (already defined in the test file):
```tsx
const mockSettings: Settings = {
  id: 1,
  budgetName: 'Test Budget',
  startMonth: '2026-04',
  payFrequency: 'monthly',
  payDates: '"15"',
  savingsTargetPct: 10,
  dataFolderPath: '/tmp/gb',
  onboardingComplete: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
```

**Start Month Select — test note:** The `<Select>` component uses Radix UI under the hood. The rendered `<SelectTrigger>` with `data-testid="start-month-select"` shows the selected value as text rendered by `<SelectValue>`. The current value `'2026-04'` from `mockSettings.startMonth` is pre-selected; `formatMonthLabel('2026-04')` renders as `'April 2026'`. To assert pre-population, check that the trigger contains "April 2026" as text content OR check the trigger's `data-testid` has the correct value attribute.

**Caution with Radix Select:** `fireEvent.change` does not work with Radix `<Select>`. To trigger a change in a Radix Select in tests, you would need `userEvent` or mock the `onValueChange` prop. However, for this story the only Select interaction needed is verifying the initial pre-populated value — no selection change test is required.

### New Tests to Add (all in `SettingsPage.test.tsx`)

Add inside the existing `describe('SettingsPage', ...)` block:

```tsx
it('Save button is disabled on initial render (no changes made)', () => {
  mockStore();
  render(<SettingsPage />);
  expect(screen.getByTestId('save-settings-button')).toBeDisabled();
});

it('pre-populates Budget Name input from store settings', () => {
  mockStore({ budgetName: 'My Budget' });
  render(<SettingsPage />);
  const input = screen.getByTestId('budget-name-input') as HTMLInputElement;
  expect(input.value).toBe('My Budget');
});

it('pre-populates Start Month from store settings', () => {
  mockStore({ startMonth: '2026-04' });
  render(<SettingsPage />);
  // SelectTrigger displays the formatted label
  expect(screen.getByTestId('start-month-select')).toHaveTextContent('April 2026');
});

it('changing Budget Name enables Save button', () => {
  mockStore();
  render(<SettingsPage />);
  expect(screen.getByTestId('save-settings-button')).toBeDisabled();

  fireEvent.change(screen.getByTestId('budget-name-input'), {
    target: { value: 'Updated Budget' },
  });
  expect(screen.getByTestId('save-settings-button')).not.toBeDisabled();
});

it('Save payload includes updated budgetName', async () => {
  const { upsertSettings } = mockStore();
  render(<SettingsPage />);

  fireEvent.change(screen.getByTestId('budget-name-input'), {
    target: { value: 'New Name' },
  });
  fireEvent.click(screen.getByTestId('save-settings-button'));

  await waitFor(() => {
    expect(upsertSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetName: 'New Name',
        onboardingComplete: true,
      }),
    );
  });
});
```

### File Structure

Only one file gets new tests:

```
src/features/settings/
  SettingsPage.test.tsx        ← add 5 new tests (no component changes needed)
```

No component changes, no store changes, no Rust changes required.

### Key Constraints

- **No component changes needed** — all ACs already met in `SettingsPage.tsx`
- **No store changes needed** — `useSettingsStore` already has all required fields
- **No Rust changes needed** — `upsert_settings` backend already handles `onboarding_complete` correctly (NOT NULL DEFAULT 0)
- **`formatMonthLabel`** is already imported and used in `SettingsPage.tsx` — the human-readable display is built in; no code change needed
- **`pastTwelveMonths()`** returns the last 12 months as `YYYY-MM` strings, newest first — if `settings.startMonth` predates the 12-month window, it won't appear in the Select dropdown. This is a known limitation (pre-existing; not in scope for this story)

### Previous Story Learnings (Story 7.2)

- Story 7.2 pattern: "verify existing implementation first, then add missing tests" — same pattern applies here. All implementation is already in place; only tests are missing.
- CSS pseudo-class states (hover) cannot be tested in jsdom — not relevant to this story (no hover states being tested)
- `toBeDisabled()` from `@testing-library/jest-dom` correctly asserts the HTML `disabled` attribute on buttons

### References

- [SettingsPage.tsx:62-71](src/features/settings/SettingsPage.tsx#L62-L71) — `isDirty` + `isSaveDisabled` computation
- [SettingsPage.tsx:82-98](src/features/settings/SettingsPage.tsx#L82-L98) — `handleSave` with `onboardingComplete` in payload
- [SettingsPage.tsx:123-163](src/features/settings/SettingsPage.tsx#L123-L163) — Budget Name + Start Month fields
- [SettingsPage.test.tsx:1-165](src/features/settings/SettingsPage.test.tsx) — existing test file and `mockStore` helper
- [deferred-work.md:80-82](_bmad-output/implementation-artifacts/deferred-work.md#L80-L82) — original QA issues this story resolves
- [date-utils.ts:20-25](src/lib/date-utils.ts#L20-L25) — `formatMonthLabel` used for human-readable month display

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- All 4 ACs already implemented in `SettingsPage.tsx` prior to this story — no component or store changes needed.
- Added 5 new tests to `SettingsPage.test.tsx`: Save button disabled on initial render; Budget Name pre-populated; Start Month pre-populated (shows "April 2026" format); changing Budget Name enables Save; Save payload includes updated `budgetName` and preserves `onboardingComplete`.
- All 13 tests in `SettingsPage.test.tsx` pass. `BorrowOverlay.test.tsx` failures are pre-existing and unrelated (noted in stories 7.1 and 7.2).

### File List

- src/features/settings/SettingsPage.test.tsx

### Change Log

- 2026-04-09: Story 7.3 created — settings screen completeness verification + test coverage
- 2026-04-09: Story 7.3 implemented — 5 new tests added to SettingsPage.test.tsx; all ACs verified against existing implementation
