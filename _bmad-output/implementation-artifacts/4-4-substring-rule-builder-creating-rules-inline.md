# Story 4.4: Substring Rule Builder — Creating Rules Inline

Status: done

## Story

As Tom,
I want to highlight part of a payee name to define a merchant matching rule right within the import queue,
so that future transactions from the same merchant categorize automatically without any extra steps.

## Acceptance Criteria

1. **Given** Tom is on an Unknown Queue Item
   **When** he toggles "Save as rule"
   **Then** the Substring Rule Builder activates inline: the payee text is rendered as interactive character spans; Tom can highlight a substring via mouse drag or keyboard selection

2. **Given** Tom highlights a substring of the payee name
   **When** the selection is active
   **Then** the highlighted text shows a lime background (`var(--color-lime)`, text `var(--color-neutral-black)` for legibility); a live preview reads "Match: [pattern] → [selected category]" below the builder; the preview is absent when no category is selected

3. **Given** Tom confirms the rule
   **When** the `create_merchant_rule` command succeeds
   **Then** `updateTransaction` is called with the chosen `envelopeId`; `createRule` is called with `{ payeeSubstring, envelopeId }`; the item is removed from the queue; no modal or settings navigation occurs

4. **Given** Tom dismisses the rule builder without saving
   **When** dismissal occurs
   **Then** the transaction retains its manually selected category (if one was chosen); no rule is created; the queue item is removed from the queue if a category was set, or the builder collapses back to normal mode if no category was set yet

5. **Given** the "Save as rule" button is clicked but no substring has been highlighted
   **When** Tom attempts to confirm
   **Then** the "Save rule" button is disabled until both a substring and a category are selected

6. **Given** the queue item is in normal mode (no "Save as rule" toggle active)
   **When** Tom selects a category from the dropdown
   **Then** the behavior is identical to Story 4.3: `updateTransaction` fires immediately, the item is removed from the queue

## Tasks / Subtasks

- [x] Task 1: Create `SubstringRuleBuilder` component in `src/features/merchant-rules/` (AC: 1, 2)
  - [x] Create `src/features/merchant-rules/SubstringRuleBuilder.tsx`
  - [x] Accept props: `payee: string`, `envelopeName: string | null`, `selectedSubstring: string`, `onSubstringChange: (s: string) => void`
  - [x] Render the payee text as individual `<span>` elements per character, each with a `data-index` attribute
  - [x] Track selection state internally using `onMouseDown` / `onMouseMove` / `onMouseUp` and `onMouseLeave` to capture start/end char indices; derive `selectedSubstring` from those indices and call `onSubstringChange` on mouse-up
  - [x] Apply lime highlight: selected characters get `background: var(--color-lime)` and `color: var(--color-neutral-black)` via inline style
  - [x] Keyboard selection: wrap the payee container in a `<div tabIndex={0}>` with `onKeyDown`; Space key or Enter sets the selection to the full payee text as a convenience default (full substring select); this satisfies the keyboard-selectable requirement without complex caret tracking
  - [x] Live preview line below payee spans: when `selectedSubstring` is non-empty, render `<div className="type-caption">Match: {selectedSubstring} → {envelopeName ?? '…'}</div>` in `var(--color-text-secondary)`; hide when substring is empty
  - [x] No external dependencies — implement with React state only; no drag library

