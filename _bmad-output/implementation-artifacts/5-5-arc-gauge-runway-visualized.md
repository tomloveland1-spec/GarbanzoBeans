# Story 5.5: Arc Gauge — Runway Visualized

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want to see my financial runway as a fuel gauge arc with color-coded zones,
So that I can understand my financial health at a glance without reading a number.

## Acceptance Criteria

1. **AC1: Three-Zone SVG Arc Gauge**
   - Given a runway value exists
   - When the Arc Gauge component renders
   - Then a SVG semicircle arc displays with three conceptual zones: red (<1 month), amber (1–3 months), lime (3+ months); the filled arc represents the current runway value; center shows the Display-weight months number; "months runway" label appears below (FR23, UX-DR4)

2. **AC2: Critical Zone Color**
   - Given the runway falls in the red zone (<1 month)
   - When the arc renders
   - Then the filled arc uses `--color-runway-critical` (`#ff5555`); background track uses `--color-gauge-track` (`#26282C`)

3. **AC3: Caution Zone Color**
   - Given the runway falls in the amber zone (1–3 months)
   - When the arc renders
   - Then the filled arc uses `--color-runway-caution` (`#F5A800`)

4. **AC4: Healthy Zone Color**
   - Given the runway falls in the lime zone (3+ months)
   - When the arc renders
   - Then the filled arc uses `--color-runway-healthy` (`#C0F500`)

5. **AC5: Animation on Value Change**
   - Given the runway value changes after a savings event
   - When the new reconciliation is committed
   - Then the arc fill animates to the new position via CSS transition on `stroke-dashoffset`; animation is suppressed when `prefers-reduced-motion` is active

6. **AC6: No Data State**
   - Given no reconciliations exist
   - When the gauge renders
   - Then the center shows "—", no fill arc is drawn, and the empty-state prompt "Enter your savings balance to start tracking runway" is shown

## Tasks / Subtasks

