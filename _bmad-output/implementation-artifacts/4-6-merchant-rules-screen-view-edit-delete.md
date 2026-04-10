# Story 4.6: Merchant Rules Screen — View, Edit, Delete

Status: done

## Story

As Tom,
I want a dedicated screen to view all my merchant rules, see how often each one fires, and edit or delete them,
so that I can keep my ruleset clean and accurate over time.

## Acceptance Criteria

1. **Given** Tom navigates to `/merchant-rules`
   **When** the rules screen renders
   **Then** all merchant rules are listed with: payee substring, mapped category name, match count, last matched date; the list is sortable by match count (desc) and last matched date (desc) (FR10)

2. **Given** Tom clicks on a rule row to edit it
   **When** the edit form opens
   **Then** he can modify the payee substring and/or the mapped envelope; saving calls `updateRule`; the Rust backend creates a new rule version; past transactions are not retroactively recategorized

3. **Given** Tom clicks Delete on a rule
   **When** `deleteRule` succeeds
   **Then** the rule is removed from the store and the list immediately (optimistic); future imports no longer apply it; past transactions that matched retain their categorization

4. **Given** Tom overrides a transaction's category in the ledger (UnknownMerchantQueue or manual entry)
   **When** `updateTransaction` executes
   **Then** the transaction's `envelope_id` is updated; the underlying merchant rule is NOT modified (FR11) — this was implemented in Stories 3.5 / 4.5; this AC requires only verification that existing tests pass

## Tasks / Subtasks

- [x] Task 1: Create `RuleConflictBanner.tsx` (AC: 1)
  - [x] Create `src/features/merchant-rules/RuleConflictBanner.tsx`
  - [x] Read `conflictingRules()` from `useMerchantRuleStore` — call as `useMerchantRuleStore(s => s.conflictingRules())`
  - [x] Return `null` when the array is empty (renders nothing)
  - [x] When conflicts exist, render a styled warning section with `data-testid="rule-conflict-banner"`
  - [x] For each `[ruleA, ruleB]` pair render: `"{ruleA.payeeSubstring}" overlaps with "{ruleB.payeeSubstring}"` with `data-testid="conflict-pair-{ruleA.id}-{ruleB.id}"`
  - [x] Style with Dark Forest tokens: amber/warning tone — e.g., border with `var(--color-amber)` or `var(--color-text-secondary)`, caption text

- [x] Task 2: Create `RuleEditor.tsx` and `RuleEditor.test.tsx` (AC: 2, 3)
  - [x] Create `src/features/merchant-rules/RuleEditor.tsx`
  - [x] Props: `{ rule: MerchantRule; onClose: () => void }`
  - [x] Local state: `substring` (string, init to `rule.payeeSubstring`), `envelopeId` (number, init to `rule.envelopeId`)
  - [x] Text input for payee substring (`data-testid="rule-editor-substring-input"`) — do NOT use SubstringRuleBuilder here; that component requires a full transaction payee string for character-by-character selection; a simple text input is correct for editing a standalone substring
  - [x] shadcn/ui `<Select>` for envelope assignment populated from `useEnvelopeStore(s => s.envelopes)` — map each envelope to `<SelectItem value={String(e.id)}>{e.name}</SelectItem>`; `data-testid="rule-editor-envelope-select"`
  - [x] Save button (`data-testid="rule-editor-save"`): call `useMerchantRuleStore.getState().updateRule({ id: rule.id, payeeSubstring: substring, envelopeId })` then `onClose()`; disabled while `isWriting`
  - [x] Delete button (`data-testid="rule-editor-delete"`): call `useMerchantRuleStore.getState().deleteRule(rule.id)` then `onClose()`; disabled while `isWriting`
  - [x] Cancel button (`data-testid="rule-editor-cancel"`): call `onClose()` immediately
  - [x] Wrapper: `data-testid="rule-editor"`
  - [x] Read `isWriting` from `useMerchantRuleStore(s => s.isWriting)` and disable Save/Delete when true
  - [x] Create `src/features/merchant-rules/RuleEditor.test.tsx` with tests:
    - [x] Pre-fills substring input and envelope select from `rule` prop
    - [x] Save calls `updateRule` with correct args and then `onClose`
    - [x] Delete calls `deleteRule(rule.id)` and then `onClose`
    - [x] Cancel calls `onClose` without invoking any store action
    - [x] Save and Delete buttons are disabled when `isWriting: true`

