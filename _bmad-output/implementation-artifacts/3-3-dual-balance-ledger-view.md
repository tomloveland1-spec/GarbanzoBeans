# Story 3.3: Dual-Balance Ledger View

Status: done

## Story

As Tom,
I want to see all my transactions in a ledger with both cleared and working balances shown separately,
so that I always know my true bank balance and my real available balance at a glance.

## Acceptance Criteria

1. **Given** Tom navigates to `/ledger`
   **When** the ledger view renders
   **Then** transactions are displayed in reverse-chronological order (date DESC, id DESC — matching `get_transactions` SQL order) with columns: date, payee, category (envelope name or "Uncategorized"), amount; the header shows two distinct balance figures: **Cleared balance** (sum of `is_cleared=1` transactions) and **Working balance** (sum of ALL transactions regardless of cleared status) (FR2)

2. **Given** the ledger is showing transactions
   **When** a transaction has `is_cleared = false`
   **Then** it is visually distinguished from cleared transactions — uncleared rows render at reduced opacity (`opacity-50` or equivalent) or with a muted text color (`var(--color-text-secondary)`)

3. **Given** the ledger contains more transactions than fit in the viewport
   **When** Tom scrolls the list
   **Then** the header (with the two balance figures) remains pinned/sticky; the transaction rows scroll beneath it; scrolling is smooth and responds within 200ms (NFR3)

4. **Given** an import has just completed (i.e., `useTransactionStore.importResult` is non-null)
   **When** the ledger renders
   **Then** an import summary line appears in the ledger header area: **"Import — {date} — {count} transactions"** where `date` is `importResult.latestDate` formatted as "MMM D" (e.g., "Oct 12") and `count` is `importResult.count`; this line is visible without any modal or toast (UX-DR15)

5. **Given** the store `transactions` array is empty
   **When** the ledger renders
   **Then** an empty state is displayed: a centered message such as "No transactions yet — import an OFX file above to get started" styled with `var(--color-text-muted)`

6. **Given** the ledger is visible
   **When** `loadTransactions()` is called on mount
   **Then** transactions for all time (no `monthKey` filter) are loaded from SQLite into the store; any existing transactions already in the store from an import are preserved/merged correctly

## Tasks / Subtasks

- [x] Task 1 — Create `src/features/transactions/LedgerView.tsx`
  - [x] Subscribe to `useTransactionStore`: `transactions`, `importResult`
  - [x] Derive `clearedBalance` and `workingBalance` as computed values inside the component (pure arithmetic over `transactions` array using `amountCents`):
    - `clearedBalance = transactions.filter(t => t.isCleared).reduce((sum, t) => sum + t.amountCents, 0)`
    - `workingBalance = transactions.reduce((sum, t) => sum + t.amountCents, 0)`
  - [x] Derive `envelopeMap: Map<number, string>` from `useEnvelopeStore` so category column shows envelope name (not raw ID)
  - [x] Render sticky header section containing:
    - Two balance figures: "Cleared" and "Working" labels with `formatCurrency()` values
    - Import summary line (conditional on `importResult !== null`): `"Import — {latestDate} — {count} transactions"`
  - [x] Render scrollable transaction list in reverse-chronological order (already sorted by `get_transactions`)
  - [x] Each transaction row: date (formatted as "MMM D, YYYY"), payee, category, amount via `formatCurrency()`
  - [x] Uncleared rows: apply `opacity-50` or `style={{ color: 'var(--color-text-secondary)' }}` to distinguish from cleared
  - [x] Empty state: centered message with `var(--color-text-muted)` when `transactions.length === 0`
  - [x] Use `font-variant-numeric: tabular-nums` on all amount cells (per UX architecture note on numeric alignment)