- [x] Task 1: Create `RunwayGauge` component and tests (AC: 1, 2, 3, 4, 5, 6)
  - [x] 1.1: Create `src/features/savings/RunwayGauge.test.tsx` — mock stores using the exact pattern from `WealthPanel.test.tsx` (line 11–35); copy `makeReconciliation` factory helper. Store mock shape: `{ reconciliations: [], runway: vi.fn(() => 0), runwayDelta: vi.fn(() => null) }`. Mock `@/stores/useSavingsStore`. Confirm ALL tests FAIL before implementing.
  - [x] 1.2: Write these tests in `RunwayGauge.test.tsx` (14 tests total):
    - `'renders with data-testid="runway-gauge"'` — reconciliations=[], getByTestId('runway-gauge') present
    - `'shows "—" as center text when no reconciliations'` — reconciliations=[], getByTestId('runway-value') text is "—"
    - `'shows runway number as center text when reconciliations exist'` — [makeReconciliation()], runway mock returns 3; getByTestId('runway-value') text is "3"
    - `'renders no fill arc when no reconciliations'` — queryByTestId('runway-fill') is null
    - `'renders fill arc when reconciliations exist'` — [makeReconciliation()], runway returns 3; getByTestId('runway-fill') present
    - `'fill arc uses critical color when runway < 1'` — runway mock returns 0.5; getByTestId('runway-fill') has attribute `stroke` = `'var(--color-runway-critical)'`
    - `'fill arc uses caution color when runway is 1–3'` — runway mock returns 2; runway-fill stroke = `'var(--color-runway-caution)'`
    - `'fill arc uses healthy color when runway >= 3'` — runway mock returns 5; runway-fill stroke = `'var(--color-runway-healthy)'`
    - `'background track uses gauge-track color'` — getByTestId('runway-track') has attribute `stroke` = `'var(--color-gauge-track)'`
    - `'has role="img"'` — getByRole('img') present
    - `'shows delta when >= 2 reconciliations and runwayDelta returns value'` — reconciliations=[makeReconciliation({id:1}), makeReconciliation({id:2})], runwayDelta returns 1; getByTestId('runway-delta') text is '↑ +1 this month'
    - `'shows no delta when fewer than 2 reconciliations'` — queryByTestId('runway-delta') is null
    - `'shows empty-state prompt when no reconciliations'` — getByText('Enter your savings balance to start tracking runway') present
    - `'does NOT show empty-state prompt when reconciliations exist'` — queryByText('Enter your savings balance to start tracking runway') is null
  - [x] 1.3: Create `src/features/savings/RunwayGauge.tsx`. Reads directly from `useSavingsStore()` — NO props needed (same pattern as `ReconciliationForm.tsx`). Destructure: `const { reconciliations, runway, runwayDelta } = useSavingsStore();`
  - [x] 1.4: Define SVG constants at module level:
    ```typescript
    const cx = 100;
    const cy = 100;
    const r = 80;
    const MAX_RUNWAY = 12;
    const STROKE_WIDTH = 14;
    // Semicircle: left (cx-r, cy) → arc up through top → right (cx+r, cy)
    const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
    const pathLength = Math.PI * r; // ≈ 251.33 — total arc length for dasharray
    ```
  - [x] 1.5: Implement fill color helper and computed values inside the component:
    ```typescript
    function getArcColor(runway: number): string {
      if (runway < 1) return 'var(--color-runway-critical)';
      if (runway < 3) return 'var(--color-runway-caution)';
      return 'var(--color-runway-healthy)';
    }

    // Inside component:
    const hasData = reconciliations.length > 0;
    const runwayValue = hasData ? runway() : 0;
    const fillPercent = hasData ? Math.min(runwayValue / MAX_RUNWAY, 1) : 0;
    const dashOffset = pathLength * (1 - fillPercent);

    // prefers-reduced-motion: check once, suppress CSS transition when active
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ```
  - [x] 1.6: Delta display logic (copy/adapt from `WealthPanel.tsx` lines 34–48 in story 5.4):
    ```typescript
    const delta = reconciliations.length >= 2 ? runwayDelta() : null;
    const deltaSign = delta !== null ? (delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : '→ ') : '';
    const deltaColor =
      delta === null ? ''
      : delta > 0 ? 'var(--color-runway-healthy)'
      : delta < 0 ? 'var(--color-runway-critical)'
      : 'var(--color-text-secondary)';
    ```
  - [x] 1.7: Accessibility aria-label:
    ```typescript
    const ariaLabel = !hasData
      ? 'Runway gauge: no data'
      : `${runwayValue} months runway${
          delta !== null && delta > 0 ? ', improving'
          : delta !== null && delta < 0 ? ', declining'
          : ''
        }`;
    ```
  - [x] 1.8: Render JSX — outer wrapper `<div>` containing the SVG and the empty-state prompt:
    ```tsx
    return (
      <div className="flex flex-col items-center">
        <svg
          viewBox="0 0 200 115"
          width="200"
          height="115"
          role="img"
          aria-label={ariaLabel}
          data-testid="runway-gauge"
        >
          {/* Background track — always full semicircle, gauge-track color */}
          <path
            data-testid="runway-track"
            d={arcPath}
            fill="none"
            stroke="var(--color-gauge-track)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />

          {/* Fill arc — only when data exists and runway > 0 */}
          {hasData && fillPercent > 0 && (
            <path
              data-testid="runway-fill"
              d={arcPath}
              fill="none"
              stroke={getArcColor(runwayValue)}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={pathLength}
              strokeDashoffset={dashOffset}
              style={{
                transition: prefersReducedMotion
                  ? 'none'
                  : 'stroke-dashoffset 0.6s ease-out',
              }}
            />
          )}

          {/* Center number — Display weight (28px/700) */}
          <text
            data-testid="runway-value"
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="28"
            fontWeight="700"
            fill="var(--color-text-primary)"
          >
            {hasData ? runwayValue : '—'}
          </text>

          {/* "months runway" label */}
          <text
            x={cx}
            y={cy + 20}
            textAnchor="middle"
            fontSize="12"
            fill="var(--color-text-secondary)"
          >
            months runway
          </text>

          {/* Delta indicator — only when >= 2 reconciliations */}
          {delta !== null && (
            <text
              data-testid="runway-delta"
              x={cx}
              y={cy + 38}
              textAnchor="middle"
              fontSize="11"
              fill={deltaColor}
            >
              {deltaSign}{Math.abs(delta)} this month
            </text>
          )}
        </svg>

        {/* Empty-state prompt — outside SVG */}
        {!hasData && (
          <p
            className="text-xs italic text-center"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Enter your savings balance to start tracking runway
          </p>
        )}
      </div>
    );
    ```
  - [x] 1.9: Run `RunwayGauge.test.tsx` — all 14 tests must pass before proceeding.