- [x] Task 3: Create `MerchantRulesScreen.tsx` and `MerchantRulesScreen.test.tsx` (AC: 1, 2, 3)
  - [x] Create `src/features/merchant-rules/MerchantRulesScreen.tsx`
  - [x] Read `rules` and `isWriting` from `useMerchantRuleStore`
  - [x] Read `envelopes` from `useEnvelopeStore(s => s.envelopes)` to resolve envelope names by id
  - [x] Local state: `sortBy: 'matchCount' | 'lastMatchedAt'` (default `'matchCount'`)
  - [x] Local state: `selectedRuleId: number | null` (default `null`)
  - [x] Render `<RuleConflictBanner />` at the top of the screen
  - [x] Sort buttons: `data-testid="sort-by-match-count"` and `data-testid="sort-by-last-matched"` — clicking sets `sortBy`; active button visually distinguished (e.g., lime text or border)
  - [x] Sort logic: for `matchCount` sort by `rule.matchCount` descending; for `lastMatchedAt` sort by `rule.lastMatchedAt` descending (null values sort last)
  - [x] Map sorted rules to rows with `data-testid="rule-row-{rule.id}"` — show: payee substring, envelope name (resolved from envelopes array; fall back to `"Unknown"` if not found), match count, formatted lastMatchedAt (`lastMatchedAt ? new Date(lastMatchedAt).toLocaleDateString() : "Never"`)
  - [x] Clicking a rule row sets `selectedRuleId` to that rule's id
  - [x] When `selectedRuleId` is set and that rule exists, render `<RuleEditor rule={selectedRule} onClose={() => setSelectedRuleId(null)} />` below that row (or in a dedicated area); closing the editor resets `selectedRuleId` to null
  - [x] Empty state when `rules.length === 0`: `data-testid="empty-state"` with message "No merchant rules yet. Rules are created automatically when you categorize unknown transactions."
  - [x] Wrapper: `data-testid="merchant-rules-screen"`
  - [x] Create `src/features/merchant-rules/MerchantRulesScreen.test.tsx` with tests:
    - [x] Renders empty state when rules array is empty
    - [x] Renders a rule row for each rule in the store (payee substring, envelope name, match count)
    - [x] Default sort is by match count descending — rule with higher matchCount appears first
    - [x] Clicking sort-by-last-matched re-sorts rules by lastMatchedAt descending
    - [x] Clicking a rule row renders `RuleEditor` for that rule
    - [x] RuleEditor is not rendered when no rule is selected
    - [x] RuleConflictBanner is rendered (presence test — mock it or verify testid)

- [x] Task 4: Wire up router (AC: 1)
  - [x] In `src/router.tsx` (line 96-104), add import: `import MerchantRulesScreen from '@/features/merchant-rules/MerchantRulesScreen';`
  - [x] Replace placeholder component `() => <div className="p-6 type-body" ...>Merchant Rules — coming in Epic 4</div>` with `component: MerchantRulesScreen`
  - [x] Preserve existing `beforeLoad` guards (`guardOnboarding`, `guardTurnTheMonth`) — do NOT remove them
  - [x] No other router changes needed

- [x] Task 5: Verify AC4 (FR11) — no new code required (AC: 4)
  - [x] Run `npx vitest run src/stores/useMerchantRuleStore.test.ts` and confirm existing tests pass: `"createRule never calls update_transaction"` and `"updateRule never calls update_transaction"` (forward-only guarantee added in Story 4.5)
  - [x] Run `npx vitest run src/stores/useTransactionStore.test.ts` and confirm `updateTransaction` tests pass
  - [x] If any of these tests are missing or failing, add/fix them; DO NOT duplicate tests that already exist and pass
  - [x] Mark task complete once you have confirmed these tests pass

## Dev Notes

### What Already Exists — Do NOT Recreate or Modify

