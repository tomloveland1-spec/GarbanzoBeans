# Story 7.5: Turn the Month — Graceful Escape

Status: done

## Story

As Tom,
I want to be able to defer the Turn the Month ceremony without being locked out of the app,
So that I can finish entering transactions before closing the month.

## Acceptance Criteria

1. **Given** Turn the Month wizard is active (month status is `closing:step-1` through `closing:step-4`) / **When** any wizard step renders / **Then** a "Not yet — finish later" button or link is visible; clicking it dismisses the wizard and returns Tom to the Budget screen.

2. **Given** Tom dismisses the wizard via "Not yet" / **When** the app is in normal use / **Then** the month status remains `closing:step-N` (not reset); a persistent but non-blocking prompt appears in the sidebar reminding Tom to complete the ceremony; the prompt includes a "Continue" link that navigates to `/turn-the-month`.

3. **Given** Tom re-opens the wizard via the persistent prompt / **When** the wizard renders / **Then** it resumes at the step where Tom left off (derived from `monthStatus`); no data is lost; all previously confirmed entries are preserved.

4. **Given** Tom is in a `closing:step-N` state but has not yet finished TTM / **When** he navigates to Ledger, Rules, or Settings / **Then** he can do so freely; the `guardTurnTheMonth` redirect does NOT force him back to the wizard; the persistent sidebar prompt remains visible.

## Tasks / Subtasks

