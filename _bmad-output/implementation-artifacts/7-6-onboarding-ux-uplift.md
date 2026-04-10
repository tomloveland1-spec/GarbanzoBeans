# Story 7.6: Onboarding UX Uplift

Status: done

## Story

As a new user (Tom),
I want onboarding to feel like a welcoming product experience with clear visual context for each step,
so that I understand why each feature matters before I'm asked to configure it.

## Acceptance Criteria

1. **Given** the onboarding flow renders any step / **When** the screen paints / **Then** the form content (heading, fields, navigation buttons) is vertically and horizontally centred in the viewport; there is no large empty area above or below the content.

2. **Given** the onboarding step that asks for the Budget Start Month / **When** the month selector renders / **Then** it is a proper month/year picker control (not a scrollable list of ISO strings); displayed values are human-readable (e.g. "April 2026", not "2026-04"); the picker does not overlap other form elements.

3. **Given** any onboarding step renders / **When** Tom views the screen / **Then** a compelling illustration or graphic relevant to that step's feature is displayed alongside the input form; copy explains *why* the feature matters before asking for input (e.g. step 3 savings target: show a wealth/growth visual and frame the target as an aspirational goal, not a hard limit).

4. **Given** the savings target step renders / **When** Tom reads the copy / **Then** the framing is aspirational (e.g. "Set your savings goal" with subtext "We'll track your progress each month") — not a ceiling or commitment; no language implies the user will be penalised for falling short.

## Tasks / Subtasks

