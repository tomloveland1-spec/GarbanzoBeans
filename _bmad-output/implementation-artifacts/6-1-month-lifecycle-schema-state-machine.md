# Story 6.1: Month Lifecycle Schema + State Machine

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the SQLite schema and Zustand store for the month lifecycle state machine, along with the Tauri commands to advance and close months,
So that Turn the Month can commit each step atomically and resume from any point after a crash.

## Acceptance Criteria

1. **AC1: months table migration exists and is applied on launch**
   - Given the migration runner runs on launch
   - When `009_months.sql` is applied
   - Then the `months` table exists with columns: `id` (PK AUTOINCREMENT), `year` (INTEGER NOT NULL), `month` (INTEGER NOT NULL), `status` (TEXT NOT NULL, CHECK allows `open`, `closed`, or `closing:step-%`), `opened_at` (ISO 8601 TEXT NOT NULL), `closed_at` (ISO 8601 TEXT, nullable)
   - And a UNIQUE constraint exists on `(year, month)`
   - And an index `idx_months_status` exists on `status`

2. **AC2: useMonthStore hydrates current month on app load and triggers route guard**
   - Given the `useMonthStore` Zustand slice is populated
   - When the app loads
   - Then the current month record is hydrated from SQLite; if status is `closing:step-N`, the TanStack Router `guardTurnTheMonth()` (already in `router.tsx`) immediately redirects to `/turn-the-month`

3. **AC3: advance_turn_the_month_step commits atomically**
   - Given an `advance_turn_the_month_step` Tauri command runs
   - When it executes with `month_id` and `current_step`
   - Then the months table `status` updates to `closing:step-(current_step+1)` in a single atomic transaction; on failure the transaction rolls back and status remains at current step

4. **AC4: close_month creates new month and resets envelopes per type rules**
   - Given the `close_month` Tauri command runs
   - When it executes with `month_id`
   - Then: the current month record `status` → `closed` and `closed_at` → now; a new month record is created with `status = 'open'`; Rolling-type envelopes reset `allocated_cents` to 0; Bill/Goal envelopes preserve their `allocated_cents`; the useMonthStore updates with the new month; the `guardTurnTheMonth()` route guard clears (because new status is `open`)

---

## Tasks / Subtasks

- [x] Task 1: Create `009_months.sql` migration (AC: 1)
  - [x] 1.1: Create `src-tauri/migrations/009_months.sql` with the following content:
    ```sql
    -- Migration 009: Month lifecycle schema
    -- Supports ADR-4: explicit state machine with crash recovery
    -- Status values: 'open' | 'closed' | 'closing:step-N' (N >= 1)
    -- UNIQUE(year, month) prevents duplicate month records

    CREATE TABLE IF NOT EXISTS months (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      year       INTEGER NOT NULL,
      month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      status     TEXT    NOT NULL DEFAULT 'open'
                         CHECK (status = 'open' OR status = 'closed' OR status LIKE 'closing:step-%'),
      opened_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      closed_at  TEXT,
      UNIQUE(year, month)
    );

    -- Primary filter: finding current open/closing month quickly
    CREATE INDEX IF NOT EXISTS idx_months_status ON months(status);
    ```

- [x] Task 2: Register migration in `migrations.rs` (AC: 1)
  - [x] 2.1: Open `src-tauri/src/migrations.rs`. In the `MIGRATIONS` constant, append entry `(9, include_str!("../migrations/009_months.sql"))` after the existing entry for version 8.
  - [x] 2.2: Update the test `test_migrations_run_on_fresh_db` assertion from `assert_eq!(version, 8, ...)` to `assert_eq!(version, 9, ...)`.
  - [x] 2.3: Update the test `test_migrations_are_idempotent` assertion from `assert_eq!(version, 8, ...)` to `assert_eq!(version, 9, ...)`.