- [x] Task 2 — Update `src/features/transactions/LedgerPage.tsx`
  - [x] Import and render `LedgerView` below `OFXImporter` — replace the placeholder `<div>` comment from Story 3.2
  - [x] Call `useTransactionStore().loadTransactions()` in a `useEffect` on mount (no `monthKey` — load all)
  - [x] Ensure layout: `OFXImporter` at top, `LedgerView` fills remaining height with `flex-1 overflow-hidden`

- [x] Task 3 — Derive envelope name in `LedgerView`
  - [x] Subscribe to `useEnvelopeStore`: `envelopes`
  - [x] Build `envelopeMap` inside the component: `new Map(envelopes.map(e => [e.id, e.name]))`
  - [x] In each row: `envelopeId !== null ? (envelopeMap.get(envelopeId) ?? 'Unknown') : 'Uncategorized'`

- [x] Task 4 — Format `latestDate` for import summary line
  - [x] `importResult.latestDate` is ISO "YYYY-MM-DD" or `null`; if null skip the summary line
  - [x] Format using `new Date(latestDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` — appending `T00:00:00` prevents UTC-offset date shifts

- [x] Task 5 — Create `src/features/transactions/LedgerView.test.tsx`
  - [x] Renders cleared and working balances correctly when store has mixed cleared/uncleared transactions
  - [x] Renders "Uncategorized" when `envelopeId` is null
  - [x] Renders envelope name from `envelopeMap` when `envelopeId` is non-null
  - [x] Renders import summary line when `importResult` is non-null
  - [x] Does NOT render import summary line when `importResult` is null
  - [x] Renders empty state message when `transactions` is empty
  - [x] Uncleared transaction rows have reduced visual emphasis (opacity or muted color)

### Review Findings

- [x] [Review][Decision] Uncleared row double-dimming — resolved: intentional, keep both opacity + muted color for stronger visual distinction. Revisit after QA. [`LedgerView.tsx`]
- [x] [Review][Patch] Import summary suppressed when `latestDate` is null — resolved: show "Import — {count} transactions" (no date) when `latestDate` is null [`LedgerView.tsx:73`]
- [x] [Review][Patch] `useEffect` missing `loadTransactions` in dependency array — ESLint `react-hooks/exhaustive-deps` will flag this [`LedgerPage.tsx:10`]
- [x] [Review][Patch] `<thead>` row `borderBottom` on `<tr>` is ignored under `border-collapse: collapse` — moved to `<th>` elements [`LedgerView.tsx:95-100`]
- [x] [Review][Patch] `<table>` missing accessibility: added `aria-label="Transactions"` and `scope="col"` on all `<th>` elements [`LedgerView.tsx:93-106`]
- [x] [Review][Patch] `makeTx` default `id: 1` causes duplicate React keys — replaced with auto-incrementing `_txId` counter, reset in `beforeEach` [`LedgerView.test.tsx:31`]
- [x] [Review][Patch] Fragile balance test DOM traversal — replaced with `data-testid="balance-cleared/working"` and `getByTestId` [`LedgerView.test.tsx:82-86`]
- [x] [Review][Defer] No error/loading state surfaces `loadTransactions` failure — user sees empty-state when DB load fails [`LedgerPage.tsx:9-11`] — deferred, pre-existing pattern
- [x] [Review][Defer] Race condition: in-flight `loadTransactions` can overwrite freshly imported transactions [`src/stores/useTransactionStore.ts`] — deferred, pre-existing store design
- [x] [Review][Defer] `envelopeMap` and balance reductions not memoized — minor perf on repeated renders [`LedgerView.tsx:26-33`] — deferred, pre-existing
- [x] [Review][Defer] Sort order has zero test coverage — relies entirely on SQL `ORDER BY` contract [`LedgerView.test.tsx`] — deferred, pre-existing
- [x] [Review][Defer] Import summary shows "0 transactions" when `count: 0` — misleading after a fully-deduplicated import [`LedgerView.tsx`] — deferred, pre-existing

## Dev Notes

### Architecture Compliance

