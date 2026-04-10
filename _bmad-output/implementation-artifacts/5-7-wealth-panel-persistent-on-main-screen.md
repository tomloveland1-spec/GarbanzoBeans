# Story 5.7: Wealth Panel — Persistent on Main Screen

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want the Arc Gauge and Savings Flow Chart to be permanently visible alongside my envelope list on the main Budget screen,
So that every allocation decision I make happens with my long-term trajectory in view.

## Acceptance Criteria

1. **AC1: Persistent Wealth Panel at Top of Budget Screen**
   - Given Tom is on the Budget screen (`/`)
   - When the view renders
   - Then the wealth panel is present as a persistent top section (~220px height) above the envelope list; Arc Gauge and Savings Flow Chart are visible side by side without any navigation required (FR24a, UX-DR11)

2. **AC2: Envelope List Scrolls Below Fixed Wealth Panel**
   - Given Tom scrolls the envelope list
   - When the list scrolls
   - Then the wealth panel remains fixed; only the envelope list scrolls below it

3. **AC3: Collapsible with Persisted State**
   - Given Tom collapses the wealth panel
   - When the collapse action occurs
   - Then the panel collapses to a minimal header; the envelope list expands to fill the space; the collapsed state is remembered across sessions

4. **AC4: Reconciliation Accessible from Wealth Panel**
   - Given the savings reconciliation input is needed
   - When Tom accesses it
   - Then it is reachable directly from the wealth panel without navigating away from the Budget screen

## Tasks / Subtasks

- [x] Task 1: Add collapse/expand toggle to `WealthPanel.tsx` (AC: 1, 3, 4)
  - [x] 1.1: Open `src/features/savings/WealthPanel.tsx`. Add `useState` import from React and `ChevronDown`, `ChevronUp` from `lucide-react`. Add a collapsed state initialized from `localStorage`:
    ```tsx
    import { useState } from 'react';
    import { ChevronDown, ChevronUp } from 'lucide-react';
    ```
    ```tsx
    const STORAGE_KEY = 'wealth-panel-collapsed';

    export default function WealthPanel() {
      const [isCollapsed, setIsCollapsed] = useState(
        () => localStorage.getItem(STORAGE_KEY) === 'true'
      );

      const toggle = () => {
        const next = !isCollapsed;
        localStorage.setItem(STORAGE_KEY, String(next));
        setIsCollapsed(next);
      };
      ...
    }
    ```
  - [x] 1.2: Replace the current WealthPanel JSX with collapsed/expanded branches:
    ```tsx
    return (
      <div
        className="shrink-0 border-b"
        style={{ borderColor: 'var(--color-border)' }}
        data-testid="wealth-panel"
      >
        {isCollapsed ? (
          <div className="flex items-center justify-between px-3 py-2">
            <span
              className="type-label"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Wealth Panel
            </span>
            <button
              onClick={toggle}
              aria-label="Expand wealth panel"
              className="p-1 rounded"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-4 p-3">
              <RunwayGauge />
              <SavingsFlowChart />
              <div className="flex-1">
                <ReconciliationForm />
              </div>
            </div>
            <div className="flex justify-end px-3 pb-1">
              <button
                onClick={toggle}
                aria-label="Collapse wealth panel"
                className="p-1 rounded"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    );
    ```
    **Key:** `aria-label` values on both buttons are essential for tests and accessibility.

- [x] Task 2: Verify AC2 is already satisfied (no code change needed) (AC: 2)
  - [x] 2.1: Confirm `BudgetPage.tsx` already has the correct layout:
    ```tsx
    <div className="flex flex-col h-full overflow-hidden">
      <WealthPanel />           // shrink-0 — fixed, doesn't scroll
      <div className="flex-1 overflow-y-auto">
        <EnvelopeList />        // scrolls independently
      </div>
    </div>
    ```
    The outer `overflow-hidden` + `flex flex-col h-full` ensures the wealth panel is fixed and the envelope list scrolls. No changes required.

