# Story 5.6: Savings Flow Chart — Monthly Trend

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want to see a bar chart of my monthly savings deposits and withdrawals for the last 6 months,
So that I can tell at a glance whether my savings behavior is trending in the right direction.

## Acceptance Criteria

1. **AC1: Bar Chart Renders with Monthly Bars**
   - Given savings transactions exist across multiple months
   - When the Savings Flow Chart renders
   - Then a Recharts BarChart shows up to 6 monthly bars; positive bars use `--color-savings-positive` (`#90c820`); negative bars use `--color-savings-negative` (`#ff5555`); the current month's bar uses `--color-runway-healthy` (`#C0F500`); month labels appear below; no axes or gridlines shown (FR24, UX-DR5)

2. **AC2: Live Update on New Savings Transaction**
   - Given a savings transaction is imported or committed in the current month
   - When the store updates
   - Then the current month's bar grows to reflect the new net flow without a refresh (FR25)

3. **AC3: Only Available Months Shown**
   - Given fewer than 6 months of data exist
   - When the chart renders
   - Then only available months are shown; no empty zero bars for missing months

4. **AC4: Empty State When No Data**
   - Given no savings transactions exist
   - When the chart renders
   - Then the chart renders without visible bars (empty state — no chart, no error)

5. **AC5: Chart Visible in WealthPanel**
   - Given Tom is on the Budget screen
   - When the WealthPanel renders
   - Then SavingsFlowChart is present alongside RunwayGauge

## Tasks / Subtasks

- [x] Task 1: Add Recharts dependency (AC: 1, 2, 3)
  - [x] 1.1: Run `npm install recharts@^2.15.0` — adds recharts to `package.json` dependencies. Verify install succeeds and `package-lock.json` updates. This is a required architecture dependency (FR24, UX-DR5, architecture.md line 54).

- [x] Task 2: Add new Rust command `get_savings_flow_by_month` (AC: 1, 2, 3, 4)
  - [x] 2.1: Add `SavingsFlowMonth` struct to `src-tauri/src/commands/mod.rs` (near line 2600, before `map_savings_reconciliation_row`):
    ```rust
    #[derive(Debug, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SavingsFlowMonth {
        pub month: String,          // "YYYY-MM"
        pub net_flow_cents: i64,    // positive = net deposit; negative = net withdrawal
    }
    ```
  - [x] 2.2: Add inner function `get_savings_flow_by_month_inner` immediately after `get_avg_monthly_essential_spend_cents_inner` (around line 2771):
    ```rust
    fn get_savings_flow_by_month_inner(
        conn: &rusqlite::Connection,
    ) -> Result<Vec<SavingsFlowMonth>, AppError> {
        // Returns monthly net savings flow for the last 6 calendar months (inclusive of current).
        // Sign: SUM(-amount_cents) → positive = deposit to savings (money going in).
        // date filter: first day of the month 5 months ago → covers 6 months total.
        let mut stmt = conn.prepare(
            "SELECT strftime('%Y-%m', t.date) AS month, \
                    SUM(-t.amount_cents) AS net_flow_cents \
             FROM transactions t \
             JOIN envelopes e ON t.envelope_id = e.id \
             WHERE e.is_savings = 1 \
               AND t.date >= date('now', 'start of month', '-5 months') \
             GROUP BY strftime('%Y-%m', t.date) \
             ORDER BY month ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(SavingsFlowMonth {
                    month: row.get(0)?,
                    net_flow_cents: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        Ok(rows)
    }

    #[tauri::command]
    pub fn get_savings_flow_by_month(
        state: State<DbState>,
    ) -> Result<Vec<SavingsFlowMonth>, AppError> {
        let conn = state.0.lock().map_err(|_| AppError {
            code: "DB_LOCK_POISON".to_string(),
            message: "Database mutex was poisoned.".to_string(),
        })?;
        get_savings_flow_by_month_inner(&conn)
    }
    ```
  - [x] 2.3: Add Rust unit tests for `get_savings_flow_by_month_inner` at the end of the `savings_tests` module (around line 2870). Add `get_savings_flow_by_month_inner` to the `use super::{}` import at line ~2777. Write tests:
    - `test_get_savings_flow_by_month_empty_returns_empty` — fresh DB, no transactions → returns `[]`
    - `test_get_savings_flow_by_month_aggregates_by_month` — insert 2 savings transactions in the same month → `net_flow_cents` = sum of both (sign-flipped). Insert one savings transaction in a different month → separate entry.
    - `test_get_savings_flow_by_month_sign_convention` — deposit (negative `amount_cents`) → `net_flow_cents` positive. Withdrawal (positive `amount_cents`) → `net_flow_cents` negative.
    - `test_get_savings_flow_by_month_excludes_non_savings_envelopes` — transaction in a non-savings envelope is excluded.
    Note: To insert test transactions, you must first create an envelope with `is_savings = 1`. Use the existing `create_envelope_inner` helper if available in test scope, or insert directly via SQL in tests.
  - [x] 2.4: Register `get_savings_flow_by_month` in `src-tauri/src/lib.rs`. Find the savings commands block (around line 134–137) and add after `get_avg_monthly_essential_spend_cents`:
    ```rust
    commands::get_savings_flow_by_month,
    ```
  - [x] 2.5: Run `cargo test` (or `cargo build`) inside `src-tauri/` to confirm all Rust tests pass including the new tests. Fix any compilation or logic errors before proceeding.