- **`src/stores/useMerchantRuleStore.ts`** — complete and correct; has `rules`, `isWriting`, `error`, `loadRules`, `createRule`, `updateRule`, `deleteRule`, `conflictingRules`; no changes needed
- **`src/stores/useMerchantRuleStore.test.ts`** — has forward-only tests added in Story 4.5; extend only if AC4 tests are missing
- **`src/features/merchant-rules/SubstringRuleBuilder.tsx`** — complete drag-to-select component used in the queue flow (Story 4.4); do NOT use it in `RuleEditor` for this screen (see below)
- **`src/lib/types.ts`** — `MerchantRule`, `CreateMerchantRuleInput`, `UpdateMerchantRuleInput`, `UpdateTransactionInput` all exist; no additions needed
- **`src/router.tsx` `/merchant-rules` route** — already registered at line 96-104; only the `component` property needs to change
- **All Tauri commands** — `create_rule`, `update_rule`, `delete_rule`, `get_merchant_rules`, `update_transaction` all exist in Rust backend; no new commands needed
- **No new migrations** — `merchant_rules` table schema (id, payee_substring, envelope_id, version, created_at, last_matched_at, match_count) is complete from Story 4.1

### Why NOT to Use SubstringRuleBuilder in RuleEditor

`SubstringRuleBuilder` is designed for the import queue flow: given a full transaction payee string like `"KROGER #0423 SEATTLE WA"`, it renders each character as an individually draggable `<span>` so Tom can highlight a substring. In `RuleEditor`, there is no source transaction payee — only the already-extracted `payeeSubstring` (e.g., `"KROGER"`). Using SubstringRuleBuilder here would require fabricating a fake payee string, which is confusing UX and incorrect usage. Use a plain text `<input>` for the substring field in `RuleEditor`.

### MerchantRule Type Reference

```typescript
interface MerchantRule {
  id: number;
  payeeSubstring: string;
  envelopeId: number;       // every rule maps to an envelope (never null)
  version: number;          // increments on each updateRule call (handled by Rust)
  createdAt: string;        // ISO 8601
  lastMatchedAt: string | null;  // null = never matched
  matchCount: number;       // increments on each import match
}
```

### updateRule Creates a New Version (Architecture)

When `updateRule` calls `invoke('update_merchant_rule', { input })`, the Rust backend increments `version` in the DB and returns the updated `MerchantRule` with the new version. The frontend receives this via the optimistic-then-reconcile pattern already in the store. No version handling needed in React — just call `updateRule` normally.

### conflictingRules() — How It Works

`conflictingRules()` is a computed getter (not a selector) inside the store. It scans all rules pairwise and returns `[MerchantRule, MerchantRule][]` for any pair where one `payeeSubstring` contains the other (case-insensitive). Example: rule `"KROGER"` and rule `"KROG"` conflict because `"krog"` is contained in `"kroger"`.

Call it as: `const conflicts = useMerchantRuleStore(s => s.conflictingRules());`

Note: this is a function call inside the selector — it re-runs whenever `rules` changes because `conflictingRules` closes over `get().rules`.

### Sorting Logic

```typescript
const sorted = [...rules].sort((a, b) => {
  if (sortBy === 'matchCount') return b.matchCount - a.matchCount;
  // lastMatchedAt: null sorts last
  if (!a.lastMatchedAt && !b.lastMatchedAt) return 0;
  if (!a.lastMatchedAt) return 1;
  if (!b.lastMatchedAt) return -1;
  return new Date(b.lastMatchedAt).getTime() - new Date(a.lastMatchedAt).getTime();
});
```

### Envelope Name Resolution

```typescript
const envelopes = useEnvelopeStore(s => s.envelopes);
const envelopeName = (envelopeId: number) =>
  envelopes.find(e => e.id === envelopeId)?.name ?? 'Unknown';
```

### Router Update — Exact Change

In `src/router.tsx` lines 96-104, change:
```typescript
const merchantRulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/merchant-rules',
  component: () => <div className="p-6 type-body" style={{ color: 'var(--color-text-primary)' }}>Merchant Rules — coming in Epic 4</div>,
  beforeLoad: () => {
    guardOnboarding();
    guardTurnTheMonth();
  },
});
```
To:
```typescript
const merchantRulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/merchant-rules',
  component: MerchantRulesScreen,
  beforeLoad: () => {
    guardOnboarding();
    guardTurnTheMonth();
  },
});
```
Add import at top of file: `import MerchantRulesScreen from '@/features/merchant-rules/MerchantRulesScreen';`

### AC4 — Already Implemented

`updateTransaction` in `useTransactionStore.ts` (lines 102-130) already:
- Calls `invoke('update_transaction', { input })` which updates `envelope_id` in SQLite
- Clears `matchedRuleAnnotation` from the transaction in the store after envelope change
- Never touches the `merchant_rules` table