- [x] Task 2: Extend `UnknownMerchantQueue` to support "Save as rule" mode per queue item (AC: 1, 3, 4, 5, 6)
  - [x] Add per-component state: `ruleBuilderItemId: number | null` (which item has rule builder open), `pendingEnvelopeId: number | null` (category selected in rule-builder mode), `selectedSubstring: string`
  - [x] For each queue item, render a "Save as rule" toggle button next to the category Select — only enabled once a category has been assigned OR when in rule-builder mode; style as a small outlined button using design tokens, no external icon library needed (text label "Save as rule" is fine)
  - [x] When "Save as rule" is toggled for an item (`ruleBuilderItemId = tx.id`):
    - Replace the payee text with `<SubstringRuleBuilder>` passing the payee string, the envelope name (from `envelopes` prop), `selectedSubstring`, and `onSubstringChange`
    - Change the category Select `onValueChange` to: `setPendingEnvelopeId(Number(val))` (store locally, do NOT call `handleAssign`)
    - Render "Save rule" button (disabled when `selectedSubstring === '' || pendingEnvelopeId === null`): on click, call `handleRuleSave(tx.id)`
    - Render "Dismiss" text button: on click, call `handleRuleDismiss(tx.id)`
  - [x] `handleRuleSave(id)`: set `assigningId = id`; call `handleAssign(id, pendingEnvelopeId!)` then `useMerchantRuleStore.getState().createRule({ payeeSubstring: selectedSubstring, envelopeId: pendingEnvelopeId! })`; reset `ruleBuilderItemId`, `pendingEnvelopeId`, `selectedSubstring`; set `assigningId = null`
  - [x] `handleRuleDismiss(id)`: if `pendingEnvelopeId !== null`, call `handleAssign(id, pendingEnvelopeId)` (categorize without rule); otherwise reset rule-builder mode only without removing item from queue; reset `ruleBuilderItemId`, `pendingEnvelopeId`, `selectedSubstring`
  - [x] Normal mode (no rule builder): category Select `onValueChange` continues to call `handleAssign(tx.id, Number(val))` immediately — exact 4.3 behavior preserved

- [x] Task 3: Add Vitest tests for `SubstringRuleBuilder` and the extended `UnknownMerchantQueue` (AC: 1–6)
  - [x] Create `src/features/merchant-rules/SubstringRuleBuilder.test.tsx`:
    - Renders all payee characters as spans
    - `onSubstringChange` is called with correct substring after simulated mouse-drag (mousedown on index 0, mousemove to index 3, mouseup)
    - Selected characters receive `background: var(--color-lime)` styling
    - Live preview renders when `selectedSubstring` and `envelopeName` are provided
    - Live preview is absent when `selectedSubstring` is empty
    - Preview shows "…" when `envelopeName` is null
  - [x] Extend `src/features/transactions/UnknownMerchantQueue.test.tsx`:
    - "Save as rule" toggle button renders per queue item
    - Clicking "Save as rule" renders `SubstringRuleBuilder` for that item and does NOT call `updateTransaction` when category is selected via rule-builder mode Select
    - "Save rule" button is disabled when no substring or no category
    - "Save rule" button enabled when both substring and category present; clicking it calls `updateTransaction` then `createRule` with correct args
    - Clicking "Dismiss" with a `pendingEnvelopeId` calls `updateTransaction` (categorizes) but not `createRule`
    - Clicking "Dismiss" with no `pendingEnvelopeId` collapses builder without calling `updateTransaction`
    - Normal mode category Select still calls `updateTransaction` immediately (regression: 4.3 behavior preserved)

## Dev Notes

### Story Intent

Story 4.4 is a pure frontend story. No new Rust commands, no new SQLite columns, no new Tauri commands. All backend plumbing (`create_merchant_rule`, `update_transaction`) was established in Stories 4.1 and earlier. This story adds the inline rule-creation gesture to the existing unknown merchant queue.

### Key Behavioral Change from Story 4.3

In Story 4.3, selecting a category immediately fires `handleAssign`, which calls `updateTransaction` → removes the item from the queue. Story 4.4 **preserves this behavior for normal mode** but intercepts it when rule-builder mode is active:

- **Normal mode (toggle OFF):** Select category → `handleAssign` fires → item leaves queue. (Unchanged.)
- **Rule-builder mode (toggle ON):** Select category → stored in local `pendingEnvelopeId`; `handleAssign` is NOT called yet; item stays; user must confirm or dismiss.

### Existing Commands — No New Tauri Calls Needed

`create_merchant_rule` Tauri command is fully implemented (Story 4.1):
```typescript
// Already in useMerchantRuleStore.createRule():
await invoke<MerchantRule>('create_merchant_rule', { input });
```
Call via: `useMerchantRuleStore.getState().createRule({ payeeSubstring, envelopeId })`

`update_transaction` is called via the existing `handleAssign` pattern (Story 4.3):
```typescript
await useTransactionStore.getState().updateTransaction({ id: transactionId, envelopeId });
await useEnvelopeStore.getState().loadEnvelopes();
```