- [x] Task 3: Add `SavingsFlowMonth` type to frontend and update store (AC: 1, 2, 3, 4)
  - [x] 3.1: Add `SavingsFlowMonth` interface to `src/lib/types.ts` (after the `SavingsReconciliation` interface near line 199):
    ```typescript
    // Monthly savings flow aggregation — returned by get_savings_flow_by_month Tauri command.
    // net_flow_cents: positive = net deposit (money into savings), negative = net withdrawal.
    export interface SavingsFlowMonth {
      month: string;          // "YYYY-MM"
      netFlowCents: number;
    }
    ```
  - [x] 3.2: Update `src/stores/useSavingsStore.ts` — add `monthlyFlow` state and `loadMonthlyFlow` action:
    - Add `SavingsFlowMonth` to the import: `import type { SavingsReconciliation, Transaction, SavingsFlowMonth } from '@/lib/types';`
    - Add to `SavingsState` interface:
      ```typescript
      monthlyFlow: SavingsFlowMonth[];
      loadMonthlyFlow: () => Promise<void>;
      ```
    - Add initial state: `monthlyFlow: []`
    - Add action implementation after `loadAvgMonthlyEssentialSpend`:
      ```typescript
      loadMonthlyFlow: async () => {
        try {
          const monthlyFlow = await invoke<SavingsFlowMonth[]>('get_savings_flow_by_month');
          set({ monthlyFlow });
        } catch (err) {
          const e = err as { message?: string };
          set({ error: e.message ?? 'Failed to load monthly savings flow' });
        }
      },
      ```
    - Call `loadMonthlyFlow` in `loadReconciliations` — add `await get().loadMonthlyFlow();` after `loadSavingsTransactionsSince` call (inside the `if (reconciliations.length > 0)` block AND also when reconciliations.length === 0).
    - Call `loadMonthlyFlow` in `recordReconciliation` — add `await get().loadMonthlyFlow();` after `loadSavingsTransactionsSince` resolves.

    Final `loadReconciliations` flow:
    ```typescript
    loadReconciliations: async () => {
      try {
        const reconciliations = await invoke<SavingsReconciliation[]>('get_savings_reconciliations');
        set({ reconciliations });
        if (reconciliations.length > 0) {
          await get().loadSavingsTransactionsSince(reconciliations[reconciliations.length - 1]!.date);
        }
        await get().loadMonthlyFlow();
      } catch (err) {
        const e = err as { message?: string };
        set({ error: e.message ?? 'Failed to load reconciliations' });
      }
    },
    ```

    Final `recordReconciliation` — add `await get().loadMonthlyFlow();` after `await get().loadSavingsTransactionsSince(rec.date);`.