Forward-only isolation tests already exist in `useMerchantRuleStore.test.ts` (added Story 4.5): `"createRule never calls update_transaction"` and `"updateRule never calls update_transaction"`. Task 5 is verification only.

### Testing Patterns

Mock stores in component tests using `vi.mock`:

```typescript
// Mock useMerchantRuleStore
vi.mock('@/stores/useMerchantRuleStore', () => {
  const mockUpdateRule = vi.fn();
  const mockDeleteRule = vi.fn();
  const store = {
    rules: [],
    isWriting: false,
    error: null,
    updateRule: mockUpdateRule,
    deleteRule: mockDeleteRule,
    loadRules: vi.fn(),
    createRule: vi.fn(),
    conflictingRules: () => [],
  };
  const useMerchantRuleStore = Object.assign(
    vi.fn((selector: (s: typeof store) => unknown) => selector(store)),
    { getState: vi.fn(() => store) }
  );
  return { useMerchantRuleStore };
});

// Mock useEnvelopeStore
vi.mock('@/stores/useEnvelopeStore', () => {
  const store = { envelopes: [] };
  const useEnvelopeStore = vi.fn((selector: (s: typeof store) => unknown) => selector(store));
  return { useEnvelopeStore };
});
```

Update `store.rules` in individual tests by casting the mock's return value or using `(useMerchantRuleStore as ReturnType<typeof vi.fn>).mockImplementation(...)`.

See `EnvelopeCard.test.tsx` for the established mock pattern with selector-style stores.

### Pre-Existing Test Failures

13 `BorrowOverlay.test.tsx` failures are pre-existing and unrelated to this story. When running the full test suite, confirm no NEW failures appear beyond those 13.

### Dark Forest Styling

Use only Dark Forest CSS token variables — no hardcoded colors:
- `var(--color-text-primary)` — main text
- `var(--color-text-secondary)` — secondary/caption text
- `var(--color-border)` — card/section borders
- `var(--color-lime)` — active/accent elements (active sort button)
- `var(--color-surface-card)` — card background
- `var(--color-bg)` — page background

Typography classes: `type-body`, `type-caption`, `type-label` (from existing design system).

shadcn/ui components available: `<Select>`, `<SelectTrigger>`, `<SelectContent>`, `<SelectItem>`, `<SelectValue>`, `<Button>` (or `<button>` with inline styles if needed) — all already themed against Dark Forest token set.

### Library / Framework Requirements

Pinned versions — no upgrades, no new packages:
- React 19, Zustand 5, Tauri API v2, Vitest 3, @testing-library/react
- **No new npm packages**
- **No new Rust crates**
- **No new Tauri commands**
- **No new SQL migrations**

### Project Structure Notes

New files in `src/features/merchant-rules/` (already exists with `.gitkeep` and `SubstringRuleBuilder*`):
- `MerchantRulesScreen.tsx` — new
- `MerchantRulesScreen.test.tsx` — new
- `RuleEditor.tsx` — new
- `RuleEditor.test.tsx` — new
- `RuleConflictBanner.tsx` — new

Modified:
- `src/router.tsx` — component swap only (lines 99)