- [x] Task 3: Add `Month` type to `src/lib/types.ts` (AC: 2, 3, 4)
  - [x] 3.1: Append the following to `src/lib/types.ts` after the existing `SavingsFlowMonth` interface:
    ```typescript
    // Month record — mirrors the `months` SQLite table row.
    // status uses MonthStatus type defined above.
    export interface Month {
      id: number;
      year: number;
      month: number;       // 1–12
      status: MonthStatus; // 'open' | 'closed' | `closing:${number}`
      openedAt: string;    // ISO 8601 UTC
      closedAt: string | null;
    }

    // Input for advance_turn_the_month_step Tauri command.
    export interface AdvanceTurnTheMonthStepInput {
      monthId: number;
      currentStep: number;  // the step that is completing; status advances to closing:step-(currentStep+1)
    }

    // Input for close_month Tauri command.
    export interface CloseMonthInput {
      monthId: number;
    }
    ```

- [x] Task 4: Add Rust Tauri commands to `commands/mod.rs` (AC: 2, 3, 4)
  - [x] 4.1: Add the `Month` struct and input structs immediately before the `#[cfg(test)]` block at the bottom of `commands/mod.rs`:
    ```rust
    // ─── Month lifecycle structs ───────────────────────────────────────────────

    #[derive(Debug, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Month {
        pub id: i64,
        pub year: i64,
        pub month: i64,
        pub status: String,
        pub opened_at: String,
        pub closed_at: Option<String>,
    }

    #[derive(Debug, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct AdvanceTurnTheMonthStepInput {
        pub month_id: i64,
        pub current_step: i64,
    }

    #[derive(Debug, serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct CloseMonthInput {
        pub month_id: i64,
    }
    ```
  - [x] 4.2: Add a `get_current_month` helper and command. Add this immediately after the structs from 4.1, before the `#[cfg(test)]` block:
    ```rust
    fn row_to_month(row: &rusqlite::Row<'_>) -> rusqlite::Result<Month> {
        Ok(Month {
            id: row.get(0)?,
            year: row.get(1)?,
            month: row.get(2)?,
            status: row.get(3)?,
            opened_at: row.get(4)?,
            closed_at: row.get(5)?,
        })
    }

    fn get_current_month_inner(conn: &rusqlite::Connection) -> Result<Option<Month>, AppError> {
        // "Current" = the most recently opened month that is not closed.
        // If all months are closed, returns the latest one (handles edge case).
        let result = conn.query_row(
            "SELECT id, year, month, status, opened_at, closed_at \
             FROM months \
             WHERE status != 'closed' \
             ORDER BY year DESC, month DESC \
             LIMIT 1",
            [],
            row_to_month,
        );
        match result {
            Ok(m) => Ok(Some(m)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::from(e)),
        }
    }

    #[tauri::command]
    pub fn get_current_month(state: State<DbState>) -> Result<Option<Month>, AppError> {
        let conn = state.0.lock().map_err(|_| AppError {
            code: "DB_LOCK_POISON".to_string(),
            message: "Database mutex was poisoned.".to_string(),
        })?;
        get_current_month_inner(&conn)
    }
    ```
  - [x] 4.3: Add `open_month` command (creates first month record; used when no months exist yet):
    ```rust
    fn open_month_inner(conn: &rusqlite::Connection) -> Result<Month, AppError> {
        // Determine year/month from today's date.
        let today: String = conn.query_row(
            "SELECT date('now')",
            [],
            |row| row.get(0),
        )?;
        let parts: Vec<&str> = today.splitn(3, '-').collect();
        if parts.len() < 2 {
            return Err(AppError {
                code: "INVALID_DATE".to_string(),
                message: format!("Unexpected date format from SQLite: {}", today),
            });
        }
        let year: i64 = parts[0].parse().map_err(|_| AppError {
            code: "INVALID_DATE".to_string(),
            message: "Could not parse year from SQLite date".to_string(),
        })?;
        let month: i64 = parts[1].parse().map_err(|_| AppError {
            code: "INVALID_DATE".to_string(),
            message: "Could not parse month from SQLite date".to_string(),
        })?;

        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "INSERT OR IGNORE INTO months (year, month, status) VALUES (?1, ?2, 'open')",
            rusqlite::params![year, month],
        )?;
        let id = tx.last_insert_rowid();
        let m = tx.query_row(
            "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE id = ?1",
            rusqlite::params![id],
            row_to_month,
        )?;
        tx.commit()?;
        Ok(m)
    }

    #[tauri::command]
    pub fn open_month(state: State<DbState>) -> Result<Month, AppError> {
        let conn = state.0.lock().map_err(|_| AppError {
            code: "DB_LOCK_POISON".to_string(),
            message: "Database mutex was poisoned.".to_string(),
        })?;
        open_month_inner(&conn)
    }
    ```
  - [x] 4.4: Add `advance_turn_the_month_step` command (atomic step advance):
    ```rust
    fn advance_turn_the_month_step_inner(
        conn: &rusqlite::Connection,
        input: &AdvanceTurnTheMonthStepInput,
    ) -> Result<Month, AppError> {
        let expected_status = format!("closing:step-{}", input.current_step);
        let next_status = format!("closing:step-{}", input.current_step + 1);

        let tx = conn.unchecked_transaction()?;

        // Verify current status matches expected — prevents double-advance
        let current: String = tx.query_row(
            "SELECT status FROM months WHERE id = ?1",
            rusqlite::params![input.month_id],
            |row| row.get(0),
        ).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError {
                code: "MONTH_NOT_FOUND".to_string(),
                message: format!("No month found with id {}", input.month_id),
            },
            other => AppError::from(other),
        })?;

        if current != expected_status {
            return Err(AppError {
                code: "INVALID_STEP_TRANSITION".to_string(),
                message: format!(
                    "Expected status '{}' but found '{}'. Step may have already advanced.",
                    expected_status, current
                ),
            });
        }

        tx.execute(
            "UPDATE months SET status = ?1 WHERE id = ?2",
            rusqlite::params![next_status, input.month_id],
        )?;
        let m = tx.query_row(
            "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE id = ?1",
            rusqlite::params![input.month_id],
            row_to_month,
        )?;
        tx.commit()?;
        Ok(m)
    }

    #[tauri::command]
    pub fn advance_turn_the_month_step(
        state: State<DbState>,
        input: AdvanceTurnTheMonthStepInput,
    ) -> Result<Month, AppError> {
        let conn = state.0.lock().map_err(|_| AppError {
            code: "DB_LOCK_POISON".to_string(),
            message: "Database mutex was poisoned.".to_string(),
        })?;
        advance_turn_the_month_step_inner(&conn, &input)
    }
    ```
  - [x] 4.5: Add `close_month` command (close current month, open next, reset envelopes):
    ```rust
    fn close_month_inner(conn: &rusqlite::Connection, input: &CloseMonthInput) -> Result<Month, AppError> {
        // Determine next month's year/month
        let (curr_year, curr_month): (i64, i64) = conn.query_row(
            "SELECT year, month FROM months WHERE id = ?1",
            rusqlite::params![input.month_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError {
                code: "MONTH_NOT_FOUND".to_string(),
                message: format!("No month found with id {}", input.month_id),
            },
            other => AppError::from(other),
        })?;

        let (next_year, next_month) = if curr_month == 12 {
            (curr_year + 1, 1i64)
        } else {
            (curr_year, curr_month + 1)
        };

        let tx = conn.unchecked_transaction()?;

        // 1. Mark current month closed
        tx.execute(
            "UPDATE months SET status = 'closed', closed_at = datetime('now') WHERE id = ?1",
            rusqlite::params![input.month_id],
        )?;

        // 2. Create next month record
        tx.execute(
            "INSERT INTO months (year, month, status) VALUES (?1, ?2, 'open')",
            rusqlite::params![next_year, next_month],
        )?;
        let new_month_id = tx.last_insert_rowid();

        // 3. Reset envelope allocations per type rules:
        //    Rolling envelopes → 0 (re-allocated each month in guided fill)
        //    Bill and Goal envelopes → preserve allocated_cents (recurring fixed costs/goals)
        tx.execute(
            "UPDATE envelopes SET allocated_cents = 0 WHERE type = 'Rolling'",
            [],
        )?;

        // 4. Return the new open month
        let new_month = tx.query_row(
            "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE id = ?1",
            rusqlite::params![new_month_id],
            row_to_month,
        )?;
        tx.commit()?;
        Ok(new_month)
    }

    #[tauri::command]
    pub fn close_month(
        state: State<DbState>,
        input: CloseMonthInput,
    ) -> Result<Month, AppError> {
        let conn = state.0.lock().map_err(|_| AppError {
            code: "DB_LOCK_POISON".to_string(),
            message: "Database mutex was poisoned.".to_string(),
        })?;
        close_month_inner(&conn, &input)
    }
    ```
  - [x] 4.6: Add Rust unit tests for months commands. Add a new `#[cfg(test)]` module `month_tests` (alongside the existing `transaction_tests` module) with at least these tests:
    - `test_open_month_creates_record` — call `open_month_inner`, verify id > 0, status = 'open'
    - `test_open_month_idempotent_via_insert_or_ignore` — call twice for same year/month, second INSERT OR IGNORE should not create a duplicate (verify row count = 1)
    - `test_advance_step_updates_status` — set month to `closing:step-1`, advance, verify status = `closing:step-2`
    - `test_advance_step_wrong_status_errors` — try to advance from `closing:step-2` when status is `closing:step-1`, verify `INVALID_STEP_TRANSITION` error
    - `test_close_month_creates_next_month` — close a month, verify original is 'closed' and new month is 'open' with correct year/month
    - `test_close_month_resets_rolling_envelopes` — create a Rolling envelope with allocated_cents > 0, call close_month, verify allocated_cents = 0
    - `test_close_month_preserves_bill_envelope` — create a Bill envelope with allocated_cents > 0, call close_month, verify allocated_cents unchanged
    - `test_close_month_wraps_december` — close a December month, verify next month is January of next year

