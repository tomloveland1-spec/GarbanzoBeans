# Story 1.5: Onboarding — First Launch Setup

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Tom,
I want a fast, friction-free first-launch setup that asks me only what's necessary (data folder, pay frequency, savings target),
so that I'm ready to use the app within minutes without sitting through a methodology lecture.

## Acceptance Criteria

1. **Given** the app is launched for the first time (no settings row in DB OR `onboardingComplete === false`), **when** the app opens, **then** it displays the onboarding welcome screen with a single-sentence description; no feature tour or methodology explanation is shown

2. **Given** the onboarding welcome screen is shown, **when** the user proceeds through the flow, **then** the steps are presented in order: (1) name your budget + set start month, (2) select data folder location, (3) configure pay frequency and pay dates, (4) set savings target; a step counter ("Step N of 4") is visible throughout

3. **Given** the user is on the data folder selection step, **when** they click to browse for a folder, **then** a native OS folder picker dialog opens via Tauri; the selected path is displayed before the user confirms; the sentinel lock file is written to that folder on confirmation (FR32)

4. **Given** the user sets pay frequency (weekly / bi-weekly / twice-monthly / monthly) and pay dates, **when** they confirm the setting, **then** the configuration is stored in the `settings` table in SQLite (FR33)

5. **Given** the user sets a savings target, **when** they enter a value or leave the default, **then** 10% is pre-populated in the input field; the entered value is stored in the `settings` table (FR34)

6. **Given** the user completes all onboarding steps, **when** they confirm the final step, **then** they land on the main Budget screen (`/`); onboarding is not shown again on subsequent launches

## Tasks / Subtasks

