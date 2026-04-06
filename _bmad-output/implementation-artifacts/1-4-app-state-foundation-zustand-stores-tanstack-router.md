# Story 1.4: App State Foundation — Zustand Stores + TanStack Router

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want all Zustand domain slices scaffolded and TanStack Router configured with type-safe routes and mode guards,
so that all subsequent feature stories can wire state and navigation into a ready infrastructure without architectural rework.

## Acceptance Criteria

1. **Given** Zustand is installed, **when** the app initializes, **then** six domain slices exist as importable hooks: `useSettingsStore`, `useEnvelopeStore`, `useTransactionStore`, `useSavingsStore`, `useMerchantRuleStore`, `useMonthStore`; each has an `isWriting: boolean` flag initialized to `false`

2. **Given** TanStack Router is installed and configured, **when** the app loads, **then** all six routes are defined and reachable: `/onboarding`, `/` (Budget), `/ledger`, `/merchant-rules`, `/settings`, `/turn-the-month`; route params and search params are type-safe

3. **Given** the Turn the Month route guard is in place, **when** `useMonthStore` reports month status as `closing:*`, **then** all routes except `/turn-the-month` redirect to `/turn-the-month`; navigating away from Turn the Month while in `closing:*` status is blocked

4. **Given** the read-only route guard is in place, **when** the sentinel lock indicates another instance holds the lock, **then** the app enters read-only mode and the UI reflects this state visually; write actions are disabled (sentinel detection deferred to Story 1.7; scaffold the flag and UI treatment here)

5. **Given** a Tauri command is invoked via a store action, **when** the command is in-flight, **then** the store's `isWriting` flag is `true`; UI updates that depend on that store's data are suppressed until the command resolves; on resolution the flag clears and the UI updates as a batch

## Tasks / Subtasks