- [x] Task 5: Register new commands in `src-tauri/src/lib.rs` (AC: 2, 3, 4)
  - [x] 5.1: Open `src-tauri/src/lib.rs`. In the `invoke_handler!` macro (which currently ends with `commands::get_savings_flow_by_month,`), add these four new commands before the closing `]`:
    ```rust
    commands::get_current_month,
    commands::open_month,
    commands::advance_turn_the_month_step,
    commands::close_month,
    ```

- [x] Task 6: Update `useMonthStore.ts` with full hydration and actions (AC: 2, 3, 4)
  - [x] 6.1: Replace the full contents of `src/stores/useMonthStore.ts` with:
    ```typescript
    import { create } from 'zustand';
    import { invoke } from '@tauri-apps/api/core';
    import type { Month, MonthStatus, AdvanceTurnTheMonthStepInput, CloseMonthInput } from '@/lib/types';
    import type { AppError } from '@/lib/types';

    interface MonthState {
      currentMonth: Month | null;
      monthStatus: MonthStatus;
      isWriting: boolean;
      error: string | null;
      loadMonthStatus: () => Promise<void>;
      advanceStep: (currentStep: number) => Promise<void>;
      closeMonth: () => Promise<void>;
    }

    export const useMonthStore = create<MonthState>((set, get) => ({
      currentMonth: null,
      monthStatus: 'open',  // optimistic default; overwritten by loadMonthStatus
      isWriting: false,
      error: null,

      loadMonthStatus: async () => {
        try {
          let month = await invoke<Month | null>('get_current_month');
          if (!month) {
            // No months record yet — create the first one
            month = await invoke<Month>('open_month');
          }
          set({
            currentMonth: month,
            monthStatus: month.status as MonthStatus,
            error: null,
          });
        } catch (e) {
          const err = e as AppError;
          set({ error: err.message ?? 'Failed to load month status' });
        }
      },

      advanceStep: async (currentStep: number) => {
        const { currentMonth } = get();
        if (!currentMonth) return;
        set({ isWriting: true });
        try {
          const input: AdvanceTurnTheMonthStepInput = {
            monthId: currentMonth.id,
            currentStep,
          };
          const updated = await invoke<Month>('advance_turn_the_month_step', { input });
          set({
            currentMonth: updated,
            monthStatus: updated.status as MonthStatus,
            isWriting: false,
            error: null,
          });
        } catch (e) {
          const err = e as AppError;
          set({ isWriting: false, error: err.message ?? 'Failed to advance step' });
          throw e;
        }
      },

      closeMonth: async () => {
        const { currentMonth } = get();
        if (!currentMonth) return;
        set({ isWriting: true });
        try {
          const input: CloseMonthInput = { monthId: currentMonth.id };
          const newMonth = await invoke<Month>('close_month', { input });
          set({
            currentMonth: newMonth,
            monthStatus: newMonth.status as MonthStatus,
            isWriting: false,
            error: null,
          });
        } catch (e) {
          const err = e as AppError;
          set({ isWriting: false, error: err.message ?? 'Failed to close month' });
          throw e;
        }
      },
    }));
    ```