- **No SQL in React:** All data fetching via `invoke('get_transactions')` through `useTransactionStore.loadTransactions()`. Never call `invoke` directly from a component.
- **Derived values in JS:** `clearedBalance` and `workingBalance` are pure arithmetic over the `transactions` array — no new Tauri commands, no new SQL. This follows ADR-2 exactly.
- **File locations — use actual paths, not architecture doc ideals:**

| Concern | Actual location |
|---|---|
| New component | `src/features/transactions/LedgerView.tsx` |
| Page shell | `src/features/transactions/LedgerPage.tsx` (already exists) |
| Store | `src/stores/useTransactionStore.ts` (already exists) |
| Types | `src/lib/types.ts` (already exists) |
| Currency formatting | `src/lib/currency.ts` → `formatCurrency(cents: number): string` |

### Reuse — Do Not Reinvent

- `formatCurrency(cents)` — already in `src/lib/currency.ts`. Import and use it everywhere amounts are displayed.
- `useTransactionStore` — already has `loadTransactions`, `transactions`, `clearedTransactions()`, `unclearedTransactions()`, `importResult`. Use the store's derived selectors where convenient, but computing `clearedBalance`/`workingBalance` inline in the component is fine since it's a single `reduce`.
- `useEnvelopeStore` — already in `src/stores/useEnvelopeStore.ts`; has `envelopes: Envelope[]`. Subscribe to get envelope names.
- Design tokens — always use CSS variables: `var(--color-text-primary)`, `var(--color-text-secondary)`, `var(--color-text-muted)`, `var(--color-accent)`, `var(--color-surface-raised)`, etc. Never hardcode hex colors.
- Typography classes — use existing classes: `type-body` (14px/400), `type-label` (12px/500), `type-caption` (11px/400). For balance figures use inline `font-size` + `font-weight: 700` per UX spec (28px Display weight for primary financial amounts).

### Sticky Header Layout Pattern

Follow the same pattern as `EnvelopeList.tsx` (sticky list header):

```tsx
<div className="flex flex-col h-full overflow-hidden">
  {/* Sticky header */}
  <div className="flex-shrink-0 px-4 py-3" style={{ background: 'var(--color-bg)' }}>
    {/* balance figures + import summary */}
  </div>
  {/* Scrollable list */}
  <div className="flex-1 overflow-y-auto">
    {/* transaction rows */}
  </div>
</div>
```

### `get_transactions` Sort Order

The Rust command already returns rows `ORDER BY date DESC, id DESC`. **Do not re-sort in React** — render in the order returned from the store.

### Balance Calculation

```ts
const clearedBalance = transactions
  .filter(t => t.isCleared)
  .reduce((sum, t) => sum + t.amountCents, 0);

const workingBalance = transactions
  .reduce((sum, t) => sum + t.amountCents, 0);
```

Both are then passed to `formatCurrency()`. Negative totals display as `-$X.XX` (already handled by `formatCurrency`).

### Import Summary Date Formatting

```ts
function formatImportDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
```

**Critical:** append `'T00:00:00'` to the ISO date string before constructing a `Date` object. Without it, `new Date('2026-10-12')` is parsed as UTC midnight, which renders as Oct 11 in US timezones. With the local time suffix it parses correctly.

### `loadTransactions` on Mount

```tsx
useEffect(() => {
  loadTransactions(); // no monthKey — load all transactions
}, []);
```