- [x] Task 1: Add migration 002 (AC: #2, #4, #5, #6)
  - [x] Create `src-tauri/migrations/002_add_budget_name_start_month.sql` — ALTER TABLE to add `budget_name` and `start_month` columns; add `settings_updated_at` trigger
  - [x] Register migration 002 in `src-tauri/src/migrations.rs` MIGRATIONS array
  - [x] Update Cargo test `test_migrations_run_on_fresh_db` expected version from 1 to 2

- [x] Task 2: Update Settings type definitions (AC: #2, #6)
  - [x] Add `budgetName: string | null` and `startMonth: string | null` to `Settings` interface in `src/lib/types.ts`
  - [x] Add `budget_name: Option<String>` and `start_month: Option<String>` to Rust `Settings` struct in `src-tauri/src/commands/mod.rs`
  - [x] Update the `get_settings` SQL query to include both new columns in SELECT

- [x] Task 3: Add tauri-plugin-dialog (AC: #3)
  - [x] Add `tauri-plugin-dialog = "2"` to `src-tauri/Cargo.toml` under `[dependencies]`
  - [x] Add `.plugin(tauri_plugin_dialog::init())` in `src-tauri/src/lib.rs` before `.invoke_handler()`
  - [x] Add `"dialog:default"` capability to `src-tauri/capabilities/default.json` (or equivalent capabilties file)
  - [x] Add `npm install @tauri-apps/plugin-dialog` (JS side)

- [x] Task 4: Implement `upsert_settings` Tauri command (AC: #2, #4, #5, #6)
  - [x] Add `UpsertSettingsInput` serde struct to `src-tauri/src/commands/mod.rs`
  - [x] Implement `upsert_settings` command with SQLite upsert (INSERT ... ON CONFLICT DO UPDATE)
  - [x] Register `commands::upsert_settings` in `tauri::generate_handler![]` in `src-tauri/src/lib.rs`

- [x] Task 5: Implement `init_data_folder` Tauri command (AC: #3)
  - [x] Add `init_data_folder(data_folder_path: String)` command that creates the folder if it doesn't exist and writes the sentinel lock file
  - [x] Register `commands::init_data_folder` in `tauri::generate_handler![]`

- [x] Task 6: Wire onboarding redirect in `src/router.tsx` (AC: #1, #6)
  - [x] Add `guardOnboarding()` function reading `useSettingsStore.getState()` — redirects to `/onboarding` if `settings === null || !settings.onboardingComplete`
  - [x] Add `guardOnboarding()` call to `beforeLoad` of budget, ledger, merchant-rules, and settings routes (BEFORE `guardTurnTheMonth`)
  - [x] Add reverse guard to onboarding route `beforeLoad` — redirects to `/` if already onboarded
  - [x] Replace the placeholder onboarding route component with `OnboardingPage` from `src/features/settings/OnboardingPage.tsx`

- [x] Task 7: Build `OnboardingPage.tsx` with 4-step wizard (AC: #1, #2, #3, #4, #5, #6)
  - [x] Create `src/features/settings/OnboardingPage.tsx` — multi-step wizard with step counter ("Step N of 4"), back/next affordances, welcome screen before step 1
  - [x] Welcome screen: single-sentence description, "Get Started" CTA — no feature tour
  - [x] Step 1: budget name input (Text Input) + start month select (e.g. `<select>` of past 12 months as YYYY-MM)
  - [x] Step 2: folder path display + "Browse…" button triggering `open({ directory: true })` from plugin-dialog; selected path shown inline before confirm
  - [x] Step 3: pay frequency radio group (weekly / bi-weekly / twice-monthly / monthly); conditional pay date inputs based on selection
  - [x] Step 4: savings target number input, pre-populated with 10, `%` suffix label; range 0–100
  - [x] On final step confirm: call `init_data_folder`, then `upsert_settings`, then navigate to `/`
  - [x] Delete `src/features/settings/.gitkeep`

- [x] Task 8: Add `upsertSettings` action to `useSettingsStore` (AC: #4, #5, #6)
  - [x] Add `upsertSettings(input: UpsertSettingsInput): Promise<void>` action following `isWriting`/`finally` pattern
  - [x] After successful upsert, call `loadSettings()` to refresh store state
  - [x] Add `UpsertSettingsInput` interface to `src/lib/types.ts`

- [x] Task 9: Write Vitest tests
  - [x] Test: `guardOnboarding` redirects to `/onboarding` when settings is null
  - [x] Test: `guardOnboarding` redirects to `/onboarding` when `onboardingComplete === false`
  - [x] Test: `guardOnboarding` does NOT redirect when `onboardingComplete === true`
  - [x] Test: `useSettingsStore.upsertSettings` sets `isWriting: true` during invoke, `false` after
  - [x] Test file: `src/features/settings/OnboardingPage.test.tsx`

- [x] Task 10: Write Playwright E2E test for onboarding flow
  - [x] Test file: `e2e/onboarding.spec.ts` — verify full 4-step flow completes and redirects to `/`

## Dev Notes

---

### Prerequisite: Migration 002 Must Land Before Any Other Task

Migration 002 adds the `budget_name` and `start_month` columns to the `settings` table. All tasks that touch the `Settings` struct (Tasks 2, 4, 7, 8) depend on this schema. Do Task 1 first.

---

### Migration 002

**File:** `src-tauri/migrations/002_add_budget_name_start_month.sql`

```sql
-- Migration 002: Add budget identity + updated_at trigger
-- Adds: budget_name, start_month columns to settings
-- Fixes: updated_at trigger deferred from Story 1.3

ALTER TABLE settings ADD COLUMN budget_name TEXT;
ALTER TABLE settings ADD COLUMN start_month TEXT;  -- ISO YYYY-MM format e.g. '2026-04'

-- Fix deferred from Story 1.3: settings.updated_at was never refreshed on row update.
-- This trigger fires after any UPDATE on settings and sets updated_at to current UTC time.
CREATE TRIGGER IF NOT EXISTS settings_updated_at
AFTER UPDATE ON settings
BEGIN
  UPDATE settings SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

**Register in `src-tauri/src/migrations.rs`:**

```rust
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../migrations/001_initial_schema.sql")),
    (2, include_str!("../migrations/002_add_budget_name_start_month.sql")),  // add this
];
```

The compile-time assertion (`assert!`) enforces strictly ascending version order — version 2 > 1 satisfies this. The runtime MAX(version) check is safe for adding version 2. (Deferred risk: back-filled versions would be silently skipped; not applicable here.)

**Update test in `src-tauri/src/migrations.rs`:**
```rust
fn test_migrations_run_on_fresh_db() {
    // ...
    assert_eq!(version, 2, "schema_version should be 2 after both migrations");
}
```

---

### Settings Type Additions

**`src/lib/types.ts` — update Settings interface (add two fields only, keep all existing):**

```typescript
export interface Settings {
  id: 1;
  budgetName: string | null;       // new in migration 002
  startMonth: string | null;       // new in migration 002 — ISO YYYY-MM e.g. "2026-04"
  payFrequency: string | null;
  payDates: string | null;         // JSON string e.g. '["1","15"]'
  savingsTargetPct: number;        // whole percentage (10 = 10%), NOT cents
  dataFolderPath: string | null;
  onboardingComplete: boolean;
  createdAt: string;               // ISO 8601 UTC
  updatedAt: string;               // ISO 8601 UTC
}

// Input type for upsert_settings Tauri command.
// All fields optional — only provided fields are meaningful during step-by-step onboarding.
export interface UpsertSettingsInput {
  budgetName?: string | null;
  startMonth?: string | null;
  payFrequency?: string | null;
  payDates?: string | null;
  savingsTargetPct?: number;
  dataFolderPath?: string | null;
  onboardingComplete?: boolean;
}
```

**`src-tauri/src/commands/mod.rs` — update Settings struct and get_settings query:**

```rust
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub id: i64,
    pub budget_name: Option<String>,    // new
    pub start_month: Option<String>,    // new
    pub pay_frequency: Option<String>,
    pub pay_dates: Option<String>,
    pub savings_target_pct: i64,
    pub data_folder_path: Option<String>,
    pub onboarding_complete: bool,
    pub created_at: String,
    pub updated_at: String,
}
```

Update `get_settings` SQL query:

```rust
let result = conn.query_row(
    "SELECT id, budget_name, start_month, pay_frequency, pay_dates, \
     savings_target_pct, data_folder_path, onboarding_complete, created_at, updated_at \
     FROM settings WHERE id = 1",
    [],
    |row| {
        Ok(Settings {
            id: row.get(0)?,
            budget_name: row.get(1)?,
            start_month: row.get(2)?,
            pay_frequency: row.get(3)?,
            pay_dates: row.get(4)?,
            savings_target_pct: row.get(5)?,
            data_folder_path: row.get(6)?,
            onboarding_complete: row.get::<_, i64>(7)? != 0,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    },
);
```

---

### `upsert_settings` Tauri Command

Add to `src-tauri/src/commands/mod.rs`:

```rust
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSettingsInput {
    pub budget_name: Option<String>,
    pub start_month: Option<String>,
    pub pay_frequency: Option<String>,
    pub pay_dates: Option<String>,
    pub savings_target_pct: Option<i64>,
    pub data_folder_path: Option<String>,
    pub onboarding_complete: Option<bool>,
}

#[tauri::command]
pub fn upsert_settings(
    state: State<DbState>,
    input: UpsertSettingsInput,
) -> Result<(), AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;

    // Validate savings_target_pct range if provided
    if let Some(pct) = input.savings_target_pct {
        if !(0..=100).contains(&pct) {
            return Err(AppError {
                code: "INVALID_SAVINGS_TARGET".to_string(),
                message: format!("savings_target_pct must be 0–100, got {}", pct),
            });
        }
    }

    // Use INSERT ... ON CONFLICT to upsert. COALESCE preserves existing value when new value is NULL.
    // For onboarding, all fields are always provided — COALESCE safety net for partial updates (Story 1.6).
    conn.execute(
        "INSERT INTO settings (
            id, budget_name, start_month, pay_frequency, pay_dates,
            savings_target_pct, data_folder_path, onboarding_complete
         ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
            budget_name          = COALESCE(?1, budget_name),
            start_month          = COALESCE(?2, start_month),
            pay_frequency        = COALESCE(?3, pay_frequency),
            pay_dates            = COALESCE(?4, pay_dates),
            savings_target_pct   = COALESCE(?5, savings_target_pct),
            data_folder_path     = COALESCE(?6, data_folder_path),
            onboarding_complete  = COALESCE(?7, onboarding_complete)",
        rusqlite::params![
            input.budget_name,
            input.start_month,
            input.pay_frequency,
            input.pay_dates,
            input.savings_target_pct,
            input.data_folder_path,
            input.onboarding_complete.map(|b| if b { 1i64 } else { 0i64 }),
        ],
    ).map_err(AppError::from)?;

    Ok(())
}
```

> **COALESCE note:** `COALESCE(?N, col)` preserves the existing value when NULL is passed. This means once a field is set, it cannot be cleared via `upsert_settings` by passing null. For onboarding this is fine (all fields are set at once). Story 1.6 (Settings Screen) must handle explicit clearing differently if needed.

> **`onboarding_complete` encoding:** Converted to `Option<i64>` (0 or 1) before binding. The schema has `CHECK (onboarding_complete IN (0, 1))` which enforces this at the DB level.

---

### `init_data_folder` Tauri Command

Add to `src-tauri/src/commands/mod.rs`:

```rust
#[tauri::command]
pub fn init_data_folder(data_folder_path: String) -> Result<(), AppError> {
    use std::path::Path;

    let folder = Path::new(&data_folder_path);

    // Create the folder if it doesn't exist
    std::fs::create_dir_all(folder).map_err(|e| AppError {
        code: "FOLDER_CREATE_FAIL".to_string(),
        message: format!("Failed to create data folder: {}", e),
    })?;

    // Write sentinel lock file — presence signals this instance owns the folder
    let lock_path = folder.join("garbanzobeans.lock");
    std::fs::write(&lock_path, format!("locked\n")).map_err(|e| AppError {
        code: "SENTINEL_WRITE_FAIL".to_string(),
        message: format!("Failed to write sentinel lock file: {}", e),
    })?;

    Ok(())
}
```

Register both new commands in `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    commands::get_db_status,
    commands::get_settings,
    commands::upsert_settings,   // add
    commands::init_data_folder,  // add
])
```

---

### `tauri-plugin-dialog` Setup

**`src-tauri/Cargo.toml`** — add to `[dependencies]`:
```toml
tauri-plugin-dialog = "2"
```

**`src-tauri/src/lib.rs`** — add plugin initialization (before `.invoke_handler()`):
```rust
.plugin(tauri_plugin_dialog::init())
```

**Capabilities file** — add `"dialog:default"` to the permissions array in whichever capabilities JSON file applies (typically `src-tauri/capabilities/default.json`):
```json
{
  "permissions": [
    "core:default",
    "dialog:default"
  ]
}
```

**JS install:**
```bash
npm install @tauri-apps/plugin-dialog
```

**JS usage in `OnboardingPage.tsx`:**
```typescript
import { open } from '@tauri-apps/plugin-dialog';

const handleBrowse = async () => {
  const selected = await open({ directory: true, multiple: false, title: 'Select GarbanzoBeans data folder' });
  if (selected && typeof selected === 'string') {
    setDataFolderPath(selected);
  }
};
```

---

### Router Update: `src/router.tsx`

Add `guardOnboarding` alongside the existing `guardTurnTheMonth`. Apply both to guarded routes:

```typescript
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useMonthStore } from '@/stores/useMonthStore';
import OnboardingPage from '@/features/settings/OnboardingPage';

// Guard: redirect to /onboarding if not yet onboarded.
// Called before guardTurnTheMonth on all protected routes.
function guardOnboarding() {
  const { settings } = useSettingsStore.getState();
  if (!settings || !settings.onboardingComplete) {
    throw redirect({ to: '/onboarding' });
  }
}

function guardTurnTheMonth() {
  const { monthStatus } = useMonthStore.getState();
  if (monthStatus.startsWith('closing:')) {
    throw redirect({ to: '/turn-the-month' });
  }
}

// Apply both guards (onboarding checked first) to all protected routes:
// budgetRoute, ledgerRoute, merchantRulesRoute, settingsRoute

// Example for budget route:
const budgetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <div>Budget — coming in Epic 2</div>,
  beforeLoad: () => {
    guardOnboarding();
    guardTurnTheMonth();
  },
});

// Onboarding route — replace placeholder with real component; add reverse guard:
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: OnboardingPage,
  beforeLoad: () => {
    const { settings } = useSettingsStore.getState();
    if (settings?.onboardingComplete) {
      throw redirect({ to: '/' });
    }
    // No Turn the Month guard — onboarding must be accessible even during closing state
  },
});
```

> **Important:** `guardOnboarding` uses `useSettingsStore.getState()` — not the hook. Hooks cannot be called outside React components. The root loader has already awaited `loadSettings()`, so `getState().settings` is populated when `beforeLoad` fires.

---

### `useSettingsStore` — Add `upsertSettings` Action

**`src/stores/useSettingsStore.ts`** — add action to the store (do not remove existing actions):

```typescript
import type { AppError, Settings, UpsertSettingsInput } from '@/lib/types';
import { invoke } from '@tauri-apps/api/core';