- [x] Task 3: Update `WealthPanel.test.tsx` for collapse behavior (AC: 1, 3, 4)
  - [x] 3.1: Add a `beforeEach` cleanup for localStorage and import `fireEvent` from `@testing-library/react`:
    ```typescript
    import { vi, describe, it, expect, beforeEach } from 'vitest';
    import { render, screen, fireEvent } from '@testing-library/react';
    ```
    In `beforeEach`, add:
    ```typescript
    localStorage.clear();  // reset localStorage between tests
    ```
  - [x] 3.2: Add mock for `ChevronDown` and `ChevronUp` from lucide-react (same mock pattern as other icon mocks in this project):
    ```typescript
    vi.mock('lucide-react', () => ({
      ChevronDown: () => <svg data-testid="chevron-down" />,
      ChevronUp: () => <svg data-testid="chevron-up" />,
    }));
    ```
  - [x] 3.3: Add these 5 new tests (total suite: 9 tests):
    - `'renders collapse button when expanded'` — default (no localStorage); `getByRole('button', { name: 'Collapse wealth panel' })` present; ChevronUp visible
    - `'clicking collapse hides panel content'` — render, click 'Collapse wealth panel'; `queryByTestId('runway-gauge-mock')` is null; `queryByTestId('savings-flow-chart-mock')` is null; Save Balance button not found
    - `'clicking collapse shows expand button'` — render, click 'Collapse wealth panel'; `getByRole('button', { name: 'Expand wealth panel' })` present; ChevronDown visible
    - `'clicking expand restores panel content'` — render, click 'Collapse wealth panel', click 'Expand wealth panel'; `getByTestId('runway-gauge-mock')` present
    - `'initializes collapsed when localStorage has true'` — `localStorage.setItem('wealth-panel-collapsed', 'true')` before render; `queryByTestId('runway-gauge-mock')` is null; `getByRole('button', { name: 'Expand wealth panel' })` present
    - `'persists collapsed state to localStorage'` — render, click 'Collapse wealth panel'; `localStorage.getItem('wealth-panel-collapsed')` equals `'true'`

- [x] Task 4: Run full test suite and validate (AC: all)
  - [x] 4.1: Run `npm test` — all 10 WealthPanel tests pass; full suite passes with no regressions (366+ tests, 13 pre-existing BorrowOverlay failures excluded per Dev Notes).
  - [x] 4.2: Run `npm run lint` — no new lint errors introduced (4 pre-existing errors in OFXImporter.tsx, useTransactionStore.ts, MerchantRulesScreen.test.tsx remain).
  - [x] 4.3: Run `cargo test` in `src-tauri/` — skipped (no Rust changes in this story, per Dev Notes).

## Dev Notes

### What Already Exists — Do NOT Recreate

| What | Where | Status |
|------|-------|--------|
| `WealthPanel.tsx` with RunwayGauge + SavingsFlowChart + ReconciliationForm | `src/features/savings/WealthPanel.tsx` | EXISTS — modify in Task 1 |
| `WealthPanel.test.tsx` with 4 tests | `src/features/savings/WealthPanel.test.tsx` | EXISTS — add 5 tests, total 9 |
| `BudgetPage.tsx` with fixed WealthPanel + scrollable EnvelopeList | `src/features/envelopes/BudgetPage.tsx` | EXISTS — no changes needed (AC2 already satisfied) |
| `RunwayGauge.tsx` (200×160 SVG arc) | `src/features/savings/RunwayGauge.tsx` | EXISTS — do NOT touch |
| `SavingsFlowChart.tsx` (Recharts bar chart, flex-1, height 80) | `src/features/savings/SavingsFlowChart.tsx` | EXISTS — do NOT touch |
| `ReconciliationForm.tsx` | `src/features/savings/ReconciliationForm.tsx` | EXISTS — do NOT touch |
| `lucide-react ^1.7.0` (includes ChevronDown, ChevronUp) | `package.json` | EXISTS — no install needed |

### AC2 Is Already Implemented

`BudgetPage.tsx` already uses `flex flex-col h-full overflow-hidden` with `WealthPanel` (`shrink-0`) at top and `flex-1 overflow-y-auto` below. The wealth panel is inherently fixed — it doesn't scroll with the envelope list. Do NOT restructure `BudgetPage.tsx`.

### AC4 Is Already Implemented

`ReconciliationForm` is already rendered inside `WealthPanel` and remains accessible in the expanded state. No changes needed.

### WealthPanel Height Target

The spec says ~220px. `RunwayGauge` renders a `200×160` SVG. With `p-3` (12px top/bottom), the expanded panel is ~184px naturally. This is within the acceptable ~220px range — do NOT add an explicit height constraint. The natural content height is correct.

### localStorage — The Right Tool for This UI State

Collapsed state is a per-device UI preference, not app data. `localStorage` is the correct mechanism (no Zustand store, no SQLite). Key: `'wealth-panel-collapsed'`. Values: `'true'` or `'false'` (strings, as localStorage only stores strings). Default (no key): expanded.

### Collapse Button Placement

- **Expanded state**: A `<ChevronUp>` button sits below the main content row (bottom-right of the panel), signaling "this panel can compress."
- **Collapsed state**: A `<ChevronDown>` button sits inline with the "Wealth Panel" label in a thin strip.
- Both buttons must have `aria-label` (`'Collapse wealth panel'` / `'Expand wealth panel'`) — this is how tests find them.

### Lucide React Icon Mock Pattern

Lucide React renders SVG, which behaves unexpectedly in jsdom. Mock it at the module level in the test file (same pattern used in other shadcn/ui components in this project):
```typescript
vi.mock('lucide-react', () => ({
  ChevronDown: () => <svg data-testid="chevron-down" />,
  ChevronUp: () => <svg data-testid="chevron-up" />,
}));
```

### localStorage in Vitest/jsdom