- [x] Task 1: Install packages and harden tsconfig (AC: #1, #2)
  - [x] `npm install zustand @tanstack/react-router`
  - [x] `npm install --save-dev @tanstack/router-devtools` (dev only)
  - [x] Add `"noUncheckedIndexedAccess": true` to `compilerOptions` in `tsconfig.json` (deferred from Story 1.2 code review; must land before Story 2.1 first data model)

- [x] Task 2: Extend `src/lib/types.ts` with store-related types (AC: #1, #3, #4)
  - [x] Add `MonthStatus` type: `type MonthStatus = 'open' | 'closed' | \`closing:${number}\``
  - [x] Add `Settings` interface matching the SQLite `settings` table (camelCase field names; `onboardingComplete: boolean`, not INTEGER)
  - [x] Keep existing `AppError` interface unchanged

- [x] Task 3: Add `get_settings` Tauri command on the Rust side (AC: #1)
  - [x] Add `Settings` serde struct to `src-tauri/src/commands/mod.rs` with `#[serde(rename_all = "camelCase")]`
  - [x] Implement `get_settings` — queries `settings` table WHERE `id = 1`; returns `Ok(None)` if no row exists (pre-onboarding state); returns `Ok(Some(Settings {...}))` if found
  - [x] Register `commands::get_settings` in `tauri::generate_handler![]` in `src-tauri/src/lib.rs`

- [x] Task 4: Create six Zustand store files in `src/stores/` (AC: #1, #5)
  - [x] `src/stores/useSettingsStore.ts` — settings data + `isWriting` + `isReadOnly` (scaffold for Story 1.7)
  - [x] `src/stores/useEnvelopeStore.ts` — envelope list + `isWriting`
  - [x] `src/stores/useTransactionStore.ts` — transactions + import queue + `isWriting`
  - [x] `src/stores/useSavingsStore.ts` — reconciliation history + savings flow + `isWriting`
  - [x] `src/stores/useMerchantRuleStore.ts` — rules list + `isWriting`
  - [x] `src/stores/useMonthStore.ts` — `monthStatus: MonthStatus` (default `'open'`) + `isWriting`
  - [x] Delete `src/stores/.gitkeep`

- [x] Task 5: Create TanStack Router config and route tree (AC: #2, #3, #4)
  - [x] Create `src/router.tsx` — root route with layout, 6 child routes, router instance, module augmentation
  - [x] Create placeholder components for each route (one file per feature, inside the existing feature folders)
  - [x] Root route `loader` hydrates `useSettingsStore` from `get_settings` on app init

- [x] Task 6: Update `src/App.tsx` → root layout component (AC: #2, #4)
  - [x] Replace placeholder `<button>` nav items with TanStack Router `<Link>` components using `activeProps` for active state
  - [x] Replace main content placeholder with `<Outlet />` for routed content
  - [x] Add persistent read-only banner (conditionally shown when `isReadOnly === true`)
  - [x] Move `<TooltipProvider>` wrapping to the root layout (already there — keep it)

- [x] Task 7: Implement route guards (AC: #3, #4)
  - [x] `beforeLoad` on all guarded routes calling `guardTurnTheMonth()` — reads `useMonthStore.getState().monthStatus`; throws `redirect({ to: '/turn-the-month' })` when `startsWith('closing:')`
  - [x] `/turn-the-month` route has its own `beforeLoad` that redirects to `/` if month status is NOT `closing:*` (prevents manual navigation to Turn the Month when not applicable)

- [x] Task 8: Wire up `src/main.tsx` (AC: #2)
  - [x] Replace current `<App />` render with `<RouterProvider router={router} />` — `App.tsx` becomes the root layout component used inside the root route
  - [x] Keep `React.StrictMode` wrapper

- [x] Task 9: Write Vitest tests (AC: #1, #5)
  - [x] Test: each of the six stores initializes with `isWriting: false`
  - [x] Test: `useSettingsStore` initializes with `isReadOnly: false`
  - [x] Test: `useMonthStore` initializes with `monthStatus: 'open'`
  - [x] Test: `isWriting` flag is `true` during async action, `false` after

## Dev Notes

### Package Versions (verified 2026-04-06)

```
@tanstack/react-router  1.168.10
@tanstack/router-devtools  1.x (matches react-router version)
zustand  5.0.12
```

Install commands:
```bash
npm install zustand @tanstack/react-router
npm install --save-dev @tanstack/router-devtools
```

---

### tsconfig.json Change

Add one line to `compilerOptions`:

```json
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true
  }
}
```

This is deferred from Story 1.2 code review. It must land before Story 2.1 (first data model). If it causes type errors in existing code (e.g., array index access in `src/lib/design-tokens.ts`), fix those errors — do not disable the flag.

---

### `src/lib/types.ts` — Additions Only

Add these exports. Do NOT remove or change the existing `AppError` interface.

```typescript
// All Tauri commands reject with this shape. Import from here everywhere.
// Matches the Rust AppError struct in src-tauri/src/error.rs.
export interface AppError {
  code: string;
  message: string;
}

// Month lifecycle states. 'closing:N' where N is the current step number.
// Defined here so route guards and stores share the same type.
export type MonthStatus = 'open' | 'closed' | `closing:${number}`;

// Mirrors the SQLite `settings` table (single row, id = 1).
// null fields = not yet configured (pre-onboarding).
// Returned by the get_settings Tauri command.
export interface Settings {
  id: 1;
  payFrequency: string | null;
  payDates: string | null;        // JSON string e.g. '["1","15"]', parsed by Rust
  savingsTargetPct: number;       // whole percentage (10 = 10%), NOT cents
  dataFolderPath: string | null;
  onboardingComplete: boolean;    // Rust converts SQLite 0/1 to bool
  createdAt: string;              // ISO 8601 UTC
  updatedAt: string;              // ISO 8601 UTC
}
```

---

### Rust: `get_settings` Command

Add to `src-tauri/src/commands/mod.rs`:

```rust
use crate::error::AppError;
use crate::DbState;
use tauri::State;

// --- existing get_db_status command above ---

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub id: i64,
    pub pay_frequency: Option<String>,
    pub pay_dates: Option<String>,
    pub savings_target_pct: i64,
    pub data_folder_path: Option<String>,
    pub onboarding_complete: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn get_settings(state: State<DbState>) -> Result<Option<Settings>, AppError> {
    let conn = state.0.lock().map_err(|_| AppError {
        code: "DB_LOCK_POISON".to_string(),
        message: "Database mutex was poisoned.".to_string(),
    })?;

    let result = conn.query_row(
        "SELECT id, pay_frequency, pay_dates, savings_target_pct, \
         data_folder_path, onboarding_complete, created_at, updated_at \
         FROM settings WHERE id = 1",
        [],
        |row| {
            Ok(Settings {
                id: row.get(0)?,
                pay_frequency: row.get(1)?,
                pay_dates: row.get(2)?,
                savings_target_pct: row.get(3)?,
                data_folder_path: row.get(4)?,
                onboarding_complete: row.get::<_, i64>(5)? != 0,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    );

    match result {
        Ok(settings) => Ok(Some(settings)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None), // pre-onboarding: no row yet
        Err(e) => Err(AppError::from(e)),
    }
}
```

**Register in `src-tauri/src/lib.rs`:**

```rust
.invoke_handler(tauri::generate_handler![
    commands::get_db_status,
    commands::get_settings,   // add this
])
```

---

### Zustand v5 Store Pattern — `isWriting` Flag

All six stores follow the same pattern. Example using `useSettingsStore`:

```typescript
// src/stores/useSettingsStore.ts
import { create } from 'zustand';
import type { Settings } from '@/lib/types';
import { invoke } from '@tauri-apps/api/core';
import type { AppError } from '@/lib/types';

interface SettingsState {
  settings: Settings | null;
  isWriting: boolean;
  isReadOnly: boolean;    // scaffold for Story 1.7 sentinel detection
  error: AppError | null;

  // Actions
  loadSettings: () => Promise<void>;
  setReadOnly: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  isWriting: false,
  isReadOnly: false,
  error: null,

  loadSettings: async () => {
    set({ isWriting: true, error: null });
    try {
      const result = await invoke<Settings | null>('get_settings');
      set({ settings: result });
    } catch (err) {
      set({ error: err as AppError });
    } finally {
      set({ isWriting: false });
    }
  },

  setReadOnly: (value) => set({ isReadOnly: value }),
}));
```

**Critical rules for all stores:**
- `isWriting` set to `true` before every `invoke()` call
- `isWriting` set to `false` in `finally` — always releases, even on error
- Errors stored in `error` field, not thrown (components read `store.error`)
- Components NEVER call `invoke()` directly — only store actions do
- Components read store state and call store actions only

**Minimal scaffold for other stores (all have `isWriting: false` initially):**

```typescript
// src/stores/useEnvelopeStore.ts
import { create } from 'zustand';

interface EnvelopeState {
  envelopes: never[];   // typed properly in Story 2.1
  isWriting: boolean;
}

export const useEnvelopeStore = create<EnvelopeState>(() => ({
  envelopes: [],
  isWriting: false,
}));
```

```typescript
// src/stores/useMonthStore.ts
import { create } from 'zustand';
import type { MonthStatus } from '@/lib/types';

interface MonthState {
  monthStatus: MonthStatus;
  isWriting: boolean;
}

export const useMonthStore = create<MonthState>(() => ({
  monthStatus: 'open',  // default; months table doesn't exist until Epic 6
  isWriting: false,
}));
```

Use the same minimal scaffold for `useTransactionStore`, `useSavingsStore`, `useMerchantRuleStore` — they will be fleshed out in their respective epics.

---

### TanStack Router v1 — Code-Based Setup

**`src/router.tsx`** — complete file:

```typescript
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import RootLayout from './App';
import { useMonthStore } from '@/stores/useMonthStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

// Guard: redirect to /turn-the-month if month is in closing state.
// Called in beforeLoad of all routes except /turn-the-month itself.
function guardTurnTheMonth() {
  const { monthStatus } = useMonthStore.getState();
  if (monthStatus.startsWith('closing:')) {
    throw redirect({ to: '/turn-the-month' });
  }
}

// Root route: wraps the entire app with the shell layout.
// Loader hydrates settings store on every app init.
const rootRoute = createRootRoute({
  component: () => (
    <>
      <RootLayout />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  ),
  loader: async () => {
    await useSettingsStore.getState().loadSettings();
  },
});

// /  — Budget screen (main view)
const budgetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <Outlet />,   // replaced with BudgetPage in Story 2.2
  beforeLoad: guardTurnTheMonth,
});

// /ledger
const ledgerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ledger',
  component: () => <div className="p-6 type-body" style={{ color: 'var(--color-text-primary)' }}>Ledger — coming in Epic 3</div>,
  beforeLoad: guardTurnTheMonth,
});

// /merchant-rules
const merchantRulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/merchant-rules',
  component: () => <div className="p-6 type-body" style={{ color: 'var(--color-text-primary)' }}>Merchant Rules — coming in Epic 4</div>,
  beforeLoad: guardTurnTheMonth,
});

// /settings
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: () => <div className="p-6 type-body" style={{ color: 'var(--color-text-primary)' }}>Settings — coming in Story 1.6</div>,
  beforeLoad: guardTurnTheMonth,
});

// /onboarding
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: () => <div className="p-6 type-body" style={{ color: 'var(--color-text-primary)' }}>Onboarding — coming in Story 1.5</div>,
  // No Turn the Month guard on onboarding
});

// /turn-the-month
// Guard: redirect to / if NOT in closing state (no manual access)
const turnTheMonthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/turn-the-month',
  component: () => <div className="p-6 type-body" style={{ color: 'var(--color-text-primary)' }}>Turn the Month — coming in Epic 6</div>,
  beforeLoad: () => {
    const { monthStatus } = useMonthStore.getState();
    if (!monthStatus.startsWith('closing:')) {
      throw redirect({ to: '/' });
    }
  },
});

const routeTree = rootRoute.addChildren([
  budgetRoute,
  ledgerRoute,
  merchantRulesRoute,
  settingsRoute,
  onboardingRoute,
  turnTheMonthRoute,
]);

export const router = createRouter({ routeTree });

// Type augmentation: makes router fully type-safe throughout the app
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

---

### `src/main.tsx` — Replace `<App />` with `<RouterProvider>`

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
```

**What changed:** `<App />` is replaced with `<RouterProvider router={router} />`. `App.tsx` is now the root layout component referenced inside `router.tsx` — it is not rendered directly from `main.tsx` anymore.

---

### `src/App.tsx` — Root Layout with Router Links

Replace the entire file:

```typescript
import { Link, Outlet } from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSettingsStore } from '@/stores/useSettingsStore';

// Nav items for the sidebar. Routes will expand as stories are implemented.
const NAV_ITEMS = [
  { label: 'Budget', to: '/' as const, exact: true },
  { label: 'Ledger', to: '/ledger' as const },
  { label: 'Rules', to: '/merchant-rules' as const },
  { label: 'Settings', to: '/settings' as const },
] as const;

function App() {
  const isReadOnly = useSettingsStore((s) => s.isReadOnly);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="flex h-screen w-full overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-app)' }}
      >
        {/* Sidebar — Forest Deep */}
        <aside
          data-testid="sidebar"
          className="w-[220px] shrink-0 flex flex-col py-6 px-4 gap-2"
          style={{ backgroundColor: 'var(--color-bg-sidebar)' }}
        >
          {/* Logo / App name */}
          <div className="mb-6 px-2">
            <span
              className="type-h1 font-bold tracking-tight"
              style={{ color: 'var(--color-sidebar-active)' }}
            >
              GarbanzoBeans
            </span>
          </div>

          {/* Nav links */}
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ label, to, exact }) => (
              <Link
                key={to}
                to={to}
                activeOptions={exact ? { exact: true } : undefined}
                className="sidebar-interactive text-left px-3 py-2 rounded-md type-body transition-colors"
                style={{ color: 'var(--color-sidebar-text)' }}
                activeProps={{
                  style: {
                    color: 'var(--color-sidebar-active)',
                    backgroundColor: 'rgba(192, 245, 0, 0.08)',
                  },
                }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content area */}
        <main
          data-testid="main-content"
          className="flex-1 flex flex-col overflow-hidden"
          style={{ backgroundColor: 'var(--color-bg-app)' }}
        >
          {/* Read-only banner — shown when sentinel lock detected (Story 1.7 wires detection) */}
          {isReadOnly && (
            <div
              data-testid="read-only-banner"
              className="shrink-0 px-4 py-2 type-label text-center"
              style={{
                backgroundColor: 'var(--color-amber)',
                color: 'var(--color-bg-app)',
              }}
            >
              Read-Only — another instance is open
            </div>
          )}

          {/* Routed content */}
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

export default App;
```

**Key changes from Story 1.2 placeholder:**
- `<button>` nav items → TanStack Router `<Link>` with `activeProps` for active state (addresses deferred from Story 1.2 code review)
- Main content area uses `<Outlet />` for routed content
- Read-only banner added (conditionally rendered from `useSettingsStore`)
- `<TooltipProvider>` stays in place

---

### File Structure After This Story

**New files:**
```
src/router.tsx
src/stores/useSettingsStore.ts
src/stores/useEnvelopeStore.ts
src/stores/useTransactionStore.ts
src/stores/useSavingsStore.ts
src/stores/useMerchantRuleStore.ts
src/stores/useMonthStore.ts
src-tauri/src/commands/get_settings.rs  (or added to mod.rs — see below)
```

**Modified files:**
```
src/main.tsx           — RouterProvider replaces App
src/App.tsx            — root layout with Link nav + Outlet
src/lib/types.ts       — MonthStatus and Settings types added
src-tauri/src/commands/mod.rs  — get_settings command added
src-tauri/src/lib.rs   — get_settings registered in invoke_handler
tsconfig.json          — noUncheckedIndexedAccess: true added
```

**Deleted files:**
```
src/stores/.gitkeep
```

**NOT modified:**
- `src/styles.css` — design tokens untouched
- `src/components/ui/*` — shadcn/ui wrappers untouched
- `src/lib/design-tokens.ts` — untouched (fix any type errors from noUncheckedIndexedAccess but don't restructure)
- `src-tauri/src/db.rs`, `src-tauri/src/migrations.rs`, `src-tauri/src/error.rs` — untouched

---

### Context from Stories 1.1–1.3 (Completed)

**Existing `src-tauri/src/lib.rs` invoke_handler:**
```rust
.invoke_handler(tauri::generate_handler![commands::get_db_status])
```
Add `commands::get_settings` to this list.

**`src-tauri/src/commands/mod.rs`** currently has only `get_db_status`. Add the `Settings` struct and `get_settings` function below it in the same file.

**`src/lib/types.ts`** currently has only `AppError`. Append the new types — do NOT replace the file.

**`src/App.tsx`** currently has placeholder nav and placeholder main content. The sidebar shell structure (dimensions, colors) should be preserved exactly. Only the nav items and main content slot change.

**`src/main.tsx`** currently renders `<App />`. Replace with `<RouterProvider router={router} />`.

**`src/stores/.gitkeep`** — delete this file once the store files are created.

---

### Architecture Compliance Rules

From `architecture.md` — enforced in this story:

- **Store-first IPC:** Components NEVER call `invoke()` directly. Store actions call `invoke()`. Components call store actions only. — Enforced: `loadSettings()` is in the store.
- **`isWriting` flag pattern:** Set before `invoke()`, clear in `finally`. Suppresses UI batch updates during writes. — Enforced in `loadSettings()`.
- **TanStack Router type-safety:** `declare module '@tanstack/react-router' { interface Register { router: typeof router } }` in `router.tsx` — required for type-safe `useParams`, `useSearch`, `<Link to=...>`.
- **Route guards via `beforeLoad`:** `useMonthStore.getState()` (not the hook) is the correct way to read store state outside React components. Hooks cannot be called in `beforeLoad`.
- **Feature folder kebab-case:** Route placeholder components live in existing `src/features/` subfolders (already created in Story 1.1). Do not create new folder structures.

---

### Anti-Patterns to Avoid

**WRONG — calling `invoke()` in a component:**
```typescript
// NEVER DO THIS in a component
const settings = await invoke<Settings>('get_settings');
```

**CORRECT — call the store action:**
```typescript
const loadSettings = useSettingsStore((s) => s.loadSettings);
useEffect(() => { loadSettings(); }, [loadSettings]);
```

**WRONG — using Zustand hook in `beforeLoad`:**
```typescript
// NEVER — hooks can't be called outside React
beforeLoad: () => {
  const { monthStatus } = useMonthStore(); // ❌ hook call
}
```

**CORRECT — use `.getState()` in `beforeLoad`:**
```typescript
beforeLoad: () => {
  const { monthStatus } = useMonthStore.getState(); // ✓
}
```

**WRONG — mutating state directly:**
```typescript
state.envelopes[0].allocated = newAmount; // ❌ direct mutation
```

**CORRECT — immutable update via set():**
```typescript
set((state) => ({
  envelopes: state.envelopes.map(e =>
    e.id === id ? { ...e, allocated: newAmount } : e
  )
}));
```

---

### Scope Boundaries — What This Story Does NOT Include

- **Onboarding redirect logic** — Story 1.5. This story scaffolds `/onboarding` as a route but does NOT redirect there if `onboardingComplete === false`. That redirect is Story 1.5's responsibility.
- **Sentinel lock file detection** — Story 1.7. `isReadOnly` is scaffolded here (defaults to `false`), but actual lock file read is deferred.
- **Envelope, transaction, savings data loading** — Each epic (2–6) adds its own store actions and Tauri commands. Stores here are minimal scaffolds.
- **`settings.updated_at` trigger** — No write commands to `settings` in this story (reads only). Deferred until Story 1.5/1.6 adds writes.
- **`get_db_status` wired to React** — Intentionally deferred; it is a dev-testing harness only.
- **`@tanstack/router-devtools`** — Dev-only; should be tree-shaken from production build via `import.meta.env.DEV` check (already shown in router.tsx above).

---

### Deferred Work to Note

- **`settings.updated_at` never refreshed** — Story 1.4 only reads settings. When Story 1.5 adds `upsert_settings`, add an `AFTER UPDATE` trigger on the `settings` table, or update `updated_at` in the Rust command via `datetime('now')`.
- **Migration MAX(version) skip risk** — Deferred from Story 1.3; becomes real when migration 002 is added in Story 2.1. Consider per-version membership check (`NOT IN (SELECT version FROM schema_version)`) over `MAX(version)` before adding migration 002.

---

### Testing Notes

Tests live co-located with source (architecture spec):
- `src/stores/useSettingsStore.test.ts`
- `src/stores/useMonthStore.test.ts`

Test pattern for `isWriting`:
```typescript
import { useSettingsStore } from './useSettingsStore';

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, isWriting: false, isReadOnly: false, error: null });
  });

  it('initializes with isWriting: false', () => {
    expect(useSettingsStore.getState().isWriting).toBe(false);
  });

  it('initializes with isReadOnly: false', () => {
    expect(useSettingsStore.getState().isReadOnly).toBe(false);
  });
});
```

For testing `isWriting` during async actions, mock `@tauri-apps/api/core`'s `invoke` in `vitest.config.ts` or via a manual mock. The `setupTests.ts` file already exists in `src/`.

---

### References

- Zustand v5 docs: `create` API — stores/zustand.md (no shims needed vs v4)
- TanStack Router v1: `beforeLoad` redirect pattern — `throw redirect(...)` not `return redirect(...)`
- Architecture ADR-3: Typed Commands Per Domain Operation
- Architecture ADR-5: Zustand Domain Slices
- Architecture `isWriting` flag: suppresses UI updates during active Tauri commands, releases as batch on resolution
- Deferred work: `noUncheckedIndexedAccess` — from Story 1.2 code review
- Deferred work: sentinel `isReadOnly` scaffold — from Story 1.7 scope

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Fixed TypeScript error in App.tsx: `exact` property not present on all NAV_ITEMS entries — used `'exact' in item && item.exact` narrowing pattern to satisfy `noUncheckedIndexedAccess` + union type constraints.

### Completion Notes List

- Installed zustand@5.0.12, @tanstack/react-router@1.168.10, @tanstack/router-devtools (dev).
- Added `noUncheckedIndexedAccess: true` to tsconfig.json — no existing code required fixes.
- Extended `src/lib/types.ts` with `MonthStatus` and `Settings` types (AppError unchanged).
- Added `Settings` struct and `get_settings` command to `src-tauri/src/commands/mod.rs`; registered in `lib.rs`. `cargo check` passed cleanly.
- Created all six Zustand stores following isWriting/finally pattern from architecture spec. Deleted `src/stores/.gitkeep`.
- Created `src/router.tsx` with 6 typed routes, `guardTurnTheMonth()` beforeLoad on guarded routes, reverse guard on `/turn-the-month`, TanStack Router module augmentation, and root loader hydrating settings store.
- Replaced `src/App.tsx` placeholder with root layout: TanStack `<Link>` nav, `<Outlet />`, conditional read-only banner.
- Replaced `src/main.tsx` `<App />` with `<RouterProvider router={router} />`.
- Wrote 14 new Vitest tests across 3 files (stores.test.ts, useSettingsStore.test.ts, useMonthStore.test.ts). All 21 tests pass. TypeScript clean.

### File List

**New files:**
- src/router.tsx
- src/stores/useSettingsStore.ts
- src/stores/useEnvelopeStore.ts
- src/stores/useTransactionStore.ts
- src/stores/useSavingsStore.ts
- src/stores/useMerchantRuleStore.ts
- src/stores/useMonthStore.ts
- src/stores/stores.test.ts
- src/stores/useSettingsStore.test.ts
- src/stores/useMonthStore.test.ts

**Modified files:**
- src/main.tsx — RouterProvider replaces App
- src/App.tsx — root layout with Link nav + Outlet + read-only banner
- src/lib/types.ts — MonthStatus and Settings types added
- src-tauri/src/commands/mod.rs — get_settings command added
- src-tauri/src/lib.rs — get_settings registered in invoke_handler
- tsconfig.json — noUncheckedIndexedAccess: true added
- _bmad-output/implementation-artifacts/sprint-status.yaml — status updated

**Deleted files:**
- src/stores/.gitkeep

### Review Findings

- [x] [Review][Decision] `/onboarding` route missing `guardTurnTheMonth` — resolved: guard added to /onboarding; all routes except /turn-the-month now redirect during closing state (AC3 fully satisfied).
- [x] [Review][Decision] `upsert_settings` implemented and registered out of story scope — resolved: removed from `commands/mod.rs` and `lib.rs`; Story 1.5 will implement it in proper scope.
- [x] [Review][Defer] Root loader silently continues on `loadSettings` failure [src/router.tsx:loader] — deferred, consistent with arch "errors in error field" pattern; error display UI deferred to feature stories
- [x] [Review][Defer] AC5 `isWriting` UI suppression scaffold only [src/stores/useSettingsStore.ts] — deferred, `isWriting` flag correct; actual consumer suppression implemented when feature components arrive in Epics 2–6
- [x] [Review][Defer] `upsert_settings` COALESCE cannot clear nullable fields — moot, `upsert_settings` removed; Story 1.5 must address when implementing
- [x] [Review][Defer] `onboarding_complete` accepts non-canonical `Option<i64>` values — moot, `upsert_settings` removed; Story 1.5 must add clamping/validation
- [x] [Review][Defer] `savings_target_pct` INSERT default undefined when passed as None — moot, `upsert_settings` removed; Story 1.5 must add explicit default or NOT NULL guard

## Change Log

- 2026-04-06: Story 1.4 created — Zustand stores, TanStack Router, route guards.
- 2026-04-06: Story 1.4 implemented — all 9 tasks complete; 21 tests passing; status set to review.