- [x] Remove `guardTurnTheMonth()` from route `beforeLoad` calls — allow free navigation during closing state (AC: #4)
  - [x] Remove `guardTurnTheMonth()` from `budgetRoute.beforeLoad` in `src/router.tsx`
  - [x] Remove `guardTurnTheMonth()` from `ledgerRoute.beforeLoad` in `src/router.tsx`
  - [x] Remove `guardTurnTheMonth()` from `merchantRulesRoute.beforeLoad` in `src/router.tsx`
  - [x] Remove `guardTurnTheMonth()` from `allocationRoute.beforeLoad` in `src/router.tsx`
  - [x] Keep the guard that redirects `/turn-the-month` → `/` when NOT in closing state (unchanged)
  - [x] Keep `guardTurnTheMonth` function in file (will be used by nothing — safe to delete the function body too)

- [x] Add `onDismiss` prop to `TurnTheMonthStepper` and render "Not yet — finish later" button (AC: #1)
  - [x] Add optional `onDismiss?: () => void` to `TurnTheMonthStepperProps` interface
  - [x] Render a "Not yet — finish later" text button below the navigation row when `onDismiss` is provided
  - [x] The button must NOT be disabled when `isWriting` (dismissal is always available)
  - [x] Style: small, muted text link appearance — `type-label`, `var(--color-text-muted)`, no border, `cursor: pointer`

- [x] Add dismiss handler to `TurnTheMonthWizard` and wire to stepper (AC: #1)
  - [x] Add `handleDismiss` function: calls `navigate({ to: '/' })` — NO store action, month status untouched
  - [x] Pass `handleDismiss` as `onDismiss` prop to `<TurnTheMonthStepper>`

- [x] Add persistent TTM prompt to `App.tsx` sidebar (AC: #2, #3)
  - [x] Import `useMonthStore` in `App.tsx`
  - [x] Subscribe to `monthStatus`: `const monthStatus = useMonthStore((s) => s.monthStatus)`
  - [x] When `monthStatus.startsWith('closing:')`, render a prompt block at the bottom of the sidebar `<nav>` section
  - [x] Prompt content: small label "Turn the Month pending" and a `<Link to="/turn-the-month">` with text "Continue →"
  - [x] The prompt must be visible on all screens (Budget, Ledger, Rules, Settings) — sidebar is always rendered for non-onboarding routes
  - [x] Prompt must NOT appear on `/onboarding` (sidebar is already hidden there)
  - [x] Style: consistent with sidebar; accent color for the Continue link (`var(--color-sidebar-active)` = `var(--color-accent)`)
  - [x] Add `data-testid="ttm-resume-prompt"` to the prompt container

- [x] Update tests for `TurnTheMonthStepper` (AC: #1)
  - [x] Add test: "Not yet button absent when onDismiss is undefined"
  - [x] Add test: "Not yet button visible when onDismiss is provided"
  - [x] Add test: "clicking Not yet calls onDismiss"
  - [x] Add test: "Not yet button is NOT disabled when isWriting=true"

- [x] Update tests for `TurnTheMonthWizard` (AC: #1)
  - [x] Add test: "Not yet button visible in wizard"
  - [x] Add test: "clicking Not yet navigates to / without calling any store action"

- [x] Add tests for TTM sidebar prompt (AC: #2, #4)
  - [x] Create `src/App.test.tsx` (no existing file)
  - [x] Mock `useMonthStore`, `useSettingsStore`, `useUpdateStore`, and `@tanstack/react-router`
  - [x] Add test: "TTM prompt not shown when monthStatus is 'open'"
  - [x] Add test: "TTM prompt shown when monthStatus is 'closing:step-1'"
  - [x] Add test: "TTM prompt shown when monthStatus is 'closing:step-3'"
  - [x] Add test: "TTM prompt link navigates to /turn-the-month" (verify the `to` prop)

## Dev Notes

### What's Changing and Why

The current app forces Tom into the TTM wizard the moment `monthStatus.startsWith('closing:')` — there is no escape. This story adds:

1. A dismiss button inside the wizard
2. A persistent sidebar prompt as a reminder/re-entry point
3. Removal of route guards that block navigation during closing state

**Month status is NEVER reset by this story.** `closing:step-N` persists in the DB; the wizard resumes from the correct step on re-entry because `TurnTheMonthWizard` already derives `dbStep` from `monthStatus` (line 75–77 in `TurnTheMonthWizard.tsx`). Crash recovery already works — graceful escape reuses the same mechanism.

---

### Task 1: Remove Route Guards (router.tsx)

**Current state** (`src/router.tsx`):
```ts
// budgetRoute, ledgerRoute, merchantRulesRoute, allocationRoute all have:
beforeLoad: () => {
  guardOnboarding();
  guardTurnTheMonth();  // ← REMOVE this line from all four routes
},
```

`settingsRoute` already lacks `guardTurnTheMonth()` — leave it as-is (already correct).

After removal, `guardTurnTheMonth` function is dead code. You may delete the function body. The `/turn-the-month` route's own guard (redirects to `/` when NOT closing) must stay.

**Note:** The `allocationRoute` additionally has `guardReadOnly()` — keep that, remove only the TTM guard.

---

### Task 2 & 3: TurnTheMonthStepper + TurnTheMonthWizard

**`TurnTheMonthStepper.tsx` changes:**

Add `onDismiss?: () => void` to the props interface and render a "Not yet — finish later" link below the nav buttons:

```tsx
interface TurnTheMonthStepperProps {
  // ... existing props ...
  onDismiss?: () => void;  // ← add
}

// In the JSX, after the navigation buttons div:
{onDismiss && (
  <div style={{ textAlign: 'center', marginTop: '1rem' }}>
    <button
      onClick={onDismiss}
      className="type-label"
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--color-text-muted)',
        cursor: 'pointer',
        textDecoration: 'underline',
      }}
    >
      Not yet — finish later
    </button>
  </div>
)}
```

**Important:** The "Not yet" button should NOT be wrapped in any `disabled={isWriting}` check. Tom must always be able to escape.

**`TurnTheMonthWizard.tsx` changes:**

Add `handleDismiss` and pass it as prop:

```tsx
const handleDismiss = () => {
  navigate({ to: '/' });
  // DO NOT call any store action — monthStatus stays at closing:step-N
};

// In return:
<TurnTheMonthStepper
  // ... existing props ...
  onDismiss={handleDismiss}
>
```

---

### Task 4: Sidebar Prompt in App.tsx

**`App.tsx` changes:**

```tsx
import { useMonthStore } from '@/stores/useMonthStore';  // ← add import

// In the App component body (alongside isReadOnly):
const monthStatus = useMonthStore((s) => s.monthStatus);

// In the sidebar <nav>, after the existing NAV_ITEMS map:
{monthStatus.startsWith('closing:') && (
  <div
    data-testid="ttm-resume-prompt"
    style={{
      marginTop: 'auto',
      paddingTop: '1rem',
      borderTop: '1px solid var(--color-border)',
    }}
  >
    <p
      className="type-label"
      style={{ color: 'var(--color-text-muted)', paddingLeft: '0.75rem', marginBottom: '0.25rem' }}
    >
      Turn the Month pending
    </p>
    <Link
      to="/turn-the-month"
      className="sidebar-interactive text-left px-3 py-2 rounded-md type-body transition-colors"
      style={{ color: 'var(--color-sidebar-active)', display: 'block' }}
    >
      Continue →
    </Link>
  </div>
)}
```

**Important placement:** The prompt should be inside the `<aside>` after the `<nav>`. The `<aside>` is `flex-column` so add `marginTop: 'auto'` to push it to the bottom, or just append it after the nav section. Either works — bottom of sidebar is a good location.

**`useMonthStore` selector pattern:** Use `useMonthStore((s) => s.monthStatus)` — selector form, not `useMonthStore()`. This matches the pattern in `TurnTheMonthWizard.tsx` and avoids re-renders on unrelated store changes.

---

### Task 5 & 6: Test Updates

**`TurnTheMonthStepper.test.tsx` additions:**

```tsx
it('Not yet button absent when onDismiss is undefined', () => {
  renderStepper({ onDismiss: undefined });
  expect(screen.queryByText('Not yet — finish later')).toBeNull();
});

it('Not yet button visible when onDismiss is provided', () => {
  renderStepper({ onDismiss: vi.fn() });
  expect(screen.getByText('Not yet — finish later')).toBeTruthy();
});

it('clicking Not yet calls onDismiss', () => {
  const onDismiss = vi.fn();
  renderStepper({ onDismiss });
  fireEvent.click(screen.getByText('Not yet — finish later'));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it('Not yet button is NOT disabled when isWriting=true', () => {
  const onDismiss = vi.fn();
  renderStepper({ onDismiss, isWriting: true });
  const btn = screen.getByText('Not yet — finish later') as HTMLButtonElement;
  expect(btn.disabled).toBe(false);
});
```

**`TurnTheMonthWizard.test.tsx` additions:**

```tsx
it('Not yet button is visible in the wizard', () => {
  setStoreState({ monthStatus: 'closing:step-1' });
  render(<TurnTheMonthWizard />);
  expect(screen.getByText('Not yet — finish later')).toBeTruthy();
});

it('clicking Not yet navigates to / without calling any store action', async () => {
  const advanceStep = vi.fn();
  const closeMonth = vi.fn();
  const confirmBillDates = vi.fn();
  const confirmIncomeTiming = vi.fn();
  setStoreState({ monthStatus: 'closing:step-1', advanceStep, closeMonth, confirmBillDates, confirmIncomeTiming });
  render(<TurnTheMonthWizard />);
  fireEvent.click(screen.getByText('Not yet — finish later'));
  expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
  expect(advanceStep).not.toHaveBeenCalled();
  expect(closeMonth).not.toHaveBeenCalled();
  expect(confirmBillDates).not.toHaveBeenCalled();
  expect(confirmIncomeTiming).not.toHaveBeenCalled();
});
```

**`App.test.tsx` — new file:**

The `App.tsx` component depends on multiple stores and the router. Pattern: mock all stores and use a lightweight router wrapper.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockLocationPathname = vi.fn(() => '/');
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) =>
    <a href={to} {...rest}>{children}</a>,
  Outlet: () => <div data-testid="outlet" />,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: mockLocationPathname() } }),
}));

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ isReadOnly: false }),
}));