### SubstringRuleBuilder — Character-Span Selection Pattern

Render each character as an individual `<span>`. Track `dragStart: number | null` and `dragEnd: number | null` in local state. On mouse events:

```typescript
// Mouse selection tracking
onMouseDown={(e) => { e.preventDefault(); setDragStart(index); setDragEnd(index); setIsSelecting(true); }}
onMouseMove={() => { if (isSelecting) setDragEnd(index); }}
onMouseUp={() => { setIsSelecting(false); const lo = Math.min(dragStart!, dragEnd!); const hi = Math.max(dragStart!, dragEnd!); onSubstringChange(payee.slice(lo, hi + 1)); }}
```

A character at `index` is highlighted when `Math.min(dragStart, dragEnd) <= index <= Math.max(dragStart, dragEnd)` and drag is in progress or committed.

Use `user-select: none` on the payee container div to prevent the browser's native text selection interfering.

**Global mouseup**: Use `useEffect` to attach a `window.addEventListener('mouseup', ...)` handler that clears `isSelecting` so drag releases correctly even when the mouse leaves the component. Clean up on unmount.

### File Structure — New `merchant-rules/` Folder

This story creates the first file in `src/features/merchant-rules/`:

```
src/features/merchant-rules/
└── SubstringRuleBuilder.tsx    ← new (Story 4.4)
└── SubstringRuleBuilder.test.tsx ← new (Story 4.4)
```

Story 4.6 will add `MerchantRulesScreen.tsx`, `RuleEditor.tsx`, and `RuleConflictBanner.tsx` here.

**Do NOT create** `MerchantRulesScreen.tsx` or `RuleEditor.tsx` in this story — those are Story 4.6.
**Do NOT add a `/merchant-rules` route** — that is Story 4.6.

### Design Token Reference

| Token | Value | Use |
|-------|-------|-----|
| `var(--color-lime)` | `#C0F500` | Lime highlight on selected substring |
| `var(--color-neutral-black)` | `#111214` | Text color on lime highlight (dark on lime = legible) |
| `var(--color-text-secondary)` | `#888A90` | Preview text, "Save as rule" label |
| `var(--color-text-primary)` | `#EEEEF0` | Payee text |
| `var(--color-border)` | `#26282C` | Rule builder container border if needed |
| `var(--color-bg-surface)` | `#1C1E21` | Rule builder section background if needed |

"Save as rule" button styling: use `variant="outline"` (shadcn/ui Button) — already used in `LedgerView.tsx`. Set to a small size (add `size="sm"` if the Button component supports it, else use `className` for sizing).

### UX Rules — Non-Negotiable

- Inline only — no modal, no navigation to settings
- The rule confirmation ("Save rule" button) must be disabled until both `selectedSubstring !== ''` and `pendingEnvelopeId !== null`
- On dismiss with no category selected: the rule builder collapses; the item stays in normal mode so the user can still assign a category
- On dismiss with a category selected: the transaction is categorized (without a rule) and the item leaves the queue
- `useTransactionStore.getState().updateTransaction` must only be called ONCE per transaction (either by rule-save path or dismiss-with-category path, never both)
- Do NOT call `loadEnvelopes()` after `createRule` — `loadEnvelopes` is only needed after `updateTransaction` (which affects balances); rule creation does not affect envelope balances

### Component Layout Within Queue Item (Rule-Builder Mode)

```
┌─ queue item ──────────────────────────────────────────────────┐
│ [interactive payee spans: K r o g e r   # 0 4 2 3]            │
│  Match: Kroger → Groceries                                      │  ← live preview
│                                                                 │
│ [date]  [amount]  [Category ▼]  [Save rule ▷]  [Dismiss]       │
└─────────────────────────────────────────────────────────────────┘
```

Category Select in rule-builder mode is still shown so the user can pick/change the category before confirming.

### Testing Requirements