- [x] Task 4: Create `SavingsFlowChart` component and tests (AC: 1, 2, 3, 4)
  - [x] 4.1: Create `src/features/savings/SavingsFlowChart.test.tsx`. Mock recharts and useSavingsStore before writing any implementation. ALL tests must FAIL first.

    ```typescript
    import { vi, describe, it, expect, beforeEach } from 'vitest';
    import { render, screen } from '@testing-library/react';
    import SavingsFlowChart from './SavingsFlowChart';
    import type { SavingsFlowMonth } from '@/lib/types';

    // Mock recharts — SVG not supported in jsdom; test data flow, not rendering internals
    vi.mock('recharts', () => ({
      BarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
        <div data-testid="bar-chart" data-items={JSON.stringify(data)}>{children}</div>
      ),
      Bar: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="bar">{children}</div>
      ),
      XAxis: () => <div data-testid="x-axis" />,
      Cell: ({ fill }: { fill: string }) => <div data-testid="cell" data-fill={fill} />,
      ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="responsive-container">{children}</div>
      ),
    }));

    const savingsStore = {
      monthlyFlow: [] as SavingsFlowMonth[],
    };

    vi.mock('@/stores/useSavingsStore', () => ({
      useSavingsStore: vi.fn(() => savingsStore),
    }));

    const makeMonth = (month: string, netFlowCents: number): SavingsFlowMonth => ({
      month,
      netFlowCents,
    });

    describe('SavingsFlowChart', () => {
      beforeEach(() => {
        vi.clearAllMocks();
        savingsStore.monthlyFlow = [];
      });
      // ... tests
    });
    ```

  - [x] 4.2: Write these 7 tests in `SavingsFlowChart.test.tsx` — all must FAIL before implementation:
    - `'renders with data-testid="savings-flow-chart"'` — monthlyFlow=[makeMonth('2026-01', 100)], getByTestId('savings-flow-chart') present
    - `'renders nothing when no monthlyFlow data'` — monthlyFlow=[], queryByTestId('savings-flow-chart') is null (no chart rendered at all)
    - `'passes monthlyFlow data to BarChart'` — monthlyFlow=[makeMonth('2026-03', 500), makeMonth('2026-04', -200)], getByTestId('bar-chart') data attribute contains both entries
    - `'renders Cell for each data point'` — monthlyFlow=[makeMonth('2026-01', 100), makeMonth('2026-02', -50)], getAllByTestId('cell') has length 2
    - `'current month Cell uses runway-healthy color'` — monthlyFlow=[makeMonth(currentMonth, 300)], the Cell data-fill = `'var(--color-runway-healthy)'`
    - `'positive non-current month Cell uses savings-positive color'` — monthlyFlow=[makeMonth('2026-01', 500)], Cell data-fill = `'var(--color-savings-positive)'`
    - `'negative non-current month Cell uses savings-negative color'` — monthlyFlow=[makeMonth('2026-01', -300)], Cell data-fill = `'var(--color-savings-negative)'`

    For `currentMonth`, derive at the top of the test file:
    ```typescript
    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    ```

  - [x] 4.3: Create `src/features/savings/SavingsFlowChart.tsx`:

    ```tsx
    import { BarChart, Bar, XAxis, Cell, ResponsiveContainer } from 'recharts';
    import { useSavingsStore } from '@/stores/useSavingsStore';

    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

    function getBarColor(month: string, netFlowCents: number): string {
      if (month === currentMonth) return 'var(--color-runway-healthy)';
      if (netFlowCents >= 0) return 'var(--color-savings-positive)';
      return 'var(--color-savings-negative)';
    }

    function formatMonthLabel(month: string): string {
      const [year, m] = month.split('-');
      const date = new Date(parseInt(year!, 10), parseInt(m!, 10) - 1, 1);
      return date.toLocaleString('default', { month: 'short' });
    }

    export default function SavingsFlowChart() {
      const { monthlyFlow } = useSavingsStore();

      if (monthlyFlow.length === 0) return null;

      const data = monthlyFlow.map((entry) => ({
        month: formatMonthLabel(entry.month),
        monthKey: entry.month,
        netFlowCents: entry.netFlowCents,
      }));

      return (
        <div data-testid="savings-flow-chart" className="flex-1">
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={data} barCategoryGap="20%">
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
              />
              <Bar dataKey="netFlowCents" radius={[2, 2, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={getBarColor(entry.monthKey, entry.netFlowCents)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }
    ```

    **No YAxis** — bars carry the meaning; axis lines/ticks disabled per UX-DR5.
    **No CartesianGrid** — explicitly omitted per UX spec.
    **`radius={[2, 2, 0, 0]}`** — subtle rounded top corners per UX visual treatment.
    **`height={80}`** — compact height suitable for WealthPanel; story 5-7 will finalize layout dimensions.

  - [x] 4.4: Run `SavingsFlowChart.test.tsx` — all 7 tests must pass before proceeding.

