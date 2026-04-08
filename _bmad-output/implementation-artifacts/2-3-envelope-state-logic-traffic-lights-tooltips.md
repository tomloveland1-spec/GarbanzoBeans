# Story 2.3: Envelope State Logic — Traffic Lights + Tooltips

Status: done

## Story

As Tom,
I want every envelope to show a clear color-coded state (green/amber/red) with a tooltip explaining exactly why it's that color,
So that I always know where I stand without having to figure it out.

## Acceptance Criteria

1. **Given** `getEnvelopeStateExplanation(type, state)` is authored as a pure function in `src/lib/envelopeState.ts`
   **When** the function is called with any valid type/state combination
   **Then** it returns one of 9 distinct text explanations (3 types × 3 states); the function has unit test coverage for all 9 cases

2. **Given** envelopes are displayed on the Budget screen
   **When** an envelope's allocatedCents changes (spending data is 0 for now — wired in Epic 3)
   **Then** the Envelope Card immediately shows the correct state bar color: lime (funded), amber (unfunded/caution), red (overspent); the update is visible without a manual refresh (NFR10)

3. **Given** a Rolling envelope has `allocatedCents > 0` and `spentCents = 0`
   **When** the card renders
   **Then** state bar is lime (`var(--color-envelope-green)`); badge reads "Funded"; tooltip shows the Rolling/funded explanation

4. **Given** any envelope has `allocatedCents = 0`
   **When** the card renders
   **Then** state bar is amber (`var(--color-envelope-orange)`); badge reads "Unfunded"; tooltip shows the type-specific caution explanation

5. **Given** any envelope has `spentCents > allocatedCents`
   **When** the card renders
   **Then** state bar is red (`var(--color-envelope-red)`); badge reads "Over budget"; tooltip shows the type-specific overspent explanation