vi.mock('@/stores/useUpdateStore', () => ({
  useUpdateStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({ pendingUpdate: null, isDismissed: false, isInstalling: false, installError: null, dismissUpdate: vi.fn(), applyUpdate: vi.fn() }),
    { getState: vi.fn(() => ({ checkForUpdate: vi.fn() })) },
  ),
}));

const mockMonthStatus = vi.fn(() => 'open');
vi.mock('@/stores/useMonthStore', () => ({
  useMonthStore: (selector: (s: unknown) => unknown) =>
    selector({ monthStatus: mockMonthStatus() }),
}));

import App from './App';

describe('App TTM resume prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationPathname.mockReturnValue('/');
    mockMonthStatus.mockReturnValue('open');
  });

  it('TTM prompt not shown when monthStatus is open', () => {
    mockMonthStatus.mockReturnValue('open');
    render(<App />);
    expect(screen.queryByTestId('ttm-resume-prompt')).toBeNull();
  });

  it('TTM prompt shown when monthStatus is closing:step-1', () => {
    mockMonthStatus.mockReturnValue('closing:step-1');
    render(<App />);
    expect(screen.getByTestId('ttm-resume-prompt')).toBeTruthy();
    expect(screen.getByText('Turn the Month pending')).toBeTruthy();
  });

  it('TTM prompt shown when monthStatus is closing:step-3', () => {
    mockMonthStatus.mockReturnValue('closing:step-3');
    render(<App />);
    expect(screen.getByTestId('ttm-resume-prompt')).toBeTruthy();
  });

  it('TTM prompt Continue link points to /turn-the-month', () => {
    mockMonthStatus.mockReturnValue('closing:step-2');
    render(<App />);
    const link = screen.getByText('Continue →') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/turn-the-month');
  });
});
```

---

### Architecture Patterns

- **Selector form for stores in App.tsx:** `useMonthStore((s) => s.monthStatus)` — never `useMonthStore()` (whole-state subscription causes unnecessary re-renders on any store change)
- **No new Tauri commands:** Dismissal is pure navigation; TTM state is managed by the existing `useMonthStore`
- **No new routes or route changes:** `/turn-the-month` route is unchanged; only route `beforeLoad` guards are modified
- **`Link` from `@tanstack/react-router`:** App.tsx already uses `Link` for nav items — use the same pattern for the Continue link in the sidebar prompt
- **`navigate` in wizard:** `TurnTheMonthWizard.tsx` already imports `useNavigate` from `@tanstack/react-router` — no new imports needed

### File Structure

Four files change; one new file:
```
src/
  App.tsx                                    ← add useMonthStore import + sidebar TTM prompt
  App.test.tsx                               ← NEW — sidebar prompt tests
  router.tsx                                 ← remove guardTurnTheMonth() calls from 4 routes
  features/month/
    TurnTheMonthStepper.tsx                  ← add onDismiss? prop + "Not yet" button
    TurnTheMonthStepper.test.tsx             ← 4 new tests
    TurnTheMonthWizard.tsx                   ← add handleDismiss + pass onDismiss prop
    TurnTheMonthWizard.test.tsx              ← 2 new tests