- [x] Task 2: Update `WealthPanel.tsx` and `WealthPanel.test.tsx` to delegate to `RunwayGauge` (AC: 1–6)
  - [x] 2.1: Update `src/features/savings/WealthPanel.tsx`:
    - Add import: `import RunwayGauge from './RunwayGauge';`
    - Remove the entire `useSavingsStore()` call — WealthPanel no longer reads store data (RunwayGauge handles it)
    - Remove imports: `useSavingsStore` (no longer needed by WealthPanel directly)
    - Remove the left section `<div className="flex flex-col items-start gap-1 min-w-[80px]">` block (lines 15–57 — the Runway label, number, months label, delta IIFE, and empty-state prompt)
    - Replace with `<RunwayGauge />`
    - Final WealthPanel should be:
      ```tsx
      import RunwayGauge from './RunwayGauge';
      import ReconciliationForm from './ReconciliationForm';

      export default function WealthPanel() {
        return (
          <div
            className="shrink-0 border-b"
            style={{ borderColor: 'var(--color-border)' }}
            data-testid="wealth-panel"
          >
            <div className="flex gap-4 p-3">
              <RunwayGauge />
              <div className="flex-1">
                <ReconciliationForm />
              </div>
            </div>
          </div>
        );
      }
      ```
  - [x] 2.2: Update `src/features/savings/WealthPanel.test.tsx`:
    - Add mock for RunwayGauge at the top (after existing imports):
      ```typescript
      vi.mock('./RunwayGauge', () => ({
        default: () => <div data-testid="runway-gauge-mock" />,
      }));
      ```
    - Remove the entire `savingsStore` mock object and `vi.mock('@/stores/useSavingsStore', ...)` block — WealthPanel no longer calls `useSavingsStore()` directly
    - Remove `mockCurrentTrackedBalance`, `mockRecordReconciliation` at the top
    - Keep `settingsStore` mock — ReconciliationForm (rendered inside WealthPanel) still uses it
    - Remove `makeReconciliation` factory helper — no longer needed in WealthPanel tests
    - Remove the `beforeEach` store resets for savingsStore (keep settingsStore reset if any)
    - **Remove** these tests (now in RunwayGauge.test.tsx):
      - `'shows "—" when no reconciliations exist'`
      - `'shows computed runway number when reconciliations exist'`
      - `'does not show delta when fewer than 2 reconciliations'`
      - `'shows positive delta with lime color when runway improved'`
      - `'shows negative delta with red color when runway decreased'`
      - `'shows zero delta with muted color when runway unchanged'`
      - `'shows empty-state prompt when no reconciliations'`
      - `'does NOT show empty-state prompt when reconciliations exist'`
    - **Keep** these tests:
      - `'renders with data-testid="wealth-panel"'` — unchanged
      - `'renders ReconciliationForm (save button present)'` — unchanged
    - **Add** this test:
      - `'renders RunwayGauge'` — `expect(screen.getByTestId('runway-gauge-mock')).toBeInTheDocument()`
    - Final WealthPanel test suite: 3 tests total
  - [x] 2.3: Run `WealthPanel.test.tsx` — all 3 tests pass.

- [x] Task 3: Run full test suite and validate (AC: all)
  - [x] 3.1: Run `npm test` — all 14 new RunwayGauge tests pass; WealthPanel tests pass (3 tests); full suite passes with no regressions. Note the pre-existing test count from story 5.4 was 343 non-pre-existing tests; net change = +14 RunwayGauge, −8 WealthPanel = net +6 tests.
  - [x] 3.2: Run `npm run lint` — no new lint errors.
  - [x] 3.3: No Rust changes needed — story 5.5 is frontend-only. No new Tauri commands, no migration, no `lib.rs` changes.