- [x] Refactor `StepShell` for full-viewport centering (AC: #1)
  - [x] Change outer div from 3-part sticky layout to `flex flex-col h-full items-center justify-center`
  - [x] Move step counter and nav buttons inside a single `w-full max-w-md` centered block
  - [x] Verify welcome screen (step 0) remains vertically and horizontally centred

- [x] Verify month picker UX (AC: #2)
  - [x] Confirm `formatMonthLabel` is rendering "April 2026" format in all `SelectItem` displays (not "2026-04")
  - [x] Confirm `SelectContent side="bottom"` is present to prevent dropdown overlap
  - [x] No code change required if current implementation already satisfies the above — confirm with test

- [x] Add inline SVG illustrations to each onboarding step (AC: #3)
  - [x] Add `WelcomeIllustration` component (brand mark SVG) above the title in the step-0 welcome screen
  - [x] Add `BudgetIllustration` component (envelope motif + "why" copy) as first child in `BudgetNameStep`
  - [x] Add `DataFolderIllustration` component (folder/lock motif + "why" copy) as first child in `DataFolderStep`
  - [x] Add `SavingsIllustration` component (arc gauge motif + "why" copy) as first child in `SavingsTargetStep`
  - [x] All illustration containers must have `data-testid="step-illustration"`

- [x] Rewrite savings target copy to aspirational framing (AC: #4)
  - [x] Change h2 from "Savings target" → "Set your savings goal"
  - [x] Add subtext `<p>` below h2: "We'll track your progress each month — this is a goal, not a hard limit."
  - [x] Change field label from "What percentage of income do you want to save?" → "Target savings percentage"

- [x] Add component rendering tests (AC: #1, #2, #3, #4)
  - [x] Mock `@tanstack/react-router` for `useNavigate` (add to existing mocks at top of file)
  - [x] Add test: welcome screen renders `data-testid="step-illustration"`
  - [x] Add test: step 1 renders `data-testid="step-illustration"` and `data-testid="budget-name-input"`
  - [x] Add test: step 2 renders `data-testid="step-illustration"` and `data-testid="browse-button"`
  - [x] Add test: step 3 renders aspirational copy — `screen.getByText(/Set your savings goal/i)`
  - [x] Add test: step 3 renders subtext — `screen.getByText(/goal, not a hard limit/i)`
  - [x] Add test: month selector trigger shows human-readable value once a month is selected

### Review Findings

- [x] [Review][Patch] sessionStorage restore has no upper bound on `step` — `parsed.step > 3` sets an invalid step, falls through all if-branches, renders SavingsTargetStep with empty field state [src/features/settings/OnboardingPage.tsx:424]
- [x] [Review][Patch] `useNavigate` mock returns a new `vi.fn()` on every call — navigation cannot be asserted in future tests; store the fn as a stable variable [src/features/settings/OnboardingPage.test.tsx:23]
- [x] [Review][Patch] `beforeEach` doesn't clear sessionStorage — step-3 seeding from a prior test can leak into fresh-render tests [src/features/settings/OnboardingPage.test.tsx:150]
- [x] [Review][Patch] `expect(element).toBeTruthy()` is vacuous — `getByTestId` already throws on missing elements; use `toBeInTheDocument()` [src/features/settings/OnboardingPage.test.tsx]
- [x] [Review][Defer] `handleFinalConfirm` non-atomicity — `upsertSettings` marks `onboardingComplete: true` before `init_data_folder` succeeds; failure leaves settings persisted with no data folder initialized [src/features/settings/OnboardingPage.tsx:445] — deferred, pre-existing; story constraints prohibit touching handleFinalConfirm
- [x] [Review][Defer] Stale `startMonth` from sessionStorage not validated against current `pastTwelveMonths()` options — a session saved 13+ months ago restores a month value not in the dropdown; `nextDisabled` still passes [src/features/settings/OnboardingPage.tsx:426] — deferred, pre-existing; story constraints prohibit touching restore logic
- [x] [Review][Defer] sessionStorage state schema coupling in tests — step-3 tests write raw JSON with hardcoded field names; schema changes will break tests with cryptic failures [src/features/settings/OnboardingPage.test.tsx] — deferred, minor pattern concern; acceptable tradeoff for this test scope

## Dev Notes

### What's Changing and Why

Four areas of change, all confined to `src/features/settings/OnboardingPage.tsx` and its test file:

1. **Centering (AC1)** — Deferred QA finding from 2026-04-07: "Form content crammed into lower-left." The current `StepShell` pins nav buttons at the viewport bottom while centering the form content in the middle. The fix collapses everything into one vertically/horizontally centered `max-w-md` block so the entire step (counter + form + nav) reads as a unit.

2. **Month picker verification (AC2)** — Deferred QA finding: "Budget start month displays raw ISO format" and "overlaps other elements." The current code already uses `formatMonthLabel` (shows "April 2026") and `SelectContent side="bottom"`. This satisfies AC2. Task = verify + test; no structural change expected.

3. **Illustrations (AC3)** — New content. Inline SVG illustrations using `var(--color-sidebar-active)` (`#C0F500`). No external image files, no new dependencies. All four screens need a visual accent: welcome brand mark, envelope (budget), folder/lock (local data), arc gauge (savings progress).

4. **Savings copy (AC4)** — Deferred QA finding: "Step 4 copy frames savings target as a hard limit." Change heading and label to aspirational language.

---

### Task 1: StepShell Refactor (AC1)

**Current layout (3-part, nav pinned at bottom):**
```tsx
<div className="flex flex-col h-full">
  <div className="flex justify-end px-8 pt-6"> {/* counter — always at top */} </div>
  <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6 max-w-md mx-auto w-full">
    {children}
  </div>
  <div className="flex justify-between px-8 pb-8"> {/* nav — pinned at bottom */} </div>
</div>
```

**New layout (single centered block):**
```tsx
<div className="flex flex-col h-full items-center justify-center px-8">
  <div className="w-full max-w-md flex flex-col gap-4">

    {/* Step counter — right-aligned within centered block */}
    <div className="flex justify-end">
      <span className="type-label" style={{ color: 'var(--color-text-muted)' }}>
        Step {step} of 3
      </span>
    </div>

    {/* Form content */}
    {children}

    {/* Nav — part of the centered block, not pinned at viewport bottom */}
    <div className="flex justify-between pt-2">
      <Button variant="ghost" onClick={onBack}>
        Back
      </Button>
      <Button onClick={onNext} disabled={nextDisabled || isLoading}>
        {isLoading ? 'Saving…' : nextLabel}
      </Button>
    </div>
  </div>
</div>
```

**Why this works:** `h-full` + `items-center justify-center` on the outer div centers the `max-w-md` block in the viewport. The `h-full` chain is: App.tsx `h-screen` (onboarding container) → `h-full` inner div → Outlet → `h-full` outer StepShell div. This chain is intact.

**Step 0 (welcome) check:** Step 0 does not use `StepShell`. Its outer div is already:
```tsx
<div className="flex flex-col h-full items-center justify-center px-8 gap-8 max-w-md mx-auto w-full">
```
This is already centered. No change needed for step 0's outer layout — just add the illustration inside it.

---

### Task 2: Month Picker (AC2)

The current `BudgetNameStep` already has:
```tsx
<SelectContent side="bottom">
  {months.map((m) => (
    <SelectItem key={m} value={m}>
      {formatMonthLabel(m)}   {/* "April 2026", not "2026-04" */}
    </SelectItem>
  ))}
</SelectContent>
```

`pastTwelveMonths()` → `formatMonthLabel()` pipeline already produces "April 2026" format.
`side="bottom"` prevents overlap.

**Expected: no code change needed.** If `formatMonthLabel` is confirmed working and `side="bottom"` is present, AC2 is satisfied by the existing implementation. Write the test to confirm.

---

### Task 3: Illustrations (AC3)

All illustration components are **private functions** inside `OnboardingPage.tsx` — not exported, not in separate files. Keep the file simple; no new files needed.

Use `var(--color-sidebar-active)` = `#C0F500` as the illustration accent (same variable used for the app title in App.tsx). Use `rgba(192, 245, 0, 0.08)` for subtle background fills.

Add `data-testid="step-illustration"` to the outer container div of every illustration.

#### Welcome Illustration (step 0)

Brand mark: concentric circles + "GB" text. Place ABOVE the GarbanzoBeans title.

```tsx
function WelcomeIllustration() {
  return (
    <div data-testid="step-illustration" className="flex flex-col items-center">
      <svg viewBox="0 0 80 80" width="80" height="80" fill="none" aria-hidden="true">
        <circle cx="40" cy="40" r="36" stroke="var(--color-sidebar-active)" strokeWidth="2" opacity="0.25" />
        <circle cx="40" cy="40" r="24" fill="rgba(192,245,0,0.08)" />
        <text
          x="40" y="47"
          textAnchor="middle"
          fill="var(--color-sidebar-active)"
          fontSize="18"
          fontWeight="700"
          fontFamily="Roboto, sans-serif"
        >
          GB
        </text>
      </svg>
    </div>
  );
}
```

Updated welcome screen (step 0) JSX:
```tsx
if (step === 0) {
  return (
    <div className="flex flex-col h-full items-center justify-center px-8 gap-8 max-w-md mx-auto w-full">
      <WelcomeIllustration />
      <div className="flex flex-col gap-4 text-center">
        <h1 className="type-h1 font-bold" style={{ color: 'var(--color-sidebar-active)' }}>
          GarbanzoBeans
        </h1>
        <p className="type-body" style={{ color: 'var(--color-text-muted)' }} data-testid="welcome-description">
          A personal budget app that keeps your envelopes, ledger, and savings runway in one place.
        </p>
      </div>
      <Button size="lg" onClick={() => setStep(1)} data-testid="get-started-button">
        Get Started
      </Button>
    </div>
  );
}
```

#### Budget Illustration (step 1 — BudgetNameStep)

Envelope motif with "why" copy line. Place as FIRST element in StepShell children.

```tsx
function BudgetIllustration() {
  return (
    <div data-testid="step-illustration" className="flex flex-col items-center gap-2 text-center">
      <svg viewBox="0 0 80 56" width="80" height="56" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="78" height="54" rx="4"
          stroke="var(--color-sidebar-active)" strokeWidth="2"
          fill="rgba(192,245,0,0.06)" />
        <path d="M1 8 L40 30 L79 8"
          stroke="var(--color-sidebar-active)" strokeWidth="2" />
      </svg>
      <p className="type-label" style={{ color: 'var(--color-text-muted)', maxWidth: '22rem' }}>
        Your budget is personal — give it a name and pick the month it starts.
      </p>
    </div>
  );
}
```

Updated `BudgetNameStep` StepShell children:
```tsx
<StepShell step={1} onBack={onBack} onNext={onNext} nextDisabled={!budgetName.trim() || !startMonth}>
  <BudgetIllustration />
  <div className="w-full flex flex-col gap-6">
    {/* existing form fields unchanged */}
  </div>
</StepShell>
```

#### Data Folder Illustration (step 2 — DataFolderStep)

Folder with lock motif emphasising local-first. Place as FIRST element in StepShell children.

```tsx
function DataFolderIllustration() {
  return (
    <div data-testid="step-illustration" className="flex flex-col items-center gap-2 text-center">
      <svg viewBox="0 0 80 64" width="80" height="64" fill="none" aria-hidden="true">
        {/* Folder body */}
        <path
          d="M4 20 L4 56 Q4 60 8 60 L72 60 Q76 60 76 56 L76 24 Q76 20 72 20 L44 20 L36 12 L8 12 Q4 12 4 16 Z"
          stroke="var(--color-sidebar-active)" strokeWidth="2"
          fill="rgba(192,245,0,0.06)"
        />
        {/* Lock shackle */}
        <path d="M34 36 L34 31 Q34 26 40 26 Q46 26 46 31 L46 36"
          stroke="var(--color-sidebar-active)" strokeWidth="1.5" fill="none" />
        {/* Lock body */}
        <rect x="30" y="35" width="20" height="14" rx="2"
          stroke="var(--color-sidebar-active)" strokeWidth="1.5"
          fill="rgba(192,245,0,0.1)" />
      </svg>
      <p className="type-label" style={{ color: 'var(--color-text-muted)', maxWidth: '22rem' }}>
        Your data lives on your device — no cloud, no subscription, no sharing.
      </p>
    </div>
  );
}
```

Updated `DataFolderStep` StepShell children:
```tsx
<StepShell step={2} onBack={onBack} onNext={onNext} nextDisabled={!dataFolderPath}>
  <DataFolderIllustration />
  <div className="w-full flex flex-col gap-4">
    {/* existing form content unchanged */}
  </div>
</StepShell>
```

#### Savings Illustration (step 3 — SavingsTargetStep)

Arc gauge motif — preview of the RunwayGauge the user will see. Place as FIRST element in StepShell children.

The arc track is centered in a 100×58 viewBox. Track: grey semicircle. Fill: lime arc from left (180°) to ~65% (≈54° above horizontal). Endpoint calculation:
- Center: (50, 55), radius 40, angle 54° from horizontal
- x = 50 + 40×cos(54°) ≈ 73.5, y = 55 − 40×sin(54°) ≈ 22.6

```tsx
function SavingsIllustration() {
  return (
    <div data-testid="step-illustration" className="flex flex-col items-center gap-2 text-center">
      <svg viewBox="0 0 100 58" width="100" height="58" fill="none" aria-hidden="true">
        {/* Background track */}
        <path d="M 10 55 A 40 40 0 0 1 90 55"
          stroke="rgba(192,245,0,0.15)" strokeWidth="8" strokeLinecap="round" />
        {/* Filled arc — ~65% */}
        <path d="M 10 55 A 40 40 0 0 1 74 23"
          stroke="var(--color-sidebar-active)" strokeWidth="8" strokeLinecap="round" />
        {/* Progress dot */}
        <circle cx="74" cy="23" r="4" fill="var(--color-sidebar-active)" />
      </svg>
      <p className="type-label" style={{ color: 'var(--color-text-muted)', maxWidth: '22rem' }}>
        Set a savings goal — GarbanzoBeans tracks your runway month by month.
      </p>
    </div>
  );
}
```

---

### Task 4: Savings Copy Rewrite (AC4)

In `SavingsTargetStep`, change these three items:

| Location | Before | After |
|---|---|---|
| `<h2>` | `"Savings target"` | `"Set your savings goal"` |
| `<label>` text | `"What percentage of income do you want to save?"` | `"Target savings percentage"` |
| New `<p>` after h2 | (none) | `"We'll track your progress each month — this is a goal, not a hard limit."` |

Updated `SavingsTargetStep` content area:
```tsx
<div className="w-full flex flex-col gap-4">
  <h2 className="type-h2" style={{ color: 'var(--color-text-primary)' }}>
    Set your savings goal
  </h2>
  <p className="type-body" style={{ color: 'var(--color-text-muted)' }}>
    We'll track your progress each month — this is a goal, not a hard limit.
  </p>
  <div className="flex flex-col gap-1.5">
    <label
      htmlFor="savings-target"
      className="type-label"
      style={{ color: 'var(--color-text-muted)' }}
    >
      Target savings percentage
    </label>
    {/* Input and error display unchanged */}
  </div>
</div>
```

---

### Task 5: Tests

Extend `OnboardingPage.test.tsx` — do **not** replace existing describe blocks. The file already mocks `@tauri-apps/api/core` and `@tauri-apps/plugin-dialog`.

**Add to the top-level mock section:**
```tsx
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));
```

**Add new import after mocks:**
```tsx
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import OnboardingPage from '@/features/settings/OnboardingPage';
```

**Add new describe block at the bottom of the file:**
```tsx
describe('OnboardingPage component rendering', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, isWriting: false, isReadOnly: false, error: null });
    vi.clearAllMocks();
  });

  it('welcome screen (step 0) shows step illustration', () => {
    render(<OnboardingPage />);
    expect(screen.getByTestId('step-illustration')).toBeTruthy();
  });

  it('welcome screen shows Get Started button', () => {
    render(<OnboardingPage />);
    expect(screen.getByTestId('get-started-button')).toBeTruthy();
  });

  it('step 1 shows illustration after clicking Get Started', () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByTestId('get-started-button'));
    expect(screen.getByTestId('step-illustration')).toBeTruthy();
    expect(screen.getByTestId('budget-name-input')).toBeTruthy();
  });

  it('step 1 shows budget-name-input and start-month-select', () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByTestId('get-started-button'));
    expect(screen.getByTestId('budget-name-input')).toBeTruthy();
    expect(screen.getByTestId('start-month-select')).toBeTruthy();
  });

  it('step 3 renders aspirational savings heading', () => {
    render(<OnboardingPage />);
    // Advance to step 3: click Get Started, then Next twice (steps 1→2, 2→3)
    fireEvent.click(screen.getByTestId('get-started-button'));
    // Fill step 1 required fields so Next is enabled
    fireEvent.change(screen.getByTestId('budget-name-input'), { target: { value: 'Test Budget' } });
    // Open and select a month to enable Next on step 1
    // Note: Radix Select is hard to drive programmatically in jsdom — set state directly
    // Advance using the Next button is blocked by nextDisabled; drive via state instead
    // Alternative: test step 3 by setting internal step directly via sessionStorage
    sessionStorage.setItem('onboarding-state', JSON.stringify({
      step: 3, budgetName: 'Test', startMonth: '2026-04', dataFolderPath: '/tmp', savingsTarget: 10,
    }));
    const { unmount } = render(<OnboardingPage />);
    unmount();
    render(<OnboardingPage />);
    expect(screen.getByText(/Set your savings goal/i)).toBeTruthy();
  });

  it('step 3 subtext is not commitment-framed', () => {
    sessionStorage.setItem('onboarding-state', JSON.stringify({
      step: 3, budgetName: 'Test', startMonth: '2026-04', dataFolderPath: '/tmp', savingsTarget: 10,
    }));
    render(<OnboardingPage />);
    expect(screen.getByText(/goal, not a hard limit/i)).toBeTruthy();
  });

  it('step 3 shows savings illustration', () => {
    sessionStorage.setItem('onboarding-state', JSON.stringify({
      step: 3, budgetName: 'Test', startMonth: '2026-04', dataFolderPath: '/tmp', savingsTarget: 10,
    }));
    render(<OnboardingPage />);
    expect(screen.getByTestId('step-illustration')).toBeTruthy();
  });

  afterEach(() => {
    sessionStorage.clear();
  });
});
```

**Testing Radix Select display values:** Radix `SelectItem` renders the text content into a `[role="option"]` element in the DOM (even when the dropdown is closed, in some versions). As an alternative to opening the dropdown, check the `SelectValue` placeholder vs. rendered option text. If Radix Select proves hard to assert in jsdom, the AC2 test can verify that `formatMonthLabel('2026-04')` returns "April 2026" (a unit test on the utility function) rather than UI rendering.

---

### Architecture Patterns

- **Inline SVG only** — no external assets, no new files; all illustration SVGs are private JSX functions within `OnboardingPage.tsx`
- **`var(--color-sidebar-active)`** for all SVG strokes/fills — this is `#C0F500`, the project-wide lime accent; same variable used by App.tsx title and existing OnboardingPage welcome h1
- **`aria-hidden="true"`** on all decorative SVGs — they are purely visual; the step heading already describes context
- **`data-testid="step-illustration"`** on all illustration container divs — consistent test handle across all 4 screens
- **No new dependencies** — no shadcn calendar component, no icon library; keep it simple
- **No new Tauri commands** — pure frontend polish
- **No route changes** — `/onboarding` route and its guards are unchanged
- **sessionStorage logic unchanged** — the crash-recovery/mid-flow-restore mechanism (already implemented) must not be touched
- **`nextDisabled` validation logic unchanged** — form field validation rules for each step are unchanged

### File Structure

Two files only:
```
src/
  features/settings/
    OnboardingPage.tsx       ← StepShell refactor + 4 illustration functions + copy changes
    OnboardingPage.test.tsx  ← Add 7 new component rendering tests (extend; do not replace existing)
```

### Key Constraints

- **Do not modify** `handleFinalConfirm`, sessionStorage restore logic, `step` state machine, or any `StepProps` interfaces beyond adding illustration content inside the children
- **`data-testid` values must remain unchanged**: `get-started-button`, `budget-name-input`, `start-month-select`, `browse-button`, `selected-folder-path`, `savings-target-input`, `onboarding-error`, `welcome-description` — these are referenced in existing tests and potentially e2e specs
- **StepShell nav buttons** already receive all required props (`onBack`, `onNext`, `nextLabel`, `nextDisabled`, `isLoading`) — these are unchanged; only the layout wrapper changes
- **`BorrowOverlay.test.tsx` failures (13 tests)** are pre-existing regressions unrelated to this story — ignore if they appear in test runs

### Previous Story Learnings

- **Story 7.5**: `vi.mock` at the top of the test file with factory functions; `vi.clearAllMocks()` in `beforeEach`; `@testing-library/react` `render`+`screen` for component tests; `fireEvent.click` for interactions
- **Story 7.3**: `useSettingsStore.setState(...)` directly in `beforeEach` works reliably for store state setup; no need to mock the store itself
- **Story 7.4**: Radix Select internals are tricky in jsdom — prefer `getByTestId` over role-based queries for Select components
- **Story 1.5 deferred**: `pastTwelveMonths` uses local time; one-month edge case at midnight/month boundary. Acceptable risk; do not change the function

### References

- [OnboardingPage.tsx:36-73](src/features/settings/OnboardingPage.tsx) — StepShell: current 3-part layout to refactor (lines 46-72)
- [OnboardingPage.tsx:86-155](src/features/settings/OnboardingPage.tsx) — BudgetNameStep: add BudgetIllustration as first child inside StepShell
- [OnboardingPage.tsx:166-224](src/features/settings/OnboardingPage.tsx) — DataFolderStep: add DataFolderIllustration as first child
- [OnboardingPage.tsx:237-304](src/features/settings/OnboardingPage.tsx) — SavingsTargetStep: add SavingsIllustration, rewrite h2/label/subtext
- [OnboardingPage.tsx:372-398](src/features/settings/OnboardingPage.tsx) — Step 0 JSX: add WelcomeIllustration above title block
- [OnboardingPage.test.tsx:1-139](src/features/settings/OnboardingPage.test.tsx) — Existing mocks and describe blocks; extend at the bottom
- [RunwayGauge.tsx:3-9](src/features/savings/RunwayGauge.tsx) — SVG arc math reference; same `M cx-r cy A r r 0 0 1 cx+r cy` pattern
- [App.tsx:62](src/App.tsx) — `var(--color-sidebar-active)` usage reference for accent color
- [styles.css:14](src/styles.css) — `--color-sidebar-active: #C0F500` definition

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

Initial `vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))` broke `createRootRoute` used by `@/router`. Fixed by using `importOriginal` to spread actual module and only override `useNavigate`.

### Completion Notes List

- Task 1 (AC1): StepShell refactored from 3-part sticky layout to single `flex flex-col h-full items-center justify-center` outer div with `w-full max-w-md flex flex-col gap-4` inner block. Step counter and nav are now part of the centered unit.
- Task 2 (AC2): Confirmed `formatMonthLabel` in use for SelectItem display and `SelectContent side="bottom"` present. No code change needed — existing implementation already satisfies AC2.
- Task 3 (AC3): Added 4 private SVG illustration functions (WelcomeIllustration, BudgetIllustration, DataFolderIllustration, SavingsIllustration) all using `var(--color-sidebar-active)` accent and `data-testid="step-illustration"`. Placed in each step: Welcome above title block, Budget/DataFolder/Savings as first children in their StepShell.
- Task 4 (AC4): Savings step h2 → "Set your savings goal"; added subtext "We'll track your progress each month — this is a goal, not a hard limit."; label → "Target savings percentage".
- Task 5: 7 new component rendering tests added. All 12 tests in file pass. Full suite: 475 passed, 13 pre-existing BorrowOverlay failures (unrelated).

### File List

- src/features/settings/OnboardingPage.tsx
- src/features/settings/OnboardingPage.test.tsx

### Change Log

- 2026-04-09: Story 7.6 created — onboarding UX uplift: centering, month picker verification, step illustrations, aspirational savings copy.
- 2026-04-09: Story 7.6 implemented — StepShell centering refactor, 4 SVG illustrations, savings copy rewrite, 7 new component tests. All ACs satisfied.