// Add to SettingsState interface:
upsertSettings: (input: UpsertSettingsInput) => Promise<void>;

// Add to create() implementation:
upsertSettings: async (input) => {
  set({ isWriting: true, error: null });
  try {
    await invoke('upsert_settings', { input });
    // Refresh store state from DB after successful write
    const result = await invoke<Settings | null>('get_settings');
    set({ settings: result });
  } catch (err) {
    set({ error: err as AppError });
    throw err;  // re-throw so OnboardingPage can detect failure
  } finally {
    set({ isWriting: false });
  }
},
```

> **Re-throw on error:** `upsertSettings` re-throws so the OnboardingPage can show inline error feedback. This is different from `loadSettings` (which silently stores the error). Justification: onboarding failure must be surfaced immediately; the user cannot proceed if settings don't persist.

---

### `OnboardingPage.tsx` Component Structure

**File:** `src/features/settings/OnboardingPage.tsx`

```
OnboardingPage
├── state: currentStep (0=welcome | 1-4=steps) + per-step form fields
├── WelcomeView — single sentence + "Get Started" button
├── StepShell — "Step N of 4" counter + Back/Next affordances
│   ├── Step1: BudgetNameStep — Input (budget name) + start month select
│   ├── Step2: DataFolderStep — "Browse…" button + selected path display
│   ├── Step3: PayFrequencyStep — RadioGroup + conditional date inputs
│   └── Step4: SavingsTargetStep — number Input + confirm button
└── On final confirm: invoke init_data_folder → upsertSettings → navigate('/')
```

**Key implementation rules:**
- Back button is always non-destructive: returns to previous step with form data preserved
- Progress through steps is purely in React state (no partial DB writes per step) — single `upsert_settings` call on final confirm
- Exception: `init_data_folder` IS called when user confirms the data folder (step 2 confirm / final confirm) — sentinel lock must be written before `upsertSettings`
- Use shadcn/ui `Input`, `Button` (Primary for Next/Confirm, Ghost for Back), `Select` for start month — all already themed from Story 1.2
- No modal dialogs — onboarding is itself a full-screen overlay (no sidebar visible during onboarding)
- Step counter: `type-label` text style, `--color-text-muted` color, top-right of step shell

**Step 3 — Pay Frequency Inputs:**

| Frequency | Pay Dates Input |
|---|---|
| weekly | Single select: day of week (Mon–Sun) |
| bi-weekly | Single select: day of week (Mon–Sun) |
| twice-monthly | Two number inputs: day 1, day 2 (1–28) |
| monthly | Single number input: day of month (1–28) |

`payDates` JSON format stored in DB:
- weekly / bi-weekly: `'"Mon"'` (day name string)
- twice-monthly: `'["1","15"]'` (two day numbers as strings)
- monthly: `'"15"'` (single day number as string)

**Step 4 — Savings Target:**
```typescript
// Default: 10%
const [savingsTarget, setSavingsTarget] = useState(10);