```

### Key Constraints

- **Month status is NEVER modified by this story** — `handleDismiss` calls only `navigate({ to: '/' })`; no `advanceStep`, `closeMonth`, `confirmBillDates`, or `confirmIncomeTiming` calls
- **Resume is crash-recovery-compatible** — `dbStep` is derived from `monthStatus` at render time; re-entering the wizard always resumes at the correct step regardless of how the user left
- **The Escape key block in `TurnTheMonthStepper.tsx` is unrelated** — it prevents accidental Escape key dismissal; our "Not yet" button is intentional UI, not a keyboard shortcut. Keep the Escape block as-is
- **`guardTurnTheMonth` deletion:** Deleting the function entirely is fine — nothing will reference it after removing the calls. However, if you prefer, you can leave the function body and just remove the calls from the beforeLoad handlers
- **`allocationRoute` still has `guardReadOnly()`** — only remove `guardTurnTheMonth()`, keep the read-only guard

### Previous Story Learnings (Story 7.4)

- "Verify existing implementation first, then add missing code" — The wizard's `dbStep` derivation and crash-recovery already work; this story adds dismissal around that, not replacement of it
- `vi.mock` store patterns: mock at the top of the file with a factory function; use a helper to adjust state between tests (see `setStoreState` pattern in `TurnTheMonthWizard.test.tsx`)
- `BorrowOverlay.test.tsx` failures (13 tests) are pre-existing and unrelated — ignore if they appear in the test run

### References

- [TurnTheMonthWizard.tsx:70-158](src/features/month/TurnTheMonthWizard.tsx) — wizard container; `dbStep` derivation at line 75–77; `handleContinue` + `navigate` already imported
- [TurnTheMonthStepper.tsx:1-111](src/features/month/TurnTheMonthStepper.tsx) — stepper shell; Escape key block at line 25–34; nav buttons at line 73–107
- [TurnTheMonthWizard.test.tsx:1-221](src/features/month/TurnTheMonthWizard.test.tsx) — existing tests; `setStoreState` pattern; `mockNavigate` setup
- [TurnTheMonthStepper.test.tsx:1-81](src/features/month/TurnTheMonthStepper.test.tsx) — existing tests; `renderStepper` helper
- [router.tsx:44-51](src/router.tsx) — `guardTurnTheMonth()` function; lines 84–148 show the four route beforeLoads to modify
- [App.tsx:1-156](src/App.tsx) — sidebar structure (line 49–85); existing banner pattern (line 93–105); `Link` import already present
- [useMonthStore.ts:1-133](src/stores/useMonthStore.ts) — `monthStatus` in store state

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- App.test.tsx: `useUpdateStore` mock needed optional selector handling — App calls the store with no args (destructured), not selector form. Fixed by making the mock return full state when called without arguments.

### Completion Notes List

- ✅ Removed `guardTurnTheMonth()` from budgetRoute, ledgerRoute, merchantRulesRoute, allocationRoute beforeLoad handlers. Function body deleted — nothing calls it. turnTheMonthRoute guard (redirects away when NOT closing) preserved.
- ✅ Added `onDismiss?: () => void` prop to TurnTheMonthStepper; renders "Not yet — finish later" button below nav row when provided; never disabled by isWriting.
- ✅ Added `handleDismiss` to TurnTheMonthWizard: calls `navigate({ to: '/' })` only — no store action, monthStatus untouched at closing:step-N.
- ✅ Added TTM resume prompt to App.tsx sidebar: visible when monthStatus.startsWith('closing:'), hidden on onboarding (sidebar not rendered), with Continue → link to /turn-the-month.
- ✅ 10 new tests added across 3 test files; all pass. BorrowOverlay 13 failures are pre-existing.

### File List

- src/App.tsx
- src/App.test.tsx
- src/router.tsx
- src/features/month/TurnTheMonthStepper.tsx
- src/features/month/TurnTheMonthStepper.test.tsx
- src/features/month/TurnTheMonthWizard.tsx
- src/features/month/TurnTheMonthWizard.test.tsx

### Review Findings

- [x] [Review][Decision→Patch] Step 4 dismiss silently drops `pendingAllocations` — Added `window.confirm('Your allocation entries will be lost — continue?')` guard in `handleDismiss` when `viewStep === TOTAL_STEPS && pendingAllocations.length > 0`. 3 new tests added. [src/features/month/TurnTheMonthWizard.tsx:127]
- [x] [Review][Patch] Sidebar prompt visible while already on `/turn-the-month` — Added `isOnTTMRoute` from `useRouterState` and `!isOnTTMRoute` to prompt conditional. 1 new test added. [src/App.tsx:21]
- [x] [Review][Defer] "Not yet" during active `isWriting` races in-flight Tauri command [src/features/month/TurnTheMonthStepper.tsx] — deferred, intentional by spec (button must never be disabled during isWriting)

### Change Log

- 2026-04-09: Story 7.5 created — graceful escape from TTM wizard; persistent sidebar prompt; route guard relaxation.
- 2026-04-09: Implemented — route guards removed, dismiss button added, sidebar prompt added, 10 new tests all passing.
- 2026-04-09: Code review complete — 1 decision-needed, 1 patch, 1 deferred, 7 dismissed.