### Review Findings

- [x] [Review][Patch] SVG viewBox height clips "months runway" and delta text [src/features/savings/RunwayGauge.tsx — viewBox="0 0 200 115"] — fixed: viewBox and height updated to 160
- [x] [Review][Defer] No test asserting aria-label dynamic content (no-data / improving / declining / flat states) [src/features/savings/RunwayGauge.test.tsx] — deferred, coverage gap not in spec's required 14 tests
- [x] [Review][Defer] No test for prefers-reduced-motion transition suppression (AC5 untested) [src/features/savings/RunwayGauge.test.tsx] — deferred, not in spec's required test list
- [x] [Review][Defer] No loading/pending state when avgMonthlyEssentialSpendCents is 0 — runway shows 0 misleadingly before spend data loads [src/stores/useSavingsStore.ts] — deferred, pre-existing store design concern

## Dev Notes

### What Already Exists — Do NOT Recreate

| What | Where | Status |
|------|-------|--------|
| `WealthPanel.tsx` with runway text + delta + empty-state | `src/features/savings/WealthPanel.tsx` | EXISTS — refactor in Task 2; replace left section with `<RunwayGauge />` |
| `WealthPanel.test.tsx` with 9 tests | `src/features/savings/WealthPanel.test.tsx` | EXISTS — update in Task 2; trim to 3 tests |
| `useSavingsStore` with `runway()` and `runwayDelta()` getters | `src/stores/useSavingsStore.ts` | EXISTS — do NOT modify; RunwayGauge reads from it |
| `deriveRunway` pure function | `src/lib/deriveRunway.ts` | EXISTS — do NOT touch |
| Design tokens: `--color-runway-healthy`, `--color-runway-caution`, `--color-runway-critical`, `--color-gauge-track` | `src/styles.css` | EXISTS — use as CSS vars; do NOT hardcode hex |
| `ReconciliationForm.tsx` | `src/features/savings/ReconciliationForm.tsx` | EXISTS — do NOT touch |
| `src/components/gb/` | `src/components/gb/SavingsCard.tsx` | EXISTS — unrelated to this story; ignore |

### WealthPanel Current Structure (Lines to REMOVE in Task 2.1)

The current `WealthPanel.tsx` (as of story 5.4) has this left section to remove:
```tsx
// REMOVE THIS ENTIRE BLOCK (lines 15–57 in WealthPanel.tsx):
<div className="flex flex-col items-start gap-1 min-w-[80px]">
  <span className="type-label text-xs uppercase ..." ...>Runway</span>
  <span className="text-2xl font-semibold" ...>{reconciliations.length === 0 ? '—' : runway()}</span>
  <span className="text-xs" ...>months runway</span>
  {(() => { /* delta IIFE */ })()}
  {reconciliations.length === 0 && <p ...>Enter your savings balance...</p>}
</div>
// REPLACE WITH:
<RunwayGauge />
```

Remove the entire `const { reconciliations, runway, runwayDelta } = useSavingsStore();` line and the `useSavingsStore` import after this refactor.

### SVG Arc Math — Semicircle Gauge

```
ViewBox: 0 0 200 115
Center: cx=100, cy=100
Radius: r=80
MAX_RUNWAY: 12 months = full arc

Arc path (left → up through top → right):
  M 20 100  A 80 80 0 0 1  180 100

Total arc length = π × 80 ≈ 251.33

Fill formula:
  fillPercent = Math.min(runway / 12, 1)  // capped at 100%
  strokeDasharray = 251.33
  strokeDashoffset = 251.33 × (1 − fillPercent)
  → dashOffset=251.33: empty (no fill)
  → dashOffset=0: full fill
```

**Threshold values** (corresponding to arc positions):
- 1 month runway = 1/12 ≈ 8.3% fill
- 3 months runway = 3/12 = 25% fill
- 12 months = 100% fill

### Animation Implementation

CSS `transition` on `stroke-dashoffset` handles animation automatically when React re-renders with a new `runway()` value. No explicit `useEffect` or animation library needed.