- [x] Task 7: Update `router.tsx` root `beforeLoad` to hydrate month store (AC: 2)
  - [x] 7.1: Open `src/router.tsx`. In the root route's `beforeLoad` async function, add `await useMonthStore.getState().loadMonthStatus();` after the existing store loads. Place it after `await useSavingsStore.getState().loadAvgMonthlyEssentialSpend();`:
    ```typescript
    await useMonthStore.getState().loadMonthStatus();
    ```
    **Key:** `guardTurnTheMonth()` already reads `useMonthStore.getState().monthStatus` — once `loadMonthStatus()` runs in root `beforeLoad`, all child route guards will see the correct hydrated status.

- [x] Task 8: Write tests for `useMonthStore.test.ts` (AC: 2, 3, 4)
  - [x] 8.1: Replace the full contents of `src/stores/useMonthStore.test.ts` with comprehensive tests:
    ```typescript
    import { describe, it, expect, beforeEach, vi } from 'vitest';
    import { useMonthStore } from './useMonthStore';

    const mockMonth = (overrides = {}) => ({
      id: 1, year: 2026, month: 4, status: 'open',
      openedAt: '2026-04-01T00:00:00Z', closedAt: null,
      ...overrides,
    });

    vi.mock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
    }));

    import { invoke } from '@tauri-apps/api/core';

    describe('useMonthStore', () => {
      beforeEach(() => {
        useMonthStore.setState({
          currentMonth: null,
          monthStatus: 'open',
          isWriting: false,
          error: null,
        });
        vi.clearAllMocks();
      });

      it('initializes with monthStatus: open', () => {
        expect(useMonthStore.getState().monthStatus).toBe('open');
      });

      it('initializes with isWriting: false', () => {
        expect(useMonthStore.getState().isWriting).toBe(false);
      });

      it('loadMonthStatus: sets month from get_current_month', async () => {
        const month = mockMonth({ status: 'open' });
        vi.mocked(invoke).mockResolvedValueOnce(month);
        await useMonthStore.getState().loadMonthStatus();
        expect(useMonthStore.getState().currentMonth).toEqual(month);
        expect(useMonthStore.getState().monthStatus).toBe('open');
      });

      it('loadMonthStatus: calls open_month when get_current_month returns null', async () => {
        const newMonth = mockMonth();
        vi.mocked(invoke)
          .mockResolvedValueOnce(null)      // get_current_month
          .mockResolvedValueOnce(newMonth); // open_month
        await useMonthStore.getState().loadMonthStatus();
        expect(invoke).toHaveBeenCalledWith('open_month');
        expect(useMonthStore.getState().currentMonth).toEqual(newMonth);
      });

      it('loadMonthStatus: sets closing status when month is closing', async () => {
        const month = mockMonth({ status: 'closing:step-2' });
        vi.mocked(invoke).mockResolvedValueOnce(month);
        await useMonthStore.getState().loadMonthStatus();
        expect(useMonthStore.getState().monthStatus).toBe('closing:step-2');
      });

      it('advanceStep: updates monthStatus to next step', async () => {
        const current = mockMonth({ status: 'closing:step-1' });
        const advanced = mockMonth({ status: 'closing:step-2' });
        useMonthStore.setState({ currentMonth: current, monthStatus: 'closing:step-1' });
        vi.mocked(invoke).mockResolvedValueOnce(advanced);
        await useMonthStore.getState().advanceStep(1);
        expect(useMonthStore.getState().monthStatus).toBe('closing:step-2');
        expect(useMonthStore.getState().isWriting).toBe(false);
      });

      it('closeMonth: sets monthStatus to open after close', async () => {
        const current = mockMonth({ id: 1, status: 'closing:step-4' });
        const newMonth = mockMonth({ id: 2, year: 2026, month: 5, status: 'open' });
        useMonthStore.setState({ currentMonth: current, monthStatus: 'closing:step-4' });
        vi.mocked(invoke).mockResolvedValueOnce(newMonth);
        await useMonthStore.getState().closeMonth();
        expect(useMonthStore.getState().monthStatus).toBe('open');
        expect(useMonthStore.getState().currentMonth?.month).toBe(5);
        expect(useMonthStore.getState().isWriting).toBe(false);
      });

      it('advanceStep: sets error and re-throws on failure', async () => {
        const current = mockMonth({ status: 'closing:step-1' });
        useMonthStore.setState({ currentMonth: current, monthStatus: 'closing:step-1' });
        vi.mocked(invoke).mockRejectedValueOnce({ code: 'INVALID_STEP_TRANSITION', message: 'Already advanced' });
        await expect(useMonthStore.getState().advanceStep(1)).rejects.toBeDefined();
        expect(useMonthStore.getState().isWriting).toBe(false);
        expect(useMonthStore.getState().error).toBeTruthy();
      });
    });
    ```