6. **Given** a user hovers over a state badge
   **When** the tooltip trigger fires (300ms delay — already set on `TooltipProvider` in `App.tsx`)
   **Then** the tooltip appears above the badge (flips below if clipped), max 240px wide (already in `TooltipContent`), with the plain-text explanation from `getEnvelopeStateExplanation` (UX-DR17)

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/envelopeState.ts` — pure state types, derivation, and explanation
  - [x] Export `EnvelopeDisplayState` type: `'funded' | 'caution' | 'overspent'`
  - [x] Export `deriveEnvelopeState(allocatedCents: number, spentCents: number = 0): EnvelopeDisplayState`
    - If `spentCents > allocatedCents` → `'overspent'`
    - If `allocatedCents === 0` → `'caution'`
    - Otherwise → `'funded'`
  - [x] Export `getEnvelopeStateExplanation(type: EnvelopeType, state: EnvelopeDisplayState): string` — all 9 cases (see Dev Notes)
  - [x] Export `STATE_COLORS: Record<EnvelopeDisplayState, string>` mapping state → CSS variable string (see Dev Notes)
  - [x] Export `STATE_LABELS: Record<EnvelopeDisplayState, string>` mapping state → badge label text

- [x] Task 2: Create `src/lib/envelopeState.test.ts` — unit tests for pure functions
  - [x] Test all 9 `getEnvelopeStateExplanation` combinations (3 types × 3 states) — each must return a distinct non-empty string
  - [x] Test `deriveEnvelopeState`: spentCents > allocatedCents → overspent; allocatedCents = 0 → caution; allocatedCents > 0, spentCents = 0 → funded; spentCents = allocatedCents → funded (equal is not overspent); spentCents > 0, spentCents < allocatedCents → funded

- [x] Task 3: Update `src/features/envelopes/EnvelopeCard.tsx` — add state bar, mini progress bar, state badge + tooltip
  - [x] Import `deriveEnvelopeState`, `getEnvelopeStateExplanation`, `STATE_COLORS`, `STATE_LABELS` from `@/lib/envelopeState`
  - [x] Import `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip`
  - [x] Derive state at render: `const state = deriveEnvelopeState(envelope.allocatedCents, 0)` — `spentCents = 0` until Epic 3
  - [x] Add 4px left-border state bar: left border of the card div, color set via `style={{ borderLeft: '4px solid', borderLeftColor: STATE_COLORS[state] }}`
  - [x] Add mini progress bar (56px wide, 3px tall) below the envelope name area — plain divs, NOT the `Progress` component (which doesn't support colored indicator easily). Progress value = `(spentCents / allocatedCents) * 100`, clamped 0–100, defaults to 0 when allocatedCents = 0
  - [x] Replace static type/priority badges with: type badge, priority badge, then a tooltip-wrapped state badge
    - `<Tooltip>` wraps: `<TooltipTrigger asChild>` containing the state `<Badge>` + `<TooltipContent>` with explanation text
  - [x] State badge label = `STATE_LABELS[state]`
  - [x] Tooltip content = `getEnvelopeStateExplanation(envelope.type, state)` 
  - [x] Update `aria-label` to: `"${envelope.name} envelope, ${envelope.type}, ${envelope.priority}, ${STATE_LABELS[state]}"`
  - [x] PRESERVE all existing functionality: inline name edit, delete dialog, MoreHorizontal button, formatCurrency display

- [x] Task 4: Update `src/features/envelopes/EnvelopeCard.test.tsx` — add state bar and tooltip tests
  - [x] Test: funded envelope (allocatedCents > 0) renders lime state bar border color (`STATE_COLORS.funded`)
  - [x] Test: caution envelope (allocatedCents = 0) renders amber state bar border color (`STATE_COLORS.caution`)
  - [x] Test: state badge label renders correctly for funded state ("Funded")
  - [x] Test: state badge label renders correctly for caution state ("Unfunded")
  - [x] Test: tooltip content (TooltipContent text) matches `getEnvelopeStateExplanation` output for Rolling/funded
  - [x] Preserve all 8 existing passing tests — do NOT break them

## Dev Notes

---

### CRITICAL: No `spent_cents` in the DB Yet

The `envelopes` table (migration `003_envelopes.sql`) has NO `spent_cents` column. Transactions (Epic 3) will provide spending data. For Story 2.3, `spentCents` is always `0` in `EnvelopeCard`. The state derivation function accepts it as an optional parameter so it's ready for Epic 3 wiring.

**Do NOT add a `spent_cents` column or migration in this story.** The `deriveEnvelopeState` function takes `spentCents` as a parameter — Epic 3 will pass real values. The infra is ready; the data is not yet.

---

### File Location Reality (Inherited from Stories 2.1 & 2.2)

| What | Architecture Spec Says | Actual Location (use this) |
|------|------------------------|----------------------------|
| Rust commands | `src-tauri/src/commands/envelopes.rs` | `src-tauri/src/commands/mod.rs` (single file) |
| TypeScript types | `src/types/envelope.ts` | `src/lib/types.ts` |
| Zustand store | `src/features/envelopes/useEnvelopeStore.ts` | `src/stores/useEnvelopeStore.ts` |
| New state logic | `src/lib/` | `src/lib/envelopeState.ts` (new — fits lib pattern) |

**No Rust changes in this story.** No new Tauri commands. No new migrations. Pure frontend.

---

### getEnvelopeStateExplanation — All 9 Required Strings

```typescript
export function getEnvelopeStateExplanation(
  type: EnvelopeType,
  state: EnvelopeDisplayState
): string {
  const explanations: Record<EnvelopeType, Record<EnvelopeDisplayState, string>> = {
    Rolling: {
      funded:    'Your rolling budget is fully funded and spending is on track.',
      caution:   'This rolling budget has no allocation yet. Add funds to get started.',
      overspent: 'You\'ve overspent this rolling budget. Consider reallocating from another envelope.',
    },
    Bill: {
      funded:    'This bill is funded and ready to pay.',
      caution:   'This bill is not yet funded. Allocate before the due date.',
      overspent: 'This bill has been overspent. Review the allocation.',
    },
    Goal: {
      funded:    'You\'re on track toward this goal.',
      caution:   'This goal has no allocation yet. Start contributing to make progress.',
      overspent: 'You\'ve exceeded the allocation for this goal.',
    },
  };
  return explanations[type][state];
}
```

These exact strings can be adjusted by the developer for tone, but all 9 must be distinct and non-empty. The unit tests verify distinctness.

---

### STATE_COLORS and STATE_LABELS

```typescript
export const STATE_COLORS: Record<EnvelopeDisplayState, string> = {
  funded:    'var(--color-envelope-green)',
  caution:   'var(--color-envelope-orange)',
  overspent: 'var(--color-envelope-red)',
};