- **Vitest + React Testing Library** only — no Playwright in this story
- Mock `useMerchantRuleStore.getState().createRule` using `vi.spyOn(useMerchantRuleStore, 'getState')` or import-mock approach consistent with existing store test patterns
- For SubstringRuleBuilder mouse events: use `fireEvent.mouseDown`, `fireEvent.mouseMove`, `fireEvent.mouseUp` on character spans — RTL `fireEvent` is sufficient
- The keyboard "select all" test: fire `keyDown` with key `' '` (Space) or `'Enter'` on the payee container and assert `onSubstringChange` is called with the full payee string
- Pre-existing `BorrowOverlay.test.tsx` failures (13 tests) are confirmed pre-existing — do not fix in this story; run full suite and confirm no NEW failures beyond the pre-existing 13

### Library / Framework Requirements

Remain on pinned versions:
- React 19
- Zustand 5
- Tauri API v2
- Vitest 3
- shadcn/ui Button + Select (already installed)

**No new npm packages.** No new Rust crates. No new Tauri commands. No new SQL migrations.

### File Structure Requirements

Expected new files:
- `src/features/merchant-rules/SubstringRuleBuilder.tsx`
- `src/features/merchant-rules/SubstringRuleBuilder.test.tsx`

Expected modified files:
- `src/features/transactions/UnknownMerchantQueue.tsx` (add "Save as rule" toggle + rule-builder mode)
- `src/features/transactions/UnknownMerchantQueue.test.tsx` (extend with rule-builder tests)

Do NOT modify:
- Any Rust files
- `src/lib/types.ts` (no new types needed — `CreateMerchantRuleInput` and `MerchantRule` already exist)
- `src/stores/useMerchantRuleStore.ts` (already complete)
- `src/features/transactions/LedgerView.tsx` (no changes needed)
- Any migration files

### Out of Scope

- Story 4.5: Rule-application forward-only policy / UI
- Story 4.6: `/merchant-rules` screen, `MerchantRulesScreen`, `RuleEditor`, `RuleConflictBanner`
- Editing or deleting existing rules from within the queue
- Applying the new rule retroactively to past transactions
- Persisting the in-progress rule-builder state across sessions or queue resets

### Previous Story Intelligence (4.3)

Key patterns established in 4.3 that this story extends:

1. `handleAssign` in `UnknownMerchantQueue.tsx` — do NOT refactor; only add the rule-builder-mode bypass that prevents it from firing immediately
2. The `assigningId` state (disables the Select during an in-flight call) — preserve; extend it to also disable "Save rule" while the combined call is in flight
3. `sortWithMRU` — unchanged; MRU still applies in rule-builder mode category Select
4. Story 4.3 added `queueIds` deduplication in `LedgerView.tsx` — unchanged
5. `formatTxDate` and `formatCurrency` are already imported in `UnknownMerchantQueue.tsx` — use them, do not re-import

### Git / Repo Intelligence