// Validation: 0–100 integer only
// Input: type="number" min="0" max="100" step="1"
// Display: "{value}% of income" helper text
```

---

### Full-Screen Layout During Onboarding

During onboarding, the standard two-panel layout (sidebar + main) should NOT be shown. The onboarding page is full-screen. Implement this in the onboarding route by NOT using the root layout (`App.tsx`) as the parent, OR by conditionally suppressing the sidebar in `App.tsx` when on `/onboarding`.

**Recommended approach:** Suppress the sidebar and read-only banner in `App.tsx` when on the onboarding route:

```typescript
// In App.tsx
import { useRouterState } from '@tanstack/react-router';

function App() {
  const isOnboarding = useRouterState({ select: (s) => s.location.pathname === '/onboarding' });
  const isReadOnly = useSettingsStore((s) => s.isReadOnly);

  if (isOnboarding) {
    return (
      <TooltipProvider delayDuration={300}>
        <div className="flex h-screen w-full" style={{ backgroundColor: 'var(--color-bg-app)' }}>
          <Outlet />
        </div>
      </TooltipProvider>
    );
  }

  // ... existing two-panel layout
}
```

---

### Database Location Scope Boundary

**This story does NOT relocate the SQLite database.**

The `lib.rs` comment ("Story 1.5 will update this to the user-selected folder") refers to storing `data_folder_path` in settings — the setting is now captured and persisted. The physical DB file remains at `app_local_data_dir` for the MVP development phase. The user's selected folder receives only the sentinel lock file.

**Deferred:** DB relocation to the user-selected folder. This requires updating `lib.rs` to either (a) read `data_folder_path` from settings before opening the main DB (requires a bootstrap query or separate config mechanism) or (b) move the DB file at onboarding completion (requires `Mutex<Option<Connection>>` pattern or similar). Defer to a dedicated infrastructure story before any public release.

---

### Architecture Compliance Rules

- **Store-first IPC:** `OnboardingPage` calls `useSettingsStore.getState().upsertSettings(...)` and `invoke('init_data_folder', ...)` — but `init_data_folder` is not a settings concern. Add it as an action on `useSettingsStore` OR call `invoke()` directly from the page. **Exception: `init_data_folder` is a one-off infrastructure call during onboarding only — calling `invoke()` directly from `OnboardingPage` for this single command is acceptable.** Do NOT add it to the settings store as it has no state to manage.
- **`isWriting` pattern:** `upsertSettings` follows the `isWriting`/`finally` pattern (same as `loadSettings`).
- **Feature folder:** `src/features/settings/` — delete `.gitkeep` when `OnboardingPage.tsx` is created.
- **Test co-location:** `OnboardingPage.test.tsx` lives next to `OnboardingPage.tsx` in `src/features/settings/`.
- **No `invoke()` in components except for `init_data_folder`** (documented exception above).

---

### Anti-Patterns to Avoid

**WRONG — calling `upsertSettings` per step:**
```typescript
// Do NOT save to DB after each step
handleStep1Next: async () => {
  await upsertSettings({ budgetName, startMonth });
  setStep(2);
}
```

**CORRECT — single upsert at the end:**
```typescript
handleFinalConfirm: async () => {
  await invoke('init_data_folder', { dataFolderPath });
  await upsertSettings({ budgetName, startMonth, payFrequency, payDates, savingsTargetPct, dataFolderPath, onboardingComplete: true });
  navigate({ to: '/' });
}
```

**WRONG — hook call in `beforeLoad`:**
```typescript
beforeLoad: () => {
  const { settings } = useSettingsStore(); // ❌ hook — only works in React components
}
```

**CORRECT:**
```typescript
beforeLoad: () => {
  const { settings } = useSettingsStore.getState(); // ✓ static access
}
```

**WRONG — redirecting before `loadSettings` completes:**
The root loader `await`s `loadSettings()` before child routes' `beforeLoad` fires. Do not move `guardOnboarding` into a child route `loader` — it would run in parallel with `loadSettings` and may see `settings: null` even on a returning user.

**WRONG — showing sidebar/nav during onboarding:**
The onboarding flow is full-screen. Showing the standard two-panel layout during onboarding confuses the user into thinking navigation is available. Suppress the sidebar when `pathname === '/onboarding'`.

---

### File Structure After This Story

**New files:**
```
src-tauri/migrations/002_add_budget_name_start_month.sql
src/features/settings/OnboardingPage.tsx
src/features/settings/OnboardingPage.test.tsx
e2e/onboarding.spec.ts
```

**Modified files:**
```
src/lib/types.ts                          — Settings + UpsertSettingsInput additions
src/stores/useSettingsStore.ts            — upsertSettings action added
src/router.tsx                            — guardOnboarding added; onboarding route component replaced
src/App.tsx                               — full-screen mode for /onboarding route
src-tauri/src/migrations.rs              — MIGRATIONS array + test version bump
src-tauri/src/commands/mod.rs            — Settings struct + get_settings query updated; upsert_settings + init_data_folder added
src-tauri/src/lib.rs                     — dialog plugin init + new commands registered
src-tauri/Cargo.toml                     — tauri-plugin-dialog dependency
src-tauri/capabilities/default.json      — dialog:default permission added
_bmad-output/implementation-artifacts/sprint-status.yaml — status updated
```

**Deleted files:**
```
src/features/settings/.gitkeep
```

**NOT modified:**
- `src-tauri/src/db.rs` — WAL/integrity-check/migration-runner untouched
- `src-tauri/src/error.rs` — AppError shape unchanged
- `src-tauri/src/migrations/001_initial_schema.sql` — never modify applied migrations
- All Zustand stores except `useSettingsStore.ts`
- All `src/components/ui/` shadcn wrappers

---

### Learnings from Stories 1.1–1.4

**From Story 1.4 review findings (must address in this story):**

- **Onboarding redirect ownership:** Story 1.4 explicitly deferred the redirect from `/` to `/onboarding` to this story. The `/onboarding` route is scaffolded; this story replaces its placeholder component and adds both the forward guard (all protected routes → `/onboarding`) and reverse guard (onboarding → `/` if already complete).
- **`upsert_settings` was removed from Story 1.4 scope** — the command does not exist yet. This story adds it.
- **`onboarding_complete` encoding:** Rust side must map `bool → i64` explicitly (1 for true, 0 for false). The schema has `CHECK (onboarding_complete IN (0, 1))`. See `upsert_settings` implementation above.
- **`savings_target_pct` INSERT default:** The schema has `DEFAULT 10` but SQL NULL passed during INSERT would override this. The `upsert_settings` command must NOT pass `savings_target_pct = None` on insert without a fallback. In onboarding, always send the actual value (user enters it or accepts 10%); never send None.
- **`settings.updated_at` trigger:** Was deferred from Story 1.3. Migration 002 adds this trigger. After this story, `updated_at` auto-updates on every settings write.

**From Story 1.4 dev notes — tsconfig.json:**
- `noUncheckedIndexedAccess: true` is already set. Any array index access in `OnboardingPage.tsx` (e.g., iterating pay date fields) must handle the `T | undefined` case.

**Existing patterns to follow:**
- Store pattern: `isWriting: true` → `invoke()` → `set()` → `finally: isWriting: false` — exactly as in `loadSettings`
- Import `invoke` from `@tauri-apps/api/core` (not the legacy v1 path)
- Zustand v5 syntax: `create<State>()(...)` — no middleware needed here
- `@/` path alias works for all `src/` imports (configured in tsconfig and vite)

---

### Testing Requirements

**Vitest tests (co-located):**

```typescript
// src/features/settings/OnboardingPage.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/useSettingsStore';