- [x] Task 5: Update `useSavingsStore.test.ts` for new `loadMonthlyFlow` (AC: 2)
  - [x] 5.1: Open `src/stores/useSavingsStore.test.ts`. Add tests for `loadMonthlyFlow`:
    - `'loadMonthlyFlow populates monthlyFlow from invoke'` — mock `invoke('get_savings_flow_by_month')` to return `[{month:'2026-04', netFlowCents:500}]`; call `loadMonthlyFlow()`; assert `store.monthlyFlow` matches.
    - `'loadMonthlyFlow sets error on failure'` — mock `invoke('get_savings_flow_by_month')` to reject; call `loadMonthlyFlow()`; assert `store.error` is set and `store.monthlyFlow` remains `[]`.
    - Do NOT modify existing tests — only add new ones.
  - [x] 5.2: Run `useSavingsStore.test.ts` — all existing + new tests pass.

- [x] Task 6: Update `WealthPanel.tsx` and `WealthPanel.test.tsx` to include SavingsFlowChart (AC: 5)
  - [x] 6.1: Update `src/features/savings/WealthPanel.tsx`:
    - Add import: `import SavingsFlowChart from './SavingsFlowChart';`
    - Add `<SavingsFlowChart />` between `<RunwayGauge />` and the `<div className="flex-1">` ReconciliationForm wrapper:
    ```tsx
    import RunwayGauge from './RunwayGauge';
    import SavingsFlowChart from './SavingsFlowChart';
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
            <SavingsFlowChart />
            <div className="flex-1">
              <ReconciliationForm />
            </div>
          </div>
        </div>
      );
    }
    ```
  - [x] 6.2: Update `src/features/savings/WealthPanel.test.tsx`:
    - Add mock for SavingsFlowChart (same pattern as RunwayGauge mock):
      ```typescript
      vi.mock('./SavingsFlowChart', () => ({
        default: () => <div data-testid="savings-flow-chart-mock" />,
      }));
      ```
    - Add test: `'renders SavingsFlowChart'` — `expect(screen.getByTestId('savings-flow-chart-mock')).toBeInTheDocument()`
    - Final WealthPanel test suite: 4 tests total (was 3; add the new one)
  - [x] 6.3: Run `WealthPanel.test.tsx` — all 4 tests pass.

- [x] Task 7: Run full test suite and validate (AC: all)
  - [x] 7.1: Run `npm test` — all 7 new SavingsFlowChart tests pass; all 2 new useSavingsStore tests pass; WealthPanel tests pass (4 tests); full suite passes with no regressions.
  - [x] 7.2: Run `npm run lint` — no new lint errors.
  - [x] 7.3: Run `cargo test` in `src-tauri/` — all Rust tests pass including new savings_flow tests.
  - [x] 7.4: Confirm no Rust changes except in `commands/mod.rs` and `lib.rs`.

## Dev Notes

### What Already Exists — Do NOT Recreate

| What | Where | Status |
|------|-------|--------|
| `WealthPanel.tsx` with RunwayGauge + ReconciliationForm | `src/features/savings/WealthPanel.tsx` | EXISTS — update in Task 6 |
| `WealthPanel.test.tsx` with 3 tests | `src/features/savings/WealthPanel.test.tsx` | EXISTS — update in Task 6 |
| `RunwayGauge.tsx` | `src/features/savings/RunwayGauge.tsx` | EXISTS — do NOT touch |
| `ReconciliationForm.tsx` | `src/features/savings/ReconciliationForm.tsx` | EXISTS — do NOT touch |
| `useSavingsStore.ts` with reconciliations, savingsTransactions, runway, runwayDelta | `src/stores/useSavingsStore.ts` | EXISTS — extend in Task 3 |
| `useSavingsStore.test.ts` | `src/stores/useSavingsStore.test.ts` | EXISTS — add tests only in Task 5 |
| Design tokens: `--color-savings-positive`, `--color-savings-negative`, `--color-runway-healthy` | `src/styles.css` lines 22–24 | EXISTS — use as CSS vars; do NOT hardcode hex |
| Rust savings commands: `get_savings_reconciliations`, `record_reconciliation`, `get_savings_transactions_since`, `get_avg_monthly_essential_spend_cents` | `src-tauri/src/commands/mod.rs` lines 2600–2771 | EXISTS — add new command after, do NOT modify existing |
| Rust lib.rs savings registration (lines 134–137) | `src-tauri/src/lib.rs` | EXISTS — add one line |
| `SavingsReconciliation` type | `src/lib/types.ts` line 191 | EXISTS — add SavingsFlowMonth below it |