- `useMerchantRuleStore.ts` lives in `src/stores/`, not `src/features/merchant-rules/` — that's the established pattern; do not move it
- `invoke` is always imported from `@tauri-apps/api/core`
- Zustand stores use optimistic update → rollback pattern; `useMerchantRuleStore.createRule` already implements this
- Recent commits are sparse in git log; read source files directly

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4: Substring Rule Builder]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4: Merchant Rules & Smart Categorization]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Unknown Queue Item]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Substring Rule Builder]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#File Structure]
- [Source: _bmad-output/implementation-artifacts/4-3-unknown-merchant-queue-manual-categorization.md#Dev Notes]
- [Source: src/features/transactions/UnknownMerchantQueue.tsx]
- [Source: src/stores/useMerchantRuleStore.ts]
- [Source: src/lib/types.ts#CreateMerchantRuleInput]
- [Source: src/styles.css#color tokens]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Story created 2026-04-08. Comprehensive context engine analysis completed — all backend plumbing is in place (create_merchant_rule from 4.1, update_transaction from earlier stories, useMerchantRuleStore fully implemented); this story is pure frontend addition to UnknownMerchantQueue.tsx with a new SubstringRuleBuilder component in the new src/features/merchant-rules/ folder.

Implementation completed 2026-04-08. SubstringRuleBuilder uses React-only mouse/keyboard state to track character span selection (dragStart/dragEnd indices), applies lime highlight via inline styles, and shows a live Match preview. UnknownMerchantQueue extended with ruleBuilderItemId/pendingEnvelopeId/selectedSubstring per-component state; Save rule calls updateTransaction then createRule; Dismiss with category categorizes without a rule; Dismiss without category collapses builder; normal-mode Select fires handleAssign immediately (4.3 regression preserved). 8 SubstringRuleBuilder tests + 8 new UnknownMerchantQueue rule-builder tests all pass. Only pre-existing 13 BorrowOverlay failures remain (unchanged).

### File List

- `src/features/merchant-rules/SubstringRuleBuilder.tsx` (new)
- `src/features/merchant-rules/SubstringRuleBuilder.test.tsx` (new)
- `src/features/transactions/UnknownMerchantQueue.tsx` (modified)
- `src/features/transactions/UnknownMerchantQueue.test.tsx` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

### Review Findings

- [x] [Review][Decision] "Save as rule" button always enabled — dismissed; always-enabled is correct given normal-mode select immediately removes the item; the inner "Save rule" button is already properly guarded (AC5)

- [x] [Review][Patch] AC2 violation: preview visible when no category selected — fixed: condition changed to `selectedSubstring && envelopeName !== null`; "→ …" placeholder removed [`src/features/merchant-rules/SubstringRuleBuilder.tsx:101`]
- [x] [Review][Patch] `assigningId` gap: `handleAssign` clears it before `createRule` finishes — fixed: `setAssigningId(id)` re-set after `handleAssign` returns, before `createRule` is awaited [`src/features/transactions/UnknownMerchantQueue.tsx:80`]
- [x] [Review][Patch] `handleRuleDismiss` swallows `handleAssign` errors — fixed: try/catch added; on error, returns early keeping the builder open for retry [`src/features/transactions/UnknownMerchantQueue.tsx:95`]
- [x] [Review][Patch] Uncontrolled Select retains stale displayed value after reset — fixed: `key={`${tx.id}-${isRuleBuilderMode ? 'rb' : 'normal'}`}` forces remount on mode toggle [`src/features/transactions/UnknownMerchantQueue.tsx:164`]
- [x] [Review][Patch] `useEffect` closure staleness: `handleGlobalMouseUp` may read stale `isSelecting=false` — fixed: added `dragStateRef` to mirror drag state; effect now reads from ref, depends only on `[payee, onSubstringChange]` [`src/features/merchant-rules/SubstringRuleBuilder.tsx:39`]

- [x] [Review][Defer] `isHighlighted` first-occurrence only — if `selectedSubstring` appears multiple times in the payee, only the first occurrence is highlighted; visual ambiguity for repeated-char payees [`src/features/merchant-rules/SubstringRuleBuilder.tsx:31`] — deferred, pre-existing UX polish
- [x] [Review][Defer] No cancel mechanism for drag released outside component — releasing mouse outside component always commits the last in-component `dragEnd`; user cannot abort a drag [`src/features/merchant-rules/SubstringRuleBuilder.tsx:39`] — deferred, out of scope for this story
- [x] [Review][Defer] `formatTxDate` uses local midnight, not UTC — `new Date(date + 'T00:00:00')` parses as local time; in UTC-offset timezones the displayed date can be one day off [`src/features/transactions/UnknownMerchantQueue.tsx:18`] — deferred, pre-existing pattern
- [x] [Review][Defer] Stale MRU ids never pruned when envelopes deleted — `mruIds` state retains deleted envelope IDs permanently, silently consuming MRU slots [`src/features/transactions/UnknownMerchantQueue.tsx:27`] — deferred, pre-existing
- [x] [Review][Defer] Silent queue mismatch when queueId has no matching transaction — `filter(Boolean)` drops unresolved IDs with no warning; header count and parent expectations diverge silently [`src/features/transactions/UnknownMerchantQueue.tsx:57`] — deferred, pre-existing

### Change Log

- Story 4.4 implemented: SubstringRuleBuilder component + UnknownMerchantQueue rule-builder mode (Date: 2026-04-08)
- Code review completed (Date: 2026-04-08): 1 decision-needed, 5 patch, 5 deferred, 5 dismissed