describe('guardOnboarding', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, isWriting: false, isReadOnly: false, error: null });
  });

  it('redirects to /onboarding when settings is null', () => {
    // import guardOnboarding and test redirect throw
  });

  it('redirects to /onboarding when onboardingComplete is false', () => {
    useSettingsStore.setState({ settings: { ...mockSettings, onboardingComplete: false } });
    // expect redirect throw to /onboarding
  });

  it('does not redirect when onboardingComplete is true', () => {
    useSettingsStore.setState({ settings: { ...mockSettings, onboardingComplete: true } });
    // expect no redirect thrown
  });
});

describe('useSettingsStore.upsertSettings', () => {
  it('sets isWriting: true during invoke, false after', async () => {
    // mock @tauri-apps/api/core invoke
    // verify isWriting transitions
  });
});
```

**Playwright E2E (`e2e/onboarding.spec.ts`):**
```typescript
test('completes onboarding and redirects to budget screen', async ({ page }) => {
  // Navigate to /onboarding
  // Fill step 1: budget name + start month
  // Step 2: skip actual folder dialog (mock or use a known temp path)
  // Step 3: select pay frequency + dates
  // Step 4: accept default savings target
  // Click confirm
  // Assert: URL is now "/"
  // Assert: sidebar is visible
  // Assert: navigating to /onboarding redirects to /
});
```

---

### References

- Architecture ADR-1: Single Data Store (SQLite) — `data_folder_path` stored in DB, not a JSON config
- Architecture ADR-3: Typed Commands Per Domain Operation — `upsert_settings`, `init_data_folder`
- Architecture ADR-5: Zustand Domain Slices — `upsertSettings` action in `useSettingsStore`
- UX-DR20: Onboarding flow spec — welcome screen, no feature tour, 4 steps
- UX-DR9: Turn the Month Stepper pattern — step counter visible, back always non-destructive (same pattern applied to onboarding)
- Deferred from 1.3: `updated_at` trigger — lands in migration 002
- Deferred from 1.4: `upsert_settings` command, onboarding redirect, `onboarding_complete` encoding
- tauri-plugin-dialog v2: `open({ directory: true })` returns `string | null`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was clean; no debugging required.

### Completion Notes List

- Migration 002 adds `budget_name` and `start_month` columns to `settings` via ALTER TABLE; also delivers the deferred `settings_updated_at` trigger from Story 1.3.
- `upsert_settings` uses INSERT…ON CONFLICT with COALESCE to protect existing values from null overwrites; `onboarding_complete` bool is explicitly encoded to i64 before binding.
- `init_data_folder` creates the folder with `create_dir_all` (idempotent) then writes `garbanzobeans.lock`; called once at onboarding completion only.
- `guardOnboarding` exported from `router.tsx` (uses `getState()` not hook); applied to `/`, `/ledger`, `/merchant-rules`, `/settings` before `guardTurnTheMonth`. Reverse guard on `/onboarding` redirects to `/` if already complete.
- `App.tsx` detects `/onboarding` pathname via `useRouterState` and renders a full-screen layout (no sidebar, no read-only banner) for that route only.
- `OnboardingPage.tsx` is a pure React state wizard; single `upsert_settings` call on final confirm. Step 3 pay-date inputs are conditional on selected frequency. Back is always non-destructive.
- `upsertSettings` store action re-throws on error so `OnboardingPage` can surface inline error feedback.
- Vitest tests: 5 tests covering `guardOnboarding` (null settings, false onboardingComplete, true) and `upsertSettings` (isWriting transitions, error re-throw). All 26 Vitest tests pass. 4 Rust tests pass.
- E2E test uses `addInitScript` to inject `window.__TAURI_INTERNALS__` mock (stateful: `get_settings` returns null until `upsert_settings` populates it); covers full flow + reverse guard + back-button preservation.

### File List

**New files:**
- `src-tauri/migrations/002_add_budget_name_start_month.sql`
- `src/features/settings/OnboardingPage.tsx`
- `src/features/settings/OnboardingPage.test.tsx`
- `e2e/onboarding.spec.ts`

**Modified files:**
- `src/lib/types.ts` — `Settings` + `UpsertSettingsInput` additions
- `src/stores/useSettingsStore.ts` — `upsertSettings` action added
- `src/stores/useSettingsStore.test.ts` — updated `mockSettings` for new `Settings` fields
- `src/router.tsx` — `guardOnboarding` added (exported); onboarding route component replaced; all protected routes updated
- `src/App.tsx` — full-screen mode for `/onboarding` route via `useRouterState`
- `src-tauri/src/migrations.rs` — MIGRATIONS array + test version assertions bumped to 2
- `src-tauri/src/commands/mod.rs` — `Settings` struct + `get_settings` query updated; `UpsertSettingsInput`, `upsert_settings`, `init_data_folder` added
- `src-tauri/src/lib.rs` — dialog plugin init + new commands registered
- `src-tauri/Cargo.toml` — `tauri-plugin-dialog = "2"` dependency added
- `src-tauri/capabilities/default.json` — `"dialog:default"` permission added
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-5` status updated
- `package-lock.json` — `@tauri-apps/plugin-dialog` added