### Critical Architecture Note — Two Data Sources

The savings store uses TWO separate data sources (ADR-6):

1. **`reconciliations`** — for balance tracking and runway (current use in store)
2. **`savingsTransactions`** — transactions since last reconciliation (for current balance derivation)
3. **`monthlyFlow`** (NEW in 5-6) — pre-aggregated monthly data from the backend, going back 6 months regardless of reconciliation date

The bar chart MUST use `monthlyFlow` (not `savingsTransactions`) because `savingsTransactions` only loads since the last reconciliation date — if Tom reconciles every month, `savingsTransactions` would only contain the current month's transactions, making 6-month history impossible.

### SQL Date Filter — Exactly 6 Calendar Months

```sql
AND t.date >= date('now', 'start of month', '-5 months')
```

- `'start of month'` = first day of current month
- `'-5 months'` = go back 5 months from that
- Result: covers exactly 6 calendar months (5 prior + current)
- Example: if today is 2026-04-09 → filter is `>= 2025-11-01` → covers Nov, Dec, Jan, Feb, Mar, Apr

### Sign Convention for Bar Chart

The savings sign convention (defined in `src/lib/types.ts` line 187):
- `negative amountCents` = deposit to savings (outflow from checking)  
- `positive amountCents` = withdrawal from savings

For the bar chart, the SQL uses `SUM(-amount_cents)`:
- A deposit (`amount_cents = -500`) → `net_flow_cents = +500` → positive bar (lime-dim)
- A withdrawal (`amount_cents = +200`) → `net_flow_cents = -200` → negative bar (red)

Do NOT flip this sign again in the frontend — the Rust command returns it correctly flipped.

### Recharts BarChart — No Axes/Gridlines Pattern

```tsx
<BarChart data={data} barCategoryGap="20%">
  <XAxis
    dataKey="month"
    axisLine={false}      // removes the horizontal line under labels
    tickLine={false}      // removes tick marks
    tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
  />
  {/* No <YAxis /> — fully hidden */}
  {/* No <CartesianGrid /> — no gridlines */}
  <Bar dataKey="netFlowCents" ...>
    {data.map((entry, index) => (
      <Cell key={index} fill={getBarColor(...)} />
    ))}
  </Bar>
</BarChart>
```

### Bar Color Logic

```typescript
function getBarColor(month: string, netFlowCents: number): string {
  if (month === currentMonth) return 'var(--color-runway-healthy)';   // #C0F500 lime — current month always
  if (netFlowCents >= 0) return 'var(--color-savings-positive)';      // #90c820 lime-dim — deposit
  return 'var(--color-savings-negative)';                             // #ff5555 red — withdrawal
}
```

Current month is determined at module level:
```typescript
const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
```

### Recharts Mock Pattern for Tests

Recharts renders SVG which is not supported in jsdom. Always mock recharts at the module level:

```typescript
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: any) => (
    <div data-testid="bar-chart" data-items={JSON.stringify(data)}>{children}</div>
  ),
  Bar: ({ children }: any) => <div data-testid="bar">{children}</div>,
  XAxis: () => <div data-testid="x-axis" />,
  Cell: ({ fill }: any) => <div data-testid="cell" data-fill={fill} />,
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));
```

### Store Mock Pattern for SavingsFlowChart Tests

Only `monthlyFlow` is needed (SavingsFlowChart does NOT read other store fields):

```typescript
const savingsStore = {
  monthlyFlow: [] as SavingsFlowMonth[],
};

vi.mock('@/stores/useSavingsStore', () => ({
  useSavingsStore: vi.fn(() => savingsStore),
}));
```

### Recharts Version

Install `recharts@^2.15.0` — this is the confirmed React 19-compatible version. Do NOT install recharts 3.x (still in beta for production use). The package.json currently has no recharts dependency.

### WealthPanel Layout After This Story

After Task 6, WealthPanel renders:
```tsx
<div className="flex gap-4 p-3">
  <RunwayGauge />           ← 200px SVG arc
  <SavingsFlowChart />      ← NEW: flex-1, 80px tall bar chart
  <div className="flex-1">
    <ReconciliationForm />  ← existing
  </div>
</div>
```