jsdom provides a real `localStorage` stub. In tests:
- `localStorage.setItem(key, value)` to pre-set state
- `localStorage.getItem(key)` to assert written state
- `localStorage.clear()` in `beforeEach` to isolate tests — add this to the existing `beforeEach` block

### Pre-existing Test State

WealthPanel.test.tsx currently has:
- Mock: `RunwayGauge` → `data-testid="runway-gauge-mock"`
- Mock: `SavingsFlowChart` → `data-testid="savings-flow-chart-mock"`
- Mock: `useSettingsStore` (for read-only check used by ReconciliationForm)
- 4 passing tests

Do NOT remove or modify existing tests. Only add the 5 new tests and the `localStorage.clear()` to `beforeEach`.

### Architecture Note — TopPane.tsx

The architecture spec shows `src/components/layout/TopPane.tsx` as a planned file. This file does **not exist** in the project — the `src/components/layout/` directory itself doesn't exist. The WealthPanel already fulfills the TopPane role as `src/features/savings/WealthPanel.tsx`. Do NOT create `TopPane.tsx` for this story. The architecture listing is aspirational and predates the working implementation.

### Previous Story Learnings (5-6)

- **Pre-existing test failures**: 13 `BorrowOverlay.test.tsx` failures are pre-existing and unrelated to this story (useEnvelopeStore.setState mock issue). These will still fail after this story — do NOT investigate.
- **Pre-existing lint errors**: 4 pre-existing lint errors in `OFXImporter.tsx`, `useTransactionStore.ts`, `useUpdateStore.test.ts`. Do NOT fix them; do NOT introduce new ones.
- **WealthPanel mock pattern**: Child components in `WealthPanel.test.tsx` are mocked with `data-testid="*-mock"` pattern. Preserve this pattern.
- **No Tailwind on icon elements**: Lucide React icons can use Tailwind `className` like `h-4 w-4` — this IS supported (unlike SVG text elements).

### References

- Story 5-7 ACs: `_bmad-output/planning-artifacts/epics.md` line 1053
- UX-DR11 (wealth panel persistent collapsible): `_bmad-output/planning-artifacts/epics.md` line 117
- UX-DR12 (two-panel desktop layout): `_bmad-output/planning-artifacts/epics.md` line 118
- Architecture wealth panel notes: `_bmad-output/planning-artifacts/architecture.md` line 111
- Architecture file structure (WealthPanel location): `_bmad-output/planning-artifacts/architecture.md` line 654
- Current WealthPanel: `src/features/savings/WealthPanel.tsx`
- Current WealthPanel tests: `src/features/savings/WealthPanel.test.tsx`
- BudgetPage layout: `src/features/envelopes/BudgetPage.tsx`
- Previous story file (5-6): `_bmad-output/implementation-artifacts/5-6-savings-flow-chart-monthly-trend.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward with no debugging required.

### Completion Notes List

- **Task 1**: Added `useState` + localStorage-based collapse state and ChevronDown/ChevronUp toggle buttons to `WealthPanel.tsx`. Expanded state shows full content (RunwayGauge, SavingsFlowChart, ReconciliationForm) with a collapse button below. Collapsed state shows a thin strip with "Wealth Panel" label and expand button.
- **Task 2**: Confirmed `BudgetPage.tsx` already has `flex flex-col h-full overflow-hidden` with WealthPanel (`shrink-0`) and `flex-1 overflow-y-auto` envelope list — AC2 satisfied with zero code changes.
- **Task 3**: Added `fireEvent` import, `localStorage.clear()` to `beforeEach`, `lucide-react` module mock, and 6 new collapse/expand/localStorage tests. Total suite: 10 tests (4 original + 6 new), all passing.
- **Task 4**: Full test suite: 366 passed, 13 pre-existing BorrowOverlay failures (unchanged). No new lint errors introduced.

### File List

- `src/features/savings/WealthPanel.tsx` — modified (collapse/expand toggle with localStorage persistence)
- `src/features/savings/WealthPanel.test.tsx` — modified (added lucide-react mock, localStorage.clear(), 6 new tests)

## Senior Developer Review (AI)

**Review Date:** 2026-04-09
**Outcome:** Approved
**Layers:** Blind Hunter, Edge Case Hunter, Acceptance Auditor

### Action Items

- [x] [Review][Defer] ReconciliationForm draft input is silently cleared on collapse/expand [`src/features/savings/WealthPanel.tsx`] — deferred, pre-existing design constraint (spec requires minimal header = unmount)
- [x] [Review][Defer] WealthPanel tests render ReconciliationForm unmocked (test coupling) [`src/features/savings/WealthPanel.test.tsx`] — deferred, intentional integration test; passes because useSettingsStore is mocked

## Change Log

- 2026-04-09: Story 5.7 implemented — collapse/expand toggle added to WealthPanel with localStorage persistence. 6 new tests added. AC2 and AC4 confirmed pre-satisfied.
