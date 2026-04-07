# Story 1.6: Settings Screen — Update Configuration Anytime

Status: review

## Story

As Tom,
I want to update my pay frequency, pay dates, and savings target from the Settings screen at any time,
So that my configuration stays accurate as my financial situation changes without altering any historical data.

## Acceptance Criteria

1. **Given** the user navigates to `/settings` **when** the settings screen renders **then** current pay frequency, pay dates, and savings target are pre-populated with their stored values

2. **Given** the user changes pay frequency and saves **when** the change is committed to SQLite **then** the new setting applies from that point forward; no historical transaction records, month records, or envelope allocations are modified (FR35)

3. **Given** the user changes the savings target and saves **when** the change is committed **then** the new target is stored; past months are unaffected; future calculations use the new value

4. **Given** the user navigates away from Settings without saving **when** they return to the screen **then** the screen shows the last saved values, not the unsaved edits

## Tasks / Subtasks

- [x] Task 1: Extract shared pay-date helpers to `src/lib/pay-dates.ts`
  - [x] Create `src/lib/pay-dates.ts` exporting `buildPayDates()` and `parsePayDates()`
  - [x] Update `src/features/settings/OnboardingPage.tsx` to import `buildPayDates` from `@/lib/pay-dates` instead of defining it locally (delete local definition)