Story 5-7 will redesign this into the persistent collapsible layout (~220px height, arc + chart side by side). Do NOT attempt the collapsible or sticky behavior in this story.

### Rust Command Pattern Reference

Copy the pattern from `get_avg_monthly_essential_spend_cents` (lines 2742–2771) — same structure:
- `_inner` function for testability
- Public `#[tauri::command]` wrapper that locks the mutex
- Tests in `mod savings_tests`

The `get_savings_flow_by_month_inner` tests need a savings envelope to attach transactions to. For Rust tests, insert directly via SQL rather than using command helpers:
```rust
conn.execute("INSERT INTO envelopes (name, type, priority, allocated_cents, is_savings) VALUES ('Savings', 'Rolling', 'Need', 0, 1)", []).unwrap();
let envelope_id: i64 = conn.query_row("SELECT last_insert_rowid()", [], |r| r.get(0)).unwrap();
conn.execute(
    "INSERT INTO transactions (payee, amount_cents, date, envelope_id, is_cleared) VALUES ('Deposit', -50000, date('now'), ?1, 0)",
    rusqlite::params![envelope_id],
).unwrap();
```

### Deferred (Not in Story 5-6 Scope)

- **Full WealthPanel persistent layout** (sticky, ~220px, collapsible) — story 5-7
- **Tooltip on bars** — not specified in story 5-6 ACs
- **Streak indicators / motivational copy** — architecture mentions this for the bar chart but it's not in the ACs; defer
- **Legend** — not in UX-DR5 spec for this chart

### Previous Story Learnings (5-5)

- **`window.matchMedia` guard in jsdom**: Use `typeof window.matchMedia === 'function'` guard for any browser API that jsdom doesn't implement. Not needed for this story (no matchMedia usage).
- **CSS var references in SVG attributes**: Use `'var(--token-name)'` directly as string values for SVG `stroke` and Recharts `fill` — confirmed pattern from RunwayGauge.
- **WealthPanel test mock pattern**: Mock child components with `data-testid="*-mock"` and add a test asserting the mock is rendered — confirmed working pattern from Task 2 of story 5-5.
- **No Tailwind classes on SVG/Recharts elements**: Use inline styles or SVG attributes for coloring — Tailwind utilities don't work on SVG `<text>` or Recharts `<Cell>`.

### References