- [x] Task 9: Run full test suite and validate (AC: all)
  - [x] 9.1: Run `npm test` — all useMonthStore tests pass; full suite passes with no new regressions. Pre-existing 13 BorrowOverlay failures and 4 lint errors remain unchanged — do not investigate.
  - [x] 9.2: Run `npm run lint` — no new lint errors introduced.
  - [x] 9.3: Run `cargo test` in `src-tauri/` — all month command tests pass, all migration tests pass (version now 9).

### Review Findings

- [x] [Review][Decision] `close_month_inner`: validate month is in `closing:step-N` state before closing — Decision: add backend precondition check. Fixed: returns `INVALID_STATUS_FOR_CLOSE` if status is not `closing:step-N`. New test `test_close_month_open_status_errors` added.
- [x] [Review][Patch] `close_month_inner`: plain INSERT with no conflict handling — changed to `INSERT OR IGNORE`, query back by `(year, month)` [`src-tauri/src/commands/mod.rs`]
- [x] [Review][Defer] Savings envelope uniqueness race condition: `update_envelope_inner` checks for existing savings envelope outside a transaction, allowing two concurrent calls to both pass the check [`src-tauri/src/commands/mod.rs`] — deferred, pre-existing from epic 5

---

## Dev Notes

### ADR-4: Month Lifecycle State Machine