**Deleted files:**
- `src/features/settings/.gitkeep`

### Review Findings

<!-- Code review conducted 2026-04-06 | 1 decision-needed · 11 patch · 8 defer · 1 dismissed -->

**Decision-Needed**
- [x] [Review][Decision] `init_data_folder` partial failure — resolved: reordered to call `upsertSettings` first, then `init_data_folder` [src/features/settings/OnboardingPage.tsx:521]

**Patches**
- [x] [Review][Patch] `settings_updated_at` trigger fires on every UPDATE including its own inner UPDATE — added `WHEN NEW.updated_at IS OLD.updated_at` guard [src-tauri/migrations/002_add_budget_name_start_month.sql:10]
- [x] [Review][Patch] `guardOnboarding` runs before root `loader` completes — moved `loadSettings` from root `loader` to root `beforeLoad` [src/router.tsx:42]
- [x] [Review][Patch] `onboarding_complete` can be NULL — changed to `row.get::<_, Option<i64>>(7)?.unwrap_or(0) != 0` for defensive null handling [src-tauri/src/commands/mod.rs:74]
- [x] [Review][Patch] `upsertSettings` inlines raw `invoke('get_settings')` — replaced with `get().loadSettings()` per Task 8 spec [src/stores/useSettingsStore.ts:40]
- [x] [Review][Patch] `twice-monthly` pay date inputs accept out-of-range values (0, 29+) and identical dates — added 1–28 range validation and duplicate date rejection [src/features/settings/OnboardingPage.tsx:277]
- [x] [Review][Patch] `payDate1 === payDate2` for `twice-monthly` not rejected — covered by the range validation fix above [src/features/settings/OnboardingPage.tsx:277]
- [x] [Review][Patch] `start_month` no format validation in backend — added YYYY-MM format validation in `upsert_settings` [src-tauri/src/commands/mod.rs:107]
- [x] [Review][Patch] `pay_frequency` no validation in backend — added allowlist validation in `upsert_settings` [src-tauri/src/commands/mod.rs:107]
- [x] [Review][Patch] `loadSettings` swallows DB errors silently — deferred (pre-existing from Story 1.4, no error UI available yet) [src/stores/useSettingsStore.ts:28]
- [x] [Review][Patch] `init_data_folder` accepts arbitrary filesystem paths — added empty/absolute/traversal validation [src-tauri/src/commands/mod.rs:154]
- [x] [Review][Patch] E2E does not verify AC6 "not shown again on subsequent launches" — mock persists via sessionStorage; reload assertion added to wizard completion test [e2e/onboarding.spec.ts]