```typescript
style={{
  transition: prefersReducedMotion ? 'none' : 'stroke-dashoffset 0.6s ease-out',
}}
```

The `prefersReducedMotion` check runs once at render (not a reactive subscription — acceptable since system setting changes do not require live response during a session).

Animation triggers naturally on write commit: `recordReconciliation` → store `reconciliations` updated → React re-renders → new `runwayValue` → new `dashOffset` → CSS transition fires.

### Store Mock Pattern for RunwayGauge Tests

Copy the exact mock structure from `WealthPanel.test.tsx` (as it exists after story 5.4):

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RunwayGauge from './RunwayGauge';
import type { SavingsReconciliation } from '@/lib/types';

const savingsStore = {
  reconciliations: [] as SavingsReconciliation[],
  runway: vi.fn(() => 0),
  runwayDelta: vi.fn(() => null as number | null),
};

vi.mock('@/stores/useSavingsStore', () => {
  const useSavingsStore = vi.fn(() => savingsStore);
  return { useSavingsStore };
});

const makeReconciliation = (overrides: Partial<SavingsReconciliation> = {}): SavingsReconciliation => ({
  id: 1,
  date: '2026-04-08',
  enteredBalanceCents: 500_000,
  previousTrackedBalanceCents: 0,
  deltaCents: 500_000,
  note: null,
  ...overrides,
});