- Story 5-6 ACs: `_bmad-output/planning-artifacts/epics.md` (Epic 5 → Story 5.6)
- UX-DR5 (bar chart anatomy): `_bmad-output/planning-artifacts/epics.md`
- FR24, FR25: `_bmad-output/planning-artifacts/epics.md`
- Architecture: SavingsFlowChart.tsx location: `_bmad-output/planning-artifacts/architecture.md` line 658
- Architecture: Recharts for bar chart: `_bmad-output/planning-artifacts/architecture.md` line 54
- Design tokens: `src/styles.css` lines 22–24 (`--color-savings-positive`, `--color-savings-negative`, `--color-runway-healthy`)
- ADR-6 (two savings metrics): `_bmad-output/planning-artifacts/architecture.md` lines 89–93
- Savings sign convention: `src/lib/types.ts` line 187
- SQL monthly grouping pattern reference: `src-tauri/src/commands/mod.rs` `get_avg_monthly_essential_spend_cents_inner` (~line 2742)
- Current WealthPanel: `src/features/savings/WealthPanel.tsx`
- Current WealthPanel tests: `src/features/savings/WealthPanel.test.tsx`
- useSavingsStore (to extend): `src/stores/useSavingsStore.ts`
- useSavingsStore tests: `src/stores/useSavingsStore.test.ts`
- Previous story file (5-5): `_bmad-output/implementation-artifacts/5-5-arc-gauge-runway-visualized.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- BorrowOverlay.test.tsx: 13 pre-existing failures unrelated to this story (useEnvelopeStore.setState mock issue). Confirmed pre-existing via git stash verification.
- Lint: 4 pre-existing lint errors (OFXImporter.tsx, useTransactionStore.ts, useUpdateStore.test.ts). No new errors introduced.

### Completion Notes List

- Task 1: Installed recharts@2.15.4 (^2.15.0) via npm. package.json and package-lock.json updated.
- Task 2: Added `SavingsFlowMonth` struct and `get_savings_flow_by_month` Tauri command in `commands/mod.rs`. 4 new Rust unit tests added to `savings_tests` module. Used SQLite `query_row` for current-month derivation (no chrono dependency). Registered in `lib.rs`. All 87 Rust tests pass.
- Task 3: Added `SavingsFlowMonth` interface to `types.ts`. Extended `useSavingsStore.ts` with `monthlyFlow` state, `loadMonthlyFlow` action, and calls to `loadMonthlyFlow` from both `loadReconciliations` and `recordReconciliation`.
- Task 4: Created `SavingsFlowChart.tsx` with Recharts BarChart (no YAxis, no gridlines, per UX-DR5). Color logic: current month → `--color-runway-healthy`, positive past → `--color-savings-positive`, negative past → `--color-savings-negative`. All 7 component tests pass (recharts mocked for jsdom).
- Task 5: Added 2 new tests to `useSavingsStore.test.ts` for `loadMonthlyFlow` success and failure. Updated `beforeEach` to reset `monthlyFlow: []`. All 26 store tests pass.
- Task 6: Added `SavingsFlowChart` between `RunwayGauge` and `ReconciliationForm` in `WealthPanel.tsx`. Added mock and test in `WealthPanel.test.tsx`. All 4 WealthPanel tests pass.
- Task 7: Full suite 360 passing (13 pre-existing BorrowOverlay failures excluded). No new lint errors. 87 Rust tests pass.

### File List

- package.json
- package-lock.json
- src-tauri/src/commands/mod.rs
- src-tauri/src/lib.rs
- src/lib/types.ts
- src/stores/useSavingsStore.ts
- src/stores/useSavingsStore.test.ts
- src/features/savings/SavingsFlowChart.tsx (new)
- src/features/savings/SavingsFlowChart.test.tsx (new)
- src/features/savings/WealthPanel.tsx
- src/features/savings/WealthPanel.test.tsx

### Review Findings

- [x] [Review][Patch] Missing `<YAxis hide />` — Recharts renders a default Y-axis, violating AC1/UX-DR5 "no axes" [src/features/savings/SavingsFlowChart.tsx:31-48]
- [x] [Review][Patch] `currentMonth` computed at module load — won't update if app runs past midnight; use local date computed inside component [src/features/savings/SavingsFlowChart.tsx:4]
- [x] [Review][Patch] `Cell key={index}` — unstable React key; use `entry.monthKey` (already in scope) [src/features/savings/SavingsFlowChart.tsx:41]
- [x] [Review][Patch] AC2 gap: `importOFX` never calls `loadMonthlyFlow` — imported savings transactions do not update the bar chart without a page reload [src/stores/useTransactionStore.ts:93]
- [x] [Review][Defer] `runwayDelta` uses `prev.enteredBalanceCents` without accounting for transactions between reconciliations — pre-existing story 5-4 design [src/stores/useSavingsStore.ts] — deferred, pre-existing
- [x] [Review][Defer] `SAVINGS_DEPOSIT_SIGN` exported but never applied in store or SQL — sign convention not enforced by the constant — pre-existing story 5-1 [src/lib/types.ts] — deferred, pre-existing
- [x] [Review][Defer] WealthPanel has no loading or error state — chart is invisible during data load — deferred to story 5-7 layout redesign [src/features/savings/WealthPanel.tsx] — deferred, pre-existing
- [x] [Review][Defer] `recordReconciliation` clears `savingsTransactions: []` before reload — brief window where `currentTrackedBalance` is understated — pre-existing story 5-3 design [src/stores/useSavingsStore.ts] — deferred, pre-existing
- [x] [Review][Defer] DB mutex held across full query with no index on `transactions(envelope_id, date)` — pre-existing concern across all savings commands [src-tauri/src/commands/mod.rs] — deferred, pre-existing
- [x] [Review][Defer] UTC vs local timezone: `currentMonth` and SQL `date('now')` both use UTC, but stored transaction dates may be local — off-by-one-day at month boundary in negative-offset timezones [src/features/savings/SavingsFlowChart.tsx:4] — deferred, pre-existing

## Change Log

- 2026-04-09: Story created by create-story workflow
- 2026-04-09: Implemented by claude-sonnet-4-6 — added recharts bar chart showing 6-month savings flow; Rust command + 4 tests; SavingsFlowChart component + 7 tests; 2 new store tests; WealthPanel updated with chart alongside RunwayGauge
- 2026-04-09: Code review — 4 patch, 6 deferred, 6 dismissed