export const STATE_LABELS: Record<EnvelopeDisplayState, string> = {
  funded:    'Funded',
  caution:   'Unfunded',
  overspent: 'Over budget',
};
```

CSS variables are defined in `src/styles.css` (lines 16–21) and already exist — no additions needed:
- `--color-envelope-green: #C0F500`
- `--color-envelope-orange: #F5A800`
- `--color-envelope-red: #ff5555`

Also available as JS constants in `src/lib/design-tokens.ts` (`DESIGN_TOKENS.envelopeGreen`, etc.) — but use CSS variables in JSX styles, not raw hex values.

---

### TooltipProvider Is Already Set Up

**Do NOT add `TooltipProvider` in `EnvelopeCard` or any envelope component.** `App.tsx` (lines 30 and 42) already wraps the entire app in `<TooltipProvider delayDuration={300}>`. The 300ms hover delay is already configured.

Just use `Tooltip`, `TooltipTrigger`, `TooltipContent` directly:

```tsx
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

<Tooltip>
  <TooltipTrigger asChild>
    <Badge
      variant="outline"
      style={{ borderColor: STATE_COLORS[state], color: STATE_COLORS[state] }}
    >
      {STATE_LABELS[state]}
    </Badge>
  </TooltipTrigger>
  <TooltipContent>
    {getEnvelopeStateExplanation(envelope.type, state)}
  </TooltipContent>
</Tooltip>
```

`TooltipContent` already has `max-w-[240px]` in its className (see `src/components/ui/tooltip.tsx`). The flip-below-if-clipped behavior is handled by Radix UI automatically.

---

### State Bar Implementation (4px Left Border)

The state bar is the LEFT border of the EnvelopeCard div itself. The current card uses:
```tsx
<div
  className="flex items-center justify-between px-4 py-3 rounded-md"
  style={{
    backgroundColor: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
  }}
```

Update the style to add a colored left border:
```tsx
style={{
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border)',
  borderLeft: `4px solid ${STATE_COLORS[state]}`,
}}
```

**Note:** Setting `borderLeft` shorthand overrides the `border` left edge cleanly. The card's rounded corners (`rounded-md`) still apply.

---

### Mini Progress Bar (56px × 3px)

Do NOT use the `Progress` component from `src/components/ui/progress.tsx` — its indicator color is hardcoded to `bg-primary` and cannot be customized per-instance without major surgery.

Render the progress bar as plain divs:

```tsx
const progressPct = envelope.allocatedCents > 0
  ? Math.min(100, (0 / envelope.allocatedCents) * 100)  // spentCents = 0 for now
  : 0;

<div
  className="w-14 h-[3px] rounded-full overflow-hidden"
  style={{ backgroundColor: 'var(--color-border)' }}
>
  <div
    className="h-full rounded-full transition-all"
    style={{
      width: `${progressPct}%`,
      backgroundColor: STATE_COLORS[state],
    }}
  />
</div>
```

**Epic 3 wiring:** Replace the `0` with `spentCents` when transaction data is available. The formula and rendering require no other changes.

---

### Revised EnvelopeCard Layout

The updated card layout should flow as:

```
[State Bar 4px] [Name area + mini progress bar] [type badge] [priority badge] [state badge+tooltip] [amount] [⋯]
```

Specifically, add the mini progress bar BELOW the name (either as a second line in the name flex column, or just below the name button):

```tsx
<div className="flex-1 min-w-0 mr-3">
  {/* Name (inline editable, unchanged) */}
  {isEditing ? <Input ... /> : <button ... >{envelope.name}</button>}
  {/* Mini progress bar */}
  <div className="mt-1 w-14 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
    <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, backgroundColor: STATE_COLORS[state] }} />
  </div>
</div>
```