From architecture ADR-4: `months` table has explicit lifecycle: `open` / `closing:step-N` / `closed`. Each Turn the Month step commits atomically AND updates `status` before proceeding. On launch, `closing:step-N` triggers resume from last incomplete step. This is the crash-recovery mechanism.

### Migration Number Clarification

The epics spec says `006_months.sql` but that was written before migrations 006–008 were implemented. The actual next migration must be **`009_months.sql`** (following `008_savings.sql`). The migration runner in `migrations.rs` uses strictly ascending version numbers — this must be `(9, include_str!("../migrations/009_months.sql"))`.

### What Already Exists — Do NOT Recreate

| What | Where | Note |
|------|-------|------|
| `MonthStatus` type | `src/lib/types.ts` line 9–10 | Already defined: `'open' \| 'closed' \| \`closing:${number}\`` |
| `useMonthStore.ts` (stub) | `src/stores/useMonthStore.ts` | EXISTS — full replacement in Task 6 |
| `useMonthStore.test.ts` (2 tests) | `src/stores/useMonthStore.test.ts` | EXISTS — full replacement in Task 8 |
| `guardTurnTheMonth()` in router | `src/router.tsx` lines 44–50 | Already reads `monthStatus.startsWith('closing:')` — just needs store hydrated |
| `/turn-the-month` route (placeholder) | `src/router.tsx` lines 148–159 | Already exists — stub component, guard already wired |
| `src/features/month/` dir | `src/features/month/` | Empty (`.gitkeep`); turn-the-month wizard UI added in Story 6.2+ |