**Deferred**
- [x] [Review][Defer] `loadSettings` sets `isWriting: true` for read operations — misleading flag name causes spurious "Saving…" during reads [src/stores/useSettingsStore.ts:24] — deferred, pre-existing from Story 1.3
- [x] [Review][Defer] `upsert_settings` COALESCE prevents field nullification once set — acceptable for onboarding scope; spec acknowledges limitation [src-tauri/src/commands/mod.rs:259] — deferred, pre-existing design decision
- [x] [Review][Defer] `pastTwelveMonths` uses local time — one-month shift at midnight/month-boundary for some users [src/features/settings/OnboardingPage.tsx:28] — deferred, pre-existing
- [x] [Review][Defer] E2E double `addInitScript`: `injectTauriMock` + in-test override — Playwright guarantees registration order so not currently broken [e2e/onboarding.spec.ts:139] — deferred, low risk
- [x] [Review][Defer] `budget_name` non-breaking space (U+00A0) passes `.trim()` — stored as invisible whitespace [src/features/settings/OnboardingPage.tsx:129] — deferred, pre-existing
- [x] [Review][Defer] `guardTurnTheMonth` does not handle `'closed'` monthStatus — pre-existing from Story 1.4 [src/router.tsx:28] — deferred, pre-existing
- [x] [Review][Defer] `unchecked_transaction` in migrations — theoretical interleave if caller holds open transaction [src-tauri/src/migrations.rs:41] — deferred, theoretical
- [x] [Review][Defer] `guardOnboarding` exported from router module — exposed on public API surface for test access [src/router.tsx:17] — deferred, low risk

## Change Log

- 2026-04-06: Story 1.5 created — Onboarding First Launch Setup.
- 2026-04-06: Story 1.5 implemented — all 10 tasks complete; 26 Vitest + 4 Rust tests passing; TypeScript clean.