---

### Testing Approach

**Vitest + RTL (co-located tests):**

For `envelopeState.test.ts`:
```typescript
import { deriveEnvelopeState, getEnvelopeStateExplanation } from './envelopeState';

// deriveEnvelopeState
it('returns funded when allocatedCents > 0 and spentCents = 0', ...)
it('returns caution when allocatedCents = 0', ...)
it('returns overspent when spentCents > allocatedCents', ...)
it('returns funded when spentCents === allocatedCents (equal is not overspent)', ...)
it('returns funded when spentCents < allocatedCents', ...)

// getEnvelopeStateExplanation — all 9 must be distinct strings
it('returns distinct non-empty strings for all 9 type×state combinations', () => {
  const results = [...]; // collect all 9
  expect(new Set(results).size).toBe(9); // all distinct
});
```

For `EnvelopeCard.test.tsx` additions (mock `deriveEnvelopeState` or pass allocatedCents = 0 vs > 0):
- Test that `data-testid="state-bar"` (or check style) has lime color for funded envelope
- Test that state badge text is "Funded" for allocatedCents > 0
- Test that state badge text is "Unfunded" for allocatedCents = 0
- Test that tooltip text matches expected explanation (use RTL `userEvent.hover` or check TooltipContent content)

**Note on Tooltip testing in RTL:** Radix UI Tooltip requires `userEvent.hover()` to appear. Use `@testing-library/user-event`. The `TooltipContent` may need the tooltip to be open — test by checking the text renders after hover, or by wrapping in `<TooltipProvider>` in the test render.

---

### Scope Boundaries — What This Story Does NOT Do

- **No `spent_cents` column** — `spentCents` is always 0; no DB migration
- **No due date logic for Bill envelopes** — Bill badges show "Unfunded" when `allocatedCents = 0`, not due dates; due date tracking is Epic 6
- **No allocation input** — `allocatedCents` is still read-only display; editable allocation input is Story 2.4
- **No borrow flow** — Story 2.5
- **No new Rust commands** — pure frontend story
- **No new Tauri invocations** — `useEnvelopeStore` is unchanged
- **No background card tint** — UX spec mentions `--color-envelope-green-bg` background tints; defer background tint to a later polish pass (state bar + badge are sufficient for this story)

---

### Previous Story Intelligence (Story 2.2)

1. **`suppressBlurRef` pattern** — `EnvelopeCard` uses a ref to suppress blur on Escape keydown. This was a bug fix from code review. Do NOT remove or simplify this pattern.

2. **`handleDelete` closes dialog only on success** — `setIsDeleteOpen(false)` is conditional on `!useEnvelopeStore.getState().error`. Preserve this pattern.

3. **All 8 existing EnvelopeCard tests must still pass** — inline edit, Escape, Enter, blur, dialog open/close, delete. Adding state/tooltip tests must not break these.

4. **Test mocking pattern** — `EnvelopeCard.test.tsx` uses `vi.mock('@/stores/useEnvelopeStore', ...)` with `useEnvelopeStore.mockReturnValue(...)`. Follow the same mock setup when adding new tests.

5. **Button variants** — Ghost for Cancel, Destructive for Delete, ghost for ⋯. Do not change.

6. **`isWriting` guard** — Delete button disabled while `isWriting`. Unchanged in this story.

---

### Available UI Components (Already Installed)

```
src/components/ui/
  tooltip.tsx     — Tooltip, TooltipTrigger, TooltipContent, TooltipProvider
  badge.tsx       — Badge (use variant="outline" with style overrides for state color)
  progress.tsx    — NOT recommended for the mini bar (color limitation); use plain divs
```

Do NOT install new dependencies. Everything needed is already in the project.

---

### Architecture Compliance

- **No direct `invoke()` in components** — unchanged; components only call store actions
- **Pure functions in `src/lib/`** — `envelopeState.ts` must export pure functions only (no React, no Zustand imports)
- **CSS variables only** — never hardcode hex values in JSX styles; use `STATE_COLORS` which holds CSS var strings
- **Test co-location** — `envelopeState.test.ts` lives next to `envelopeState.ts` in `src/lib/`
- **No new stores** — state is derived at render time in `EnvelopeCard`, not persisted in Zustand