**Do NOT create or modify:**
- Any `.rs` Rust files
- `src/lib/types.ts`
- Any migration files (`src-tauri/migrations/`)
- `src/stores/useMerchantRuleStore.ts`
- `src/features/merchant-rules/SubstringRuleBuilder.tsx`
- `src/features/merchant-rules/SubstringRuleBuilder.test.tsx`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.6]
- [Source: _bmad-output/planning-artifacts/architecture.md#merchant-rules/ folder]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-5 State Management]
- [Source: _bmad-output/planning-artifacts/architecture.md#Risk 4: Merchant Rule Maintenance Burden]
- [Source: _bmad-output/implementation-artifacts/4-5-rule-application-forward-only-on-future-imports.md#Out of Scope]
- [Source: src/stores/useMerchantRuleStore.ts]
- [Source: src/stores/useMerchantRuleStore.test.ts]
- [Source: src/stores/useTransactionStore.ts#updateTransaction]
- [Source: src/features/merchant-rules/SubstringRuleBuilder.tsx]
- [Source: src/router.tsx#merchantRulesRoute]
- [Source: src/features/envelopes/EnvelopeCard.test.tsx — mock pattern]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Story created 2026-04-08. The `useMerchantRuleStore` (all CRUD + `conflictingRules`), all Tauri backend commands, and the schema are complete from Stories 4.1–4.5. This story is purely frontend: three new components (`MerchantRulesScreen`, `RuleEditor`, `RuleConflictBanner`), a router wire-up, and AC4 verification. No new backend work required.

Implemented 2026-04-08:
- `RuleConflictBanner.tsx`: reads `conflictingRules()` selector, renders null when empty, renders amber-bordered warning with per-pair `data-testid` when conflicts exist.
- `RuleEditor.tsx`: inline edit form with text input for payeeSubstring, shadcn Select for envelope, Save/Delete/Cancel buttons with `isWriting` disabled state. Save calls `updateRule`, Delete calls `deleteRule`, Cancel closes without store action.
- `RuleEditor.test.tsx`: 7 tests — pre-fill, Save, Delete, Cancel, disabled-when-writing. All pass.
- `MerchantRulesScreen.tsx`: table view of sorted rules, dual sort buttons (matchCount / lastMatchedAt), envelope name resolution, empty state, inline RuleEditor on row click, RuleConflictBanner at top. Uses `Fragment` key pattern to avoid React key warning.
- `MerchantRulesScreen.test.tsx`: 9 tests — empty state, row rendering, sort defaults, sort-by-lastMatched, editor open/close, banner presence. All pass.
- `src/router.tsx`: swapped placeholder component for `MerchantRulesScreen`, added import. Guards preserved.
- AC4 verified: 18 `useMerchantRuleStore` tests and 26 `useTransactionStore` tests all pass. Forward-only guarantee confirmed.
- Full suite: 277 pass, 13 pre-existing BorrowOverlay failures (unrelated to this story).

### File List

- src/features/merchant-rules/RuleConflictBanner.tsx (new)
- src/features/merchant-rules/RuleEditor.tsx (new)
- src/features/merchant-rules/RuleEditor.test.tsx (new)
- src/features/merchant-rules/MerchantRulesScreen.tsx (new)
- src/features/merchant-rules/MerchantRulesScreen.test.tsx (new)
- src/router.tsx (modified — component swap + import)

### Review Findings

- [x] [Review][Decision] No `loadRules()` on mount in `MerchantRulesScreen` — AC1: screen reads `s.rules` from store but never calls `loadRules()` on mount; if rules store is empty on first navigation (before any import), screen shows empty state even when rules exist in the DB. Decision needed: is there app-level initialization that calls `loadRules()`, or does each screen load its own data?
- [x] [Review][Patch] No client-side validation for empty/whitespace `payeeSubstring` on save — user can submit `payeeSubstring: ""` or `"   "` to `updateRule`; no guard on Save button or in `handleSave` [src/features/merchant-rules/RuleEditor.tsx:26]
- [x] [Review][Defer] `handleSave` fire-and-forget — `updateRule` not awaited; editor closes before backend write confirms; if `updateRule` rejects, the store rolls back but user sees no error feedback [src/features/merchant-rules/RuleEditor.tsx:25-28] — deferred, pre-existing optimistic pattern
- [x] [Review][Defer] `loadRules().catch(() => {})` swallows post-import failure silently — no user feedback if rule stat refresh fails; match counts remain stale [src/stores/useTransactionStore.ts:93] — deferred, pre-existing
- [x] [Review][Defer] Sort by `matchCount` has no tiebreaker — equal counts yield non-deterministic order [src/features/merchant-rules/MerchantRulesScreen.tsx:20-26] — deferred, spec does not define tiebreaker
- [x] [Review][Defer] Orphaned envelope IDs render "Unknown" with no visual warning or repair path — deleted envelope leaves rule pointing to a ghost ID [src/features/merchant-rules/MerchantRulesScreen.tsx:17-18] — deferred, out of scope for this story
- [x] [Review][Defer] `toLocaleDateString()` uses OS locale — date format varies by user environment with no normalization [src/features/merchant-rules/MerchantRulesScreen.tsx:127] — deferred, pre-existing convention

### Change Log

- 2026-04-08: Implemented Merchant Rules Screen (Story 4.6) — added RuleConflictBanner, RuleEditor, MerchantRulesScreen components with full test coverage; wired /merchant-rules route; verified AC4 forward-only isolation tests.