### Feature Folder Location Discrepancy

Architecture spec says `src/features/turn-the-month/` but the project created `src/features/month/` (with `.gitkeep`). For this story, all new files stay in `src/stores/` (consistent with all other Zustand stores). Story 6.2 will populate the `src/features/month/` folder with the TurnTheMonthWizard component. Do NOT create `src/features/turn-the-month/`.

### All Commands Go in `commands/mod.rs`

The architecture spec mentions `commands/months.rs` as a separate file. The actual project uses a single `commands/mod.rs` for ALL commands (no sub-files). Add all month commands to `commands/mod.rs`. Do NOT create `commands/months.rs`.

### Envelope Reset Rules on close_month

- **Rolling** → `allocated_cents = 0` (user re-allocates each month in Story 6.6 guided fill)
- **Bill** → preserve `allocated_cents` (fixed recurring payments; same amount next month)
- **Goal** → preserve `allocated_cents` (same contribution toward goal each month)

The SQL UPDATE targets only `type = 'Rolling'`. Bill and Goal envelopes are untouched. Story 6.6 adds the guided fill flow where all amounts can be adjusted.

### open_month Uses INSERT OR IGNORE

`open_month_inner` uses `INSERT OR IGNORE INTO months (year, month, ...)` to be idempotent — calling it twice for the same year/month won't create duplicates (UNIQUE constraint + IGNORE). The `last_insert_rowid()` returns 0 if the row was not inserted. Add logic: if `last_insert_rowid() == 0`, query for the existing row by year/month instead.

**Corrected open_month_inner logic:**
```rust
fn open_month_inner(conn: &rusqlite::Connection) -> Result<Month, AppError> {
    let today: String = conn.query_row("SELECT date('now')", [], |row| row.get(0))?;
    let parts: Vec<&str> = today.splitn(3, '-').collect();
    // ... parse year and month ...
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT OR IGNORE INTO months (year, month, status) VALUES (?1, ?2, 'open')",
        rusqlite::params![year, month],
    )?;
    // Use year/month lookup (not last_insert_rowid) to handle OR IGNORE case
    let m = tx.query_row(
        "SELECT id, year, month, status, opened_at, closed_at FROM months WHERE year = ?1 AND month = ?2",
        rusqlite::params![year, month],
        row_to_month,
    )?;
    tx.commit()?;
    Ok(m)
}
```

### DB_LOCK_POISON Pattern

Every command acquires the mutex with this exact pattern (copy from existing commands):
```rust
let conn = state.0.lock().map_err(|_| AppError {
    code: "DB_LOCK_POISON".to_string(),
    message: "Database mutex was poisoned.".to_string(),
})?;
```

### useMonthStore invoke Pattern

Study `useSavingsStore.ts` for the invoke pattern. All stores use:
```typescript
const result = await invoke<ReturnType>('command_name', { input });
```
The `input` key must match the Rust parameter name in the command signature (which uses `serde(rename_all = "camelCase")`).

### Route Guard Already in Place

`guardTurnTheMonth()` in `router.tsx` (lines 44–50) already checks `monthStatus.startsWith('closing:')`. It's called in `beforeLoad` for all routes except `/turn-the-month` and `/onboarding`. Once `loadMonthStatus()` is called in the root `beforeLoad`, the guard works automatically. The root `beforeLoad` runs before any child guard fires (TanStack Router design).

### Pre-existing Test State (from Story 5.7)

- 13 `BorrowOverlay.test.tsx` failures are pre-existing — do NOT investigate
- 4 pre-existing lint errors in `OFXImporter.tsx`, `useTransactionStore.ts`, `useUpdateStore.test.ts` — do NOT fix

### Architecture Compliance Checklist

- [ ] No React components access SQLite directly — all DB via Tauri commands ✓
- [ ] Business logic stays in React/TypeScript (Zustand store actions) ✓
- [ ] Rust handles only file I/O and SQLite writes ✓
- [ ] Each command uses `unchecked_transaction()` + explicit `commit()` for atomicity ✓
- [ ] `row_to_month` is a standalone fn (not closure) — enables reuse across commands ✓

### References