- [x] Task 2: Build `SettingsPage.tsx` (AC: #1, #2, #3, #4)
  - [x] Create `src/features/settings/SettingsPage.tsx`
  - [x] Initialize local form state from `useSettingsStore().settings` on mount (pre-population)
  - [x] Implement pay frequency radio group (same 4 options as onboarding)
  - [x] Implement conditional pay date inputs (same logic as onboarding PayFrequencyStep)
  - [x] Implement savings target number input (0–100, integer)
  - [x] "Save" button calls `upsertSettings()` with `payFrequency`, `payDates`, `savingsTargetPct` only
  - [x] Show inline error if `upsertSettings()` rejects
  - [x] Show success feedback inline (not a modal) after successful save
  - [x] "Navigate away = discard" is automatic (component unmounts → re-mounts from store on return)

- [x] Task 3: Wire route in `src/router.tsx`
  - [x] Replace the placeholder component in `settingsRoute` with `SettingsPage` from `src/features/settings/SettingsPage.tsx`

- [x] Task 4: Write Vitest unit tests
  - [x] Test file: `src/features/settings/SettingsPage.test.tsx`
  - [x] Test: pre-populates pay frequency from store settings
  - [x] Test: pre-populates savings target from store settings
  - [x] Test: Save button calls `upsertSettings` with correct payload
  - [x] Test: Re-mounting after store change shows new saved values (not prior local edits)

- [x] Task 5: Write Playwright E2E test
  - [x] Test file: `e2e/settings.spec.ts`
  - [x] Test: navigate to `/settings`, change savings target, save, navigate away, return — verify new value is shown

## Dev Notes

---

### Files to Create
- `src/lib/pay-dates.ts` — shared utility (new)
- `src/features/settings/SettingsPage.tsx` — main deliverable (new)
- `src/features/settings/SettingsPage.test.tsx` — tests (new)
- `e2e/settings.spec.ts` — E2E test (new)

### Files to Modify
- `src/features/settings/OnboardingPage.tsx` — remove local `buildPayDates`, import from `@/lib/pay-dates`
- `src/router.tsx` — wire `SettingsPage` into `settingsRoute`

---

### Shared Pay-Date Helpers (`src/lib/pay-dates.ts`)

The `buildPayDates` function currently lives in `OnboardingPage.tsx` (line ~41). Move it to a shared module so `SettingsPage.tsx` can import it without pulling in a page component.

```typescript
// src/lib/pay-dates.ts
export type PayFrequency = 'weekly' | 'bi-weekly' | 'twice-monthly' | 'monthly';

/** Build the payDates JSON string for SQLite storage. */
export function buildPayDates(
  freq: PayFrequency,
  payDate1: string,
  payDate2: string,
): string {
  if (freq === 'twice-monthly') {
    return JSON.stringify([payDate1, payDate2]);
  }
  return JSON.stringify(payDate1);
}

/** Parse the stored payDates JSON string back into form fields. */
export function parsePayDates(
  payFrequency: string | null,
  payDatesJson: string | null,
): { payDate1: string; payDate2: string } {
  if (!payFrequency || !payDatesJson) return { payDate1: '', payDate2: '' };
  try {
    const parsed = JSON.parse(payDatesJson);
    if (payFrequency === 'twice-monthly' && Array.isArray(parsed)) {
      return { payDate1: String(parsed[0] ?? ''), payDate2: String(parsed[1] ?? '') };
    }
    return { payDate1: String(parsed), payDate2: '' };
  } catch {
    return { payDate1: '', payDate2: '' };
  }
}
```

**Update OnboardingPage.tsx:** Delete the local `buildPayDates` function (currently around line 41–50) and add the import:
```typescript
import { buildPayDates, type PayFrequency } from '@/lib/pay-dates';
```
Also delete the local `type PayFrequency` declaration (around line 21) since it's now exported from the shared module.

---

### SettingsPage.tsx Structure

The settings screen is a standard content page, not a wizard. Use a single-page form layout inside the app shell (sidebar already present from `App.tsx`).

```
/settings
├── Page heading: "Settings"
├── Section: "Pay schedule"
│   ├── Pay frequency radio group (4 options — same as onboarding)
│   └── Conditional pay date inputs (same logic as onboarding PayFrequencyStep)
├── Section: "Savings"
│   └── Savings target % input (0–100, integer)
└── Footer: Save button + inline feedback
```

**Pre-population pattern:**

```typescript
export default function SettingsPage() {
  const { settings, upsertSettings, isWriting, error } = useSettingsStore();

  // Initialize local state from stored settings on mount.
  // Because the component unmounts on navigation and re-mounts fresh,
  // "navigate away = discard unsaved edits" is automatic.
  const [payFrequency, setPayFrequency] = useState<PayFrequency>(
    (settings?.payFrequency as PayFrequency) ?? 'monthly'
  );
  const { payDate1: initialPayDate1, payDate2: initialPayDate2 } = parsePayDates(
    settings?.payFrequency ?? null,
    settings?.payDates ?? null,
  );
  const [payDate1, setPayDate1] = useState(initialPayDate1);
  const [payDate2, setPayDate2] = useState(initialPayDate2);
  const [savingsTarget, setSavingsTarget] = useState(settings?.savingsTargetPct ?? 10);

  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<AppError | null>(null);

  const handleSave = async () => {
    setSaved(false);
    setSaveError(null);
    try {
      await upsertSettings({
        payFrequency,
        payDates: buildPayDates(payFrequency, payDate1, payDate2),
        savingsTargetPct: savingsTarget,
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err as AppError);
    }
  };
  // ...
}
```

**Important:** Pass only `payFrequency`, `payDates`, and `savingsTargetPct` to `upsertSettings()`. Do NOT pass other fields (`budgetName`, `startMonth`, `dataFolderPath`, `onboardingComplete`). The `COALESCE` in the Rust command preserves all unmentioned fields.

---

### COALESCE Behavior — No Clearing Needed

The `upsert_settings` Rust command uses `COALESCE(?N, col)` — passing `null` for any field preserves the existing DB value. The settings screen always provides values for pay frequency, pay dates, and savings target, so this is not a concern here. Do not attempt to clear these fields.

If you pass only `{ savingsTargetPct: 15 }` with `payFrequency: undefined`, the `UpsertSettingsInput` interface has all fields optional, so only `savingsTargetPct` would be sent and the COALESCE would preserve the others. Always pass all three fields from the settings screen to avoid stale UI state after the `loadSettings()` refresh.

---

### Pay Date Input Logic — Reuse Exactly from OnboardingPage.tsx

Copy the validation logic verbatim from `OnboardingPage.tsx` `PayFrequencyStep` component:

```typescript
const isNumericDayValid = (v: string) => {
  const n = parseInt(v, 10);
  return v !== '' && n >= 1 && n <= 28;
};

const payDate1Valid =
  payFrequency === 'weekly' || payFrequency === 'bi-weekly'
    ? !!payDate1
    : isNumericDayValid(payDate1);

const payDate2Valid =
  payFrequency === 'twice-monthly'
    ? isNumericDayValid(payDate2) && payDate2 !== payDate1
    : true;

const isSaveDisabled = !payDate1Valid || !payDate2Valid || isWriting;
```

When pay frequency changes, reset `payDate1` and `payDate2` to `''` (same as onboarding).

---

### "Saved" Inline Feedback

Do NOT use a modal or toast for save confirmation. Show an inline status line below the Save button:

```tsx
{saved && !saveError && (
  <p className="type-label" style={{ color: 'var(--color-envelope-green)' }}>
    Settings saved.
  </p>
)}
{saveError && (
  <p className="type-label" style={{ color: 'var(--color-red, #ff5555)' }}>
    {saveError.message}
  </p>
)}
```

Clear `saved` when the user makes any subsequent change to the form (prevents stale "Settings saved." message).

---

### Styling Guidelines

Use these exact CSS custom properties (already defined in `index.css`):

| Use | Token |
|-----|-------|
| Page/section headings | `var(--color-text-primary)` |
| Labels, hints | `var(--color-text-muted)` |
| Page background | `var(--color-bg-app)` |
| Card/section background | `var(--color-bg-surface)` |
| Section borders | `var(--color-border)` |
| Success feedback | `var(--color-envelope-green)` = `#C0F500` |
| Error feedback | `var(--color-red, #ff5555)` |

Use `type-h1`, `type-h2`, `type-body`, `type-label` CSS classes (established in Story 1.2 design system).

Page layout reference — wrap content in:
```tsx
<div className="p-6 flex flex-col gap-8 max-w-lg" style={{ color: 'var(--color-text-primary)' }}>
```

Section grouping: each settings section (`Pay schedule`, `Savings`) in a card-style container:
```tsx
<div
  className="rounded-lg p-6 flex flex-col gap-4"
  style={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
>
```

---

### Router Wiring (`src/router.tsx`)

Replace in `settingsRoute`:
```tsx
// BEFORE
component: () => <div className="p-6 type-body" style={{ color: 'var(--color-text-primary)' }}>Settings — coming in Story 1.6</div>,

// AFTER
component: SettingsPage,
```

Add the import at the top:
```typescript
import SettingsPage from '@/features/settings/SettingsPage';
```

No guard changes needed — `guardOnboarding()` and `guardTurnTheMonth()` are already on `settingsRoute`.

---

### Previous Story Learnings (from Story 1.5)

1. **`upsertSettings` re-throws on failure** — The store action re-throws so callers can catch and set local error state. Use `try/catch` in `handleSave()`.
2. **`isWriting` flag** — The store sets `isWriting: true` during the Tauri call. Disable the Save button while `isWriting` is true.
3. **Import `invoke` separately only when needed** — For `SettingsPage`, only `upsertSettings` from the store is needed; `invoke` is not called directly from this component.
4. **`tauri-plugin-dialog` is already installed** — No new Tauri plugins needed for this story.
5. **`data-testid` attributes** — Add `data-testid` to interactive elements for Playwright. Follow the pattern: `pay-frequency-{value}`, `pay-date-1-input`, `pay-date-2-input`, `savings-target-input`, `save-settings-button`.
6. **`useSettingsStore()` destructuring** — Use `const { settings, upsertSettings, isWriting } = useSettingsStore();` (same pattern as OnboardingPage.tsx).

---

### Testing Reference

**Vitest pattern (from `src/features/settings/OnboardingPage.test.tsx`):**
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
```

**Mock `useSettingsStore`:**
```typescript
vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: vi.fn(),
}));
```

**E2E test (`e2e/settings.spec.ts`) minimum coverage:**
1. Navigate to `/settings` — verify pay frequency is pre-populated
2. Change savings target, click Save — verify inline "Settings saved." message appears
3. Navigate away and return — verify new savings target value is shown (not the pre-change value)

---

### Existing Shared Components Available

All in `src/components/ui/` — do not add new shadcn/ui components for this story; all needed are present:

| Component | Import |
|-----------|--------|
| `Button` | `@/components/ui/button` |
| `Input` | `@/components/ui/input` |
| `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` | `@/components/ui/select` |

---

### What This Story Does NOT Touch

- `budget_name`, `start_month`, `data_folder_path`, `onboarding_complete` — set once during onboarding, not editable here per FR35
- No new Tauri commands — `upsert_settings` already handles partial updates via COALESCE
- No new Zustand store actions — `upsertSettings()` already exists in `useSettingsStore`
- No new migrations — `settings` schema is complete from Story 1.3 + 1.5

## File List

- `src/lib/pay-dates.ts` (created)
- `src/features/settings/SettingsPage.tsx` (created)
- `src/features/settings/SettingsPage.test.tsx` (created)
- `e2e/settings.spec.ts` (created)
- `src/features/settings/OnboardingPage.tsx` (modified — removed local `buildPayDates` and `type PayFrequency`, added import from `@/lib/pay-dates`)
- `src/router.tsx` (modified — wired `SettingsPage` into `settingsRoute`)

## Dev Agent Record

### Implementation Plan

1. Extracted `buildPayDates` and new `parsePayDates` to `src/lib/pay-dates.ts` (shared module). Also exported `PayFrequency` type. Updated `OnboardingPage.tsx` to import from this module and deleted the local definitions.
2. Built `SettingsPage.tsx` as a single-page form with two card sections (Pay schedule, Savings). Pre-populates state from store on mount; uses `parsePayDates` to decode the stored JSON into `payDate1`/`payDate2`. Save calls `upsertSettings` with only the three settable fields. Success and error feedback shown inline below the Save button. Navigate-away-discards-unsaved-edits is automatic via component unmount/remount.
3. Wired `SettingsPage` into `settingsRoute` in `src/router.tsx`, replacing the placeholder div.
4. Wrote 6 Vitest unit tests covering pre-population, save payload, success feedback, error feedback, and remount behavior.
5. Wrote 3 Playwright E2E tests covering navigation, save feedback, and navigate-away-then-return persistence.

### Completion Notes

All 32 tests pass (7 test files). 6 new unit tests in `SettingsPage.test.tsx` cover all 4 story ACs. 3 E2E tests in `e2e/settings.spec.ts` cover the critical user flows. No regressions introduced. All acceptance criteria satisfied:
- AC1: Pre-population via `parsePayDates` + `useState` initialization from store.
- AC2: Only `payFrequency`, `payDates`, `savingsTargetPct` passed to `upsertSettings`; COALESCE preserves other fields.
- AC3: Savings target saved and returned via store refresh on next `get_settings` call.
- AC4: Navigate away = component unmounts, remounts fresh from store on return.

### Review Findings

- [x] [Review][Patch] Remove `guardTurnTheMonth()` from `settingsRoute.beforeLoad` — settings should remain accessible during month-close [src/router.tsx:88]
- [x] [Review][Patch] String vs integer comparison for twice-monthly duplicate date check — `payDate2 !== payDate1` compares raw strings; "1" and "01" pass as distinct [src/features/settings/SettingsPage.tsx:49]
- [x] [Review][Patch] No JS validation for savings target range — `min`/`max` HTML attributes are bypassed by programmatic input; values outside 0–100 or non-integer reach `upsertSettings` [src/features/settings/SettingsPage.tsx:52]
- [x] [Review][Patch] `saveError` cast without narrowing — `err as AppError` will render `undefined` if rejection is a plain Error or string [src/features/settings/SettingsPage.tsx:70]
- [x] [Review][Patch] Pay date `<label>` elements not associated with inputs via `htmlFor`/`id` — weekly/bi-weekly, twice-monthly, and monthly labels lack proper association [src/features/settings/SettingsPage.tsx:~148]
- [x] [Review][Patch] `pay-date-1-select` testid on weekly/bi-weekly Select deviates from spec testid list — spec specifies `pay-date-1-input` [src/features/settings/SettingsPage.tsx:~143]
- [x] [Review][Defer] `useState` stale on async settings load — mitigated by `guardOnboarding()` ensuring settings is non-null before /settings is reachable; unmount/remount by design [src/features/settings/SettingsPage.tsx:25]
- [x] [Review][Defer] `handleSave` concurrent invocation race — `isWriting` store flag is set before first await; theoretical race, pre-existing pattern in codebase [src/features/settings/SettingsPage.tsx:57]
- [x] [Review][Defer] `buildPayDates` accepts empty strings with no internal guard — caller's `isSaveDisabled` already prevents this; pure utility by design [src/lib/pay-dates.ts:4]
- [x] [Review][Defer] E2E test doesn't assert `upsert_settings` was called with correct payload — tests user-visible behavior; minor coverage gap [e2e/settings.spec.ts:98]
- [x] [Review][Defer] `parsePayDates` format mismatch produces silent empty fields — defensive fallback; no mismatched data written by current codebase [src/lib/pay-dates.ts:16]

## Change Log

- 2026-04-06: Story implemented — Settings screen with pay schedule + savings target editing, shared pay-dates helpers extracted, router wired.

## Story Progress

- Status: done
- Created: 2026-04-06
- Completed: 2026-04-06