---

### File List (Expected)

**New files:**
- `src/lib/envelopeState.ts`
- `src/lib/envelopeState.test.ts`

**Modified files:**
- `src/features/envelopes/EnvelopeCard.tsx` — add state bar, mini progress, state badge+tooltip
- `src/features/envelopes/EnvelopeCard.test.tsx` — add state/tooltip tests (preserve existing)

**No changes expected:**
- `src/lib/types.ts` — no new types needed
- `src/stores/useEnvelopeStore.ts` — unchanged
- `src-tauri/` — no Rust changes
- `src-tauri/migrations/` — no new migration

---

### References

- Epics file: `_bmad-output/planning-artifacts/epics.md` — Story 2.3 section
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — `getEnvelopeStateExplanation` spec (lines 117–120), pure JS derived state (ADR-2)
- UX spec: `_bmad-output/planning-artifacts/ux-design-specification.md` — envelope card anatomy, traffic-light colors (lines 313–336), tooltip spec (lines 785–788)
- Design tokens: `src/lib/design-tokens.ts` and `src/styles.css` (lines 16–21)
- Previous story: `_bmad-output/implementation-artifacts/2-2-create-and-manage-envelopes.md`
- Tooltip component: `src/components/ui/tooltip.tsx`
- App root (TooltipProvider): `src/App.tsx` (lines 30, 42)

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- Tooltip test fix: Radix UI renders tooltip text in both visible div and `role="tooltip"` accessibility span; used `findByRole('tooltip')` to avoid "multiple elements" error.
- TooltipProvider in test renders: needed `delayDuration={0}` to open immediately without real pointer delays.

### Completion Notes List
- Created `envelopeState.ts` with all 5 exports: `EnvelopeDisplayState`, `deriveEnvelopeState`, `getEnvelopeStateExplanation`, `STATE_COLORS`, `STATE_LABELS`.
- 7 unit tests for `deriveEnvelopeState` cover all branches; 4 tests for `getEnvelopeStateExplanation` verify all 9 distinct strings.
- `EnvelopeCard.tsx` updated with 4px colored left-border state bar, mini 56×3px progress bar below name, and tooltip-wrapped state badge. All existing functionality preserved (`suppressBlurRef`, `handleDelete` error guard, MoreHorizontal button, formatCurrency).
- `EnvelopeCard.test.tsx` adds 5 new tests (state bar, badge labels, tooltip content); all 8 original tests continue to pass. Total: 13 tests, all green.
- All 102 project tests pass with no regressions.

### Change Log
- Story 2.3 implementation: envelope traffic-light state logic, colored state bar, mini progress bar, state badge with tooltip (Date: 2026-04-07)

### File List

**New files:**
- `src/lib/envelopeState.ts`
- `src/lib/envelopeState.test.ts`

**Modified files:**
- `src/features/envelopes/EnvelopeCard.tsx`
- `src/features/envelopes/EnvelopeCard.test.tsx`

### Review Findings

- [x] [Review][Defer] `borderLeft` shorthand on same element as `border` — fragile under refactoring [`src/features/envelopes/EnvelopeCard.tsx`] — deferred, low-severity pattern risk
- [x] [Review][Defer] `deriveEnvelopeState` treats negative `allocatedCents` as `funded` [`src/lib/envelopeState.ts`] — deferred, no DB constraint currently enforces non-negative; edge case for Epic 3+ validation pass
- [x] [Review][Defer] Tooltip test brittle — `userEvent.hover` + Radix portal behavior may differ in CI [`src/features/envelopes/EnvelopeCard.test.tsx`] — deferred, acknowledged in dev notes; revisit if CI flakiness observed
- [x] [Review][Defer] `<Badge>` as `TooltipTrigger` is non-interactive — keyboard users cannot access tooltip [`src/features/envelopes/EnvelopeCard.tsx`] — deferred, accessibility enhancement outside story scope