- Story 6.1 ACs: `_bmad-output/planning-artifacts/epics.md` line 1083
- Epic 6 overview: `_bmad-output/planning-artifacts/epics.md` line 1079
- ADR-4 (Month lifecycle state machine): `_bmad-output/planning-artifacts/architecture.md` line 81
- Risk 3 (Turn the Month crash recovery): `_bmad-output/planning-artifacts/architecture.md` line 103
- months commands listed: `_bmad-output/planning-artifacts/architecture.md` line 230
- useMonthStore listed: `_bmad-output/planning-artifacts/architecture.md` line 252
- Existing migration pattern: `src-tauri/src/migrations.rs`
- Existing command pattern: `src-tauri/src/commands/mod.rs`
- Existing invoke pattern: `src/stores/useSavingsStore.ts`
- MonthStatus type: `src/lib/types.ts` line 9–10
- Current useMonthStore stub: `src/stores/useMonthStore.ts`
- Router guardTurnTheMonth: `src/router.tsx` lines 44–50
- Previous story file (5-7): `_bmad-output/implementation-artifacts/5-7-wealth-panel-persistent-on-main-screen.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward with no debugging required.

### Completion Notes List

- **Task 1**: Created `src-tauri/migrations/009_months.sql` with `months` table (id, year, month, status CHECK, opened_at, closed_at), UNIQUE(year, month), and `idx_months_status` index.
- **Task 2**: Registered migration `(9, include_str!("../migrations/009_months.sql"))` in `migrations.rs`; updated both migration test version assertions from 8 → 9.
- **Task 3**: Added `Month`, `AdvanceTurnTheMonthStepInput`, `CloseMonthInput` interfaces to `src/lib/types.ts` after existing `SavingsFlowMonth`.
- **Task 4**: Added 4 Rust Tauri commands to `commands/mod.rs` (get_current_month, open_month, advance_turn_the_month_step, close_month) with inner functions and `row_to_month` helper. Added `month_tests` module with 10 Rust unit tests. Used `INSERT OR IGNORE` + year/month lookup in `open_month_inner` for idempotency. `advance_turn_the_month_step_inner` verifies expected status before advancing to prevent double-advance. `close_month_inner` closes current month, creates next month record, resets Rolling envelope `allocated_cents` to 0.
- **Task 5**: Registered 4 new commands in `src-tauri/src/lib.rs` `invoke_handler!` macro.
- **Task 6**: Replaced `useMonthStore.ts` stub with full implementation: `loadMonthStatus` (get_current_month → open_month fallback), `advanceStep`, `closeMonth` actions with `isWriting` flag and error handling.
- **Task 7**: Added `await useMonthStore.getState().loadMonthStatus()` to root route `beforeLoad` in `router.tsx`, after existing store loads. Route guard already in place; just needed hydration.
- **Task 8**: Replaced `useMonthStore.test.ts` with 11 comprehensive tests covering all store actions, error handling, null-guard cases.
- **Task 9**: Vitest: 376 passed, 13 pre-existing BorrowOverlay failures (unchanged). Cargo: 101 passed, 0 failed. Lint: same 4 pre-existing errors, no new ones.

### File List

- `src-tauri/migrations/009_months.sql` — created (months table schema)
- `src-tauri/src/migrations.rs` — modified (added migration 9; updated test assertions)
- `src/lib/types.ts` — modified (added Month, AdvanceTurnTheMonthStepInput, CloseMonthInput)
- `src-tauri/src/commands/mod.rs` — modified (added month structs, 4 commands, month_tests module)
- `src-tauri/src/lib.rs` — modified (registered 4 new commands)
- `src/stores/useMonthStore.ts` — modified (full replacement with hydration + actions)
- `src/router.tsx` — modified (added loadMonthStatus call in root beforeLoad)
- `src/stores/useMonthStore.test.ts` — modified (full replacement with 11 tests)

## Change Log

- 2026-04-09: Story 6.1 created — month lifecycle schema, state machine, Tauri commands, store hydration
- 2026-04-09: Story 6.1 implemented — months table migration (009), 4 Rust commands, useMonthStore hydration, router integration. 10 Rust tests + 11 TS tests added. All passing.