describe('RunwayGauge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savingsStore.reconciliations = [];
    savingsStore.runway.mockReturnValue(0);
    savingsStore.runwayDelta.mockReturnValue(null);
  });
  // ... tests
});
```

Note: No `useSettingsStore` mock needed in RunwayGauge — it does NOT read from settings store.

### WealthPanel Test Cleanup — What to Remove

After Task 2.2, `WealthPanel.test.tsx` loses these mocks/helpers:
- `mockCurrentTrackedBalance` (line 8)
- `mockRecordReconciliation` (line 9)
- The `savingsStore` object (lines 11–22)
- `vi.mock('@/stores/useSavingsStore', ...)` block (lines 24–27)
- `makeReconciliation` factory (lines 37–45)
- All `beforeEach` savingsStore resets

Keep: `settingsStore` mock and `vi.mock('@/stores/useSettingsStore', ...)` — ReconciliationForm still needs it.

### Delta Display — Exact Parity with Story 5.4

The delta display in `RunwayGauge` must exactly match what `WealthPanel.tsx` currently produces (story 5.4 result). Copy the sign/color/format logic:
- `delta > 0`: `'↑ +'` prefix + lime color
- `delta < 0`: `'↓ '` prefix + red color + `Math.abs(delta)` for the number
- `delta === 0`: `'→ '` prefix + muted color
- Format: `{sign}{Math.abs(delta)} this month`
- `data-testid="runway-delta"` — existing testid, preserved

The existing `WealthPanel.test.tsx` tests for delta can be verified against the new `RunwayGauge.test.tsx` tests to ensure parity.

### Accessibility Requirements (UX spec)

- `role="img"` on the SVG element (required)
- `aria-label` dynamically describing runway state:
  - No data: `"Runway gauge: no data"`
  - Data + improving: `"5 months runway, improving"`
  - Data + declining: `"3 months runway, declining"`
  - Data + flat: `"4 months runway"`
- Do NOT add `aria-hidden` to the center text — it is inside the `role="img"` element and provides the accessible label
- `prefers-reduced-motion` suppressed via inline `transition: 'none'` (not via Tailwind class — the animation is on an SVG path element, not a utility class)

### SVG Text Rendering Notes

- `textAnchor="middle"` + `x={cx}` = horizontally centered
- `dominantBaseline="central"` on the runway number = vertically centered within its y offset
- SVG text inherits the page's CSS font-family (Roboto is loaded globally) — no explicit `fontFamily` needed
- `fontSize` and `fontWeight` as SVG attributes (not CSS class) for SVG text elements — do NOT use Tailwind classes on `<text>` elements

### Deferred (Not in Story 5.5 Scope)

- **Savings Flow Chart** (`SavingsFlowChart.tsx`) — story 5.6
- **Full WealthPanel layout redesign** (arc + chart side by side, ~220px height, collapsible) — story 5.7
- **Three visually distinct zone segments on the track background** — the track is a single `--color-gauge-track` colored arc; zone thresholds are implicit in fill color only
- **Tooltip explaining zone** ("2.4 months — healthy range") — referenced in UX spec but not in this story's ACs
- **Runway arc zone markers / tick marks** — not specified in story 5.5 ACs

### Previous Story Learnings (5.4 — code review findings applied here)

- **`runwayDelta()` called once per render**: the IIFE pattern from 5.4 avoids calling the getter twice — applied in Task 1.6 above (store `delta` in a variable, use that variable in JSX)
- **No `unwrap_or` swallowing errors in Rust**: not applicable here (no Rust changes)
- **Negative delta format**: use `Math.abs(delta)` so "↓ 1 this month" not "↓ -1 this month" — enforced in Task 1.6 and test 1.2 delta test

### References

- Story 5.5 ACs: `_bmad-output/planning-artifacts/epics.md` line 1001
- UX-DR4 (Arc Gauge anatomy): `_bmad-output/planning-artifacts/epics.md` line 110
- FR23: `_bmad-output/planning-artifacts/epics.md` line 42
- Architecture: arc gauge = `src/features/savings/RunwayGauge.tsx` — `_bmad-output/planning-artifacts/architecture.md` line 656
- Architecture: Recharts for bar chart (story 5.6), NOT for arc gauge — arc gauge is pure SVG paths per UX-DR4
- Design token values: `_bmad-output/planning-artifacts/ux-design-specification.md` line 332–335
- Accessibility (role="img", aria-label, prefers-reduced-motion): `_bmad-output/planning-artifacts/ux-design-specification.md` line 863, 879, 894
- Current `WealthPanel.tsx` (to refactor): `src/features/savings/WealthPanel.tsx`
- Current `WealthPanel.test.tsx` (to update): `src/features/savings/WealthPanel.test.tsx`
- `useSavingsStore.ts` (do NOT modify): `src/stores/useSavingsStore.ts`
- `ReconciliationForm.tsx` (do NOT touch): `src/features/savings/ReconciliationForm.tsx`
- Story 5.4 delta pattern (copy sign/color/format logic): `_bmad-output/implementation-artifacts/5-4-runway-metric-derive-and-display.md` Tasks 4.1 / 4.2

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `window.matchMedia` not available in jsdom — guarded with `typeof window.matchMedia === 'function'` check alongside the existing `typeof window !== 'undefined'` guard. No functional change in production (browser always has matchMedia).

### Completion Notes List

- Created `RunwayGauge.tsx`: pure SVG semicircle arc gauge reading directly from `useSavingsStore`. Implements three-zone coloring (critical/caution/healthy), fill via `stroke-dashoffset`, CSS transition for animation, `prefers-reduced-motion` suppression, `role="img"` + dynamic `aria-label`, delta display (≥2 reconciliations), and empty-state prompt. All 14 tests pass.
- Refactored `WealthPanel.tsx`: removed all store reading and runway display logic; now simply composes `<RunwayGauge />` + `<ReconciliationForm />`. No functional regression.
- Updated `WealthPanel.test.tsx`: trimmed from 9 tests to 3 (mocks RunwayGauge, keeps structural tests + ReconciliationForm smoke test). All pass.
- Full suite: 363 tests total (350 passing + 13 pre-existing BorrowOverlay failures unrelated to this story). Net change: +14 RunwayGauge, −8 WealthPanel = +6 tests vs story 5.4 baseline.
- No Rust/Tauri changes (frontend-only story).

### File List

- src/features/savings/RunwayGauge.tsx (new)
- src/features/savings/RunwayGauge.test.tsx (new)
- src/features/savings/WealthPanel.tsx (modified)
- src/features/savings/WealthPanel.test.tsx (modified)

## Change Log

- 2026-04-08: Story implemented — created RunwayGauge SVG arc component (14 tests); refactored WealthPanel to delegate to RunwayGauge (3 tests); all ACs satisfied; frontend-only, no Rust changes.