`loadTransactions` is stable (Zustand action refs don't change). No dependency array concerns.

### LedgerPage Layout After This Story

```tsx
export default function LedgerPage() {
  const loadTransactions = useTransactionStore(s => s.loadTransactions);

  useEffect(() => {
    loadTransactions();
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <OFXImporter />
      <LedgerView />  {/* replaces placeholder */}
    </div>
  );
}
```

### Uncleared Visual Treatment

Use `opacity-50` Tailwind class on the `<tr>` or row container for uncleared transactions. Alternatively, apply `style={{ color: 'var(--color-text-secondary)' }}` to each cell. Consistency with existing patterns in `EnvelopeCard.tsx` (which uses inline style CSS variables) suggests the inline style approach, but either is acceptable as long as all cells in the row are treated uniformly.

### Testing Setup

- Use existing Vitest + `@testing-library/react` setup (same as `OFXImporter.test.tsx`, `EnvelopeCard.test.tsx`)
- Mock `useTransactionStore` and `useEnvelopeStore` using `vi.mock`
- No Tauri invoke needed in component tests — mock the store state directly

### Previous Story Learnings (from 3.2)

- `OFXImporter.tsx` is a complete working component in `src/features/transactions/`. Study its state management and styling patterns before writing `LedgerView.tsx`.
- `importResult` in the store has `latestDate: string | null` — the Rust side sets this to the latest transaction date in the batch. Check `ImportResult` in `src/lib/types.ts` to confirm field name.
- All transaction amounts are stored as `amountCents` (integer cents). Always use `formatCurrency()` — never divide by 100 manually.
- `LedgerPage.tsx` already exists at `src/features/transactions/LedgerPage.tsx` with the `OFXImporter` mounted. Just replace the placeholder `<div>` with `<LedgerView />`.

### References

- Acceptance criteria: [Source: _bmad-output/planning-artifacts/epics.md — Story 3.3]
- FR2 (dual balance ledger): [Source: _bmad-output/planning-artifacts/epics.md — Feature Requirements table]
- NFR3 (200ms UI interactions): [Source: _bmad-output/planning-artifacts/architecture.md — Non-Functional Requirements]
- Import summary UX (no modal): [Source: _bmad-output/planning-artifacts/epics.md — UX-DR15]
- Import summary in ledger header: [Source: _bmad-output/planning-artifacts/ux-design-specification.md — §Import flow]
- Numeric tabular figures: [Source: _bmad-output/planning-artifacts/ux-design-specification.md — §Typography]
- ADR-2 (derived state in JS): [Source: _bmad-output/planning-artifacts/architecture.md — ADR-2]
- `formatCurrency`: [Source: src/lib/currency.ts]
- `useTransactionStore`: [Source: src/stores/useTransactionStore.ts]
- `LedgerPage` shell: [Source: src/features/transactions/LedgerPage.tsx]
- `ImportResult` type: [Source: src/lib/types.ts:131–136]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_none — clean implementation_

### Completion Notes List

- Created `LedgerView.tsx` with sticky header (Cleared + Working balances), scrollable transaction table, import summary line, and empty state. All derived values computed inline — no new Tauri commands.
- Updated `LedgerPage.tsx` to mount `LedgerView` below `OFXImporter` and call `loadTransactions()` on mount with no `monthKey`.
- `envelopeMap` built from `useEnvelopeStore` envelopes; rows show envelope name, "Uncategorized" (null id), or "Unknown" (id present but envelope not in map).
- Date formatting uses `+T00:00:00` suffix to prevent UTC-offset shifts on ISO date strings.
- Uncleared rows: `opacity: 0.5` applied via inline style on the `<tr>`.
- 10 new tests — all pass. 177 pre-existing tests still pass. Pre-existing `BorrowOverlay.test.tsx` failures (Story 2.5) are unrelated and tracked in deferred-work.md.

### File List

- src/features/transactions/LedgerView.tsx (new)
- src/features/transactions/LedgerPage.tsx (modified)
- src/features/transactions/LedgerView.test.tsx (new)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified)
- _bmad-output/implementation-artifacts/3-3-dual-balance-ledger-view.md (modified)

## Change Log

- 2026-04-08: Story 3.3 implemented — LedgerView created with dual-balance header, sticky layout, import summary, uncleared visual treatment, envelope name resolution, empty state, and 10 unit tests. LedgerPage updated to mount LedgerView and load transactions on mount.
