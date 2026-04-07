# Story 1.7: Sentinel Lock + Read-Only Mode

Status: done

## Story

As Tom,
I want the app to detect when another instance already has the data folder open and gracefully switch to read-only mode,
So that two instances can never corrupt the database by writing simultaneously.

## Acceptance Criteria

1. **Given** the app opens and no sentinel lock file exists in the data folder **when** initialization completes **then** the sentinel lock file is written to the data folder; the app opens in normal read-write mode

2. **Given** the app opens and a sentinel lock file already exists in the data folder **when** initialization detects the existing lock **then** the app opens in read-only mode; a persistent, clearly visible indicator ("Read-Only — another instance is open") is displayed; all write actions are disabled (FR36)

3. **Given** the app is in read-only mode **when** the user attempts a write action **then** the action is blocked; an inline message explains why; no modal is shown

4. **Given** the app closes normally **when** the close event fires **then** a WAL checkpoint flush is executed; the sentinel lock file is deleted from the data folder

## Tasks / Subtasks

- [x] Task 1: Create `src-tauri/src/sentinel.rs` module (AC: #1, #2, #4)
  - [x] Create `src-tauri/src/sentinel.rs`
  - [x] Implement `pub fn check_and_acquire(lock_path: &std::path::Path) -> bool` — if lock file exists return `true` (read-only); else write `"locked\n"` to it and return `false`
  - [x] Implement `pub fn release(lock_path: &std::path::Path)` — call `std::fs::remove_file(lock_path)`, ignore errors (best-effort cleanup)
  - [x] Implement `pub fn wal_checkpoint(conn: &rusqlite::Connection)` — run `conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")`, ignore errors
  - [x] Add `pub mod sentinel;` to `src-tauri/src/lib.rs`

- [x] Task 2: Add managed state types and wire sentinel detection into `lib.rs` setup (AC: #1, #2)
  - [x] Add `pub struct ReadOnlyState(pub std::sync::Mutex<bool>)` to `src-tauri/src/lib.rs`
  - [x] Add `pub struct DataFolderState(pub std::sync::Mutex<Option<String>>)` to `src-tauri/src/lib.rs`
  - [x] In `.setup()`, sentinel query runs BEFORE `conn` is moved into `DbState`; uses `query_row(...).optional().ok().flatten().flatten()` to handle no-row (pre-onboarding) and NULL column cases
  - [x] If `data_folder_path` is `Some(path)`: call `sentinel::check_and_acquire(...)` → store result as `is_read_only`; store path string in `data_folder_opt`
  - [x] If `data_folder_path` is `None` (pre-onboarding): `is_read_only = false`, `data_folder_opt = None`
  - [x] Call `app.manage(ReadOnlyState(...))` and `app.manage(DataFolderState(...))`

- [x] Task 3: Add `on_window_event` close handler for WAL checkpoint + sentinel release (AC: #4)
  - [x] Add `.on_window_event(|window, event| { ... })` in `src-tauri/src/lib.rs` builder chain (before `.invoke_handler`)
  - [x] Uses `use tauri::Manager;` inside closure to access `window.app_handle()`
  - [x] On `CloseRequested`: reads `ReadOnlyState` using block+semicolon pattern to satisfy borrow checker; if `false` (we own the lock), proceeds with cleanup
  - [x] WAL checkpoint via `try_lock()` (non-blocking to avoid deadlock if a command is in flight)
  - [x] Clones data folder path out of `DataFolderState` guard before calling `sentinel::release()`

- [x] Task 4: Add `get_read_only_state` Tauri command (AC: #2)
  - [x] Added `get_read_only_state` to `src-tauri/src/commands/mod.rs`
  - [x] Registered in `tauri::generate_handler![]` in `src-tauri/src/lib.rs`

- [x] Task 5: Add `checkSentinel` action to `useSettingsStore` and wire into initialization (AC: #2)
  - [x] Added `checkSentinel: () => Promise<void>` to `SettingsState` interface in `src/stores/useSettingsStore.ts`
  - [x] Implemented: `invoke<boolean>('get_read_only_state')` → `set({ isReadOnly })`; catch → `set({ isReadOnly: false })` (fail open)
  - [x] Updated root route `beforeLoad` in `src/router.tsx` to call `checkSentinel()` after `loadSettings()`

- [x] Task 6: Block write actions in read-only mode on SettingsPage (AC: #3)
  - [x] Destructured `isReadOnly` from `useSettingsStore()` in `SettingsPage.tsx`
  - [x] Added `isReadOnly` to `isSaveDisabled` condition
  - [x] Added inline amber message below Save button when `isReadOnly`

- [x] Task 7: Write Vitest unit tests (AC: #1, #2, #3)
  - [x] Added 4 `checkSentinel` tests to existing `src/stores/useSettingsStore.test.ts` (10 total in file)
  - [x] Added `checkSentinel: vi.fn()` to `mockStore` helper in `src/features/settings/SettingsPage.test.tsx`
  - [x] Added 2 read-only tests to `SettingsPage.test.tsx` (8 total in file)
  - [x] All 38 Vitest tests pass

- [x] Task 8: Write E2E integration test (AC: #1, #2, #4)
  - [x] Created `e2e/sentinel.spec.ts` (6 Playwright tests against Vite dev server with mocked invoke) — all 6 pass
  - [x] Created `e2e-integration/sentinel-lock.test.ts` stub with full WebdriverIO + tauri-driver setup instructions; deferred to Story 1.9

## Dev Notes

---

### What Already Exists — Do Not Re-Implement

These are scaffolded and complete before this story:

1. **`src/App.tsx` lines 80–92** — Read-only banner UI is already implemented:
   ```tsx
   {isReadOnly && (
     <div
       data-testid="read-only-banner"
       className="shrink-0 px-4 py-2 type-label text-center"
       style={{ backgroundColor: 'var(--color-amber)', color: 'var(--color-bg-app)' }}
     >
       Read-Only — another instance is open
     </div>
   )}
   ```
   `isReadOnly` comes from `useSettingsStore((s) => s.isReadOnly)`. Do NOT create `ReadOnlyBanner.tsx` — the banner is already inline in `App.tsx`.

2. **`src/stores/useSettingsStore.ts`** — `isReadOnly: boolean` (initialized `false`) and `setReadOnly: (value: boolean) => void` are already scaffolded. Add `checkSentinel` alongside these — do not replace `setReadOnly`.

3. **`src-tauri/src/commands/mod.rs` `init_data_folder()`** — already writes `garbanzobeans.lock` during onboarding. This function is correct as-is. The sentinel lifecycle:
   - Onboarding: `init_data_folder` writes the sentinel (one-time)
   - Close handler (Task 3): deletes it
   - Subsequent launches: startup check (Task 2) writes it if absent; detects it if present (another instance)

---

### Sentinel Lock File

- **Path:** `{data_folder_path}/garbanzobeans.lock`
- **Content:** `"locked\n"` (same as written by `init_data_folder`)
- **Detection:** file existence only — no PID or heartbeat; stale locks after a crash require manual deletion (acceptable single-user limitation)

---

### Rust: `sentinel.rs` Implementation

```rust
// src-tauri/src/sentinel.rs

/// Check if the sentinel lock file exists.
/// If it exists, another instance holds it → return true (read-only).
/// If it does not exist, write it to claim the lock → return false (read-write).
pub fn check_and_acquire(lock_path: &std::path::Path) -> bool {
    if lock_path.exists() {
        return true; // another instance owns the lock
    }
    // Try to write the lock file; if it fails, treat as read-only (safe default)
    std::fs::write(lock_path, "locked\n").is_err()
}

/// Delete the sentinel lock file. Best-effort; errors ignored.
pub fn release(lock_path: &std::path::Path) {
    let _ = std::fs::remove_file(lock_path);
}

/// Run WAL checkpoint. Best-effort; errors ignored.
pub fn wal_checkpoint(conn: &rusqlite::Connection) {
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)");
}
```

---

### Rust: `lib.rs` Changes

Add new managed state types and update `setup`:

```rust
// New types — add near DbState at the top of lib.rs:
pub struct ReadOnlyState(pub std::sync::Mutex<bool>);
pub struct DataFolderState(pub std::sync::Mutex<Option<String>>);
```

In `.setup()`, add AFTER `app.manage(DbState(Mutex::new(conn)));`:

```rust
// Sentinel detection: check if another instance owns the data folder lock.
// The settings table's data_folder_path is NULL pre-onboarding; sentinel check is skipped.
use rusqlite::OptionalExtension;
let data_folder_opt: Option<String> = conn
    .query_row(
        "SELECT data_folder_path FROM settings WHERE id = 1",
        [],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()     // None if no settings row exists (pre-onboarding)
    .ok()
    .flatten()      // None if row exists but data_folder_path is SQL NULL
    .flatten();

let is_read_only = if let Some(ref path) = data_folder_opt {
    let lock_path = std::path::Path::new(path).join("garbanzobeans.lock");
    sentinel::check_and_acquire(&lock_path)
} else {
    false
};

app.manage(ReadOnlyState(std::sync::Mutex::new(is_read_only)));
app.manage(DataFolderState(std::sync::Mutex::new(data_folder_opt)));
```

Note: `conn` is moved into `DbState` — the sentinel query must run BEFORE `app.manage(DbState(...))`, so restructure setup accordingly:

```rust
let conn = db::init_database(&db_path)?;

// 1. Sentinel detection (uses conn before it's moved into DbState)
use rusqlite::OptionalExtension;
let data_folder_opt: Option<String> = conn
    .query_row("SELECT data_folder_path FROM settings WHERE id = 1", [],
        |row| row.get::<_, Option<String>>(0))
    .optional().ok().flatten().flatten();

let is_read_only = if let Some(ref path) = data_folder_opt {
    sentinel::check_and_acquire(&std::path::Path::new(path).join("garbanzobeans.lock"))
} else {
    false
};

// 2. Manage all state
app.manage(DbState(Mutex::new(conn)));
app.manage(ReadOnlyState(Mutex::new(is_read_only)));
app.manage(DataFolderState(Mutex::new(data_folder_opt)));
```

`OptionalExtension` is in scope via `use rusqlite::OptionalExtension;` — the `rusqlite` crate provides this trait.

---

### Rust: Close Handler

Add to `tauri::Builder` chain in `lib.rs`, before `.invoke_handler`:

```rust
.on_window_event(|window, event| {
    if let tauri::WindowEvent::CloseRequested { .. } = event {
        let app = window.app_handle();

        let is_read_only = {
            let ro = app.state::<ReadOnlyState>();
            *ro.0.lock().unwrap_or_else(|p| p.into_inner())
        };

        if !is_read_only {
            // WAL checkpoint — use try_lock to avoid deadlock if a command is in flight
            {
                let db = app.state::<DbState>();
                if let Ok(conn) = db.0.try_lock() {
                    sentinel::wal_checkpoint(&conn);
                }
            }
            // Release sentinel
            {
                let df = app.state::<DataFolderState>();
                if let Ok(path_opt) = df.0.lock() {
                    if let Some(ref path) = *path_opt {
                        let lock_path = std::path::Path::new(path).join("garbanzobeans.lock");
                        sentinel::release(&lock_path);
                    }
                }
            }
        }
    }
})
```

---

### Rust: `get_read_only_state` Command

Add to `src-tauri/src/commands/mod.rs`:

```rust
#[tauri::command]
pub fn get_read_only_state(state: State<crate::ReadOnlyState>) -> bool {
    *state.0.lock().unwrap_or_else(|p| p.into_inner())
}
```

Add to `invoke_handler` in `lib.rs`:
```rust
commands::get_read_only_state,
```

---

### React: `useSettingsStore` — `checkSentinel` Action

Add to `SettingsState` interface:
```typescript
checkSentinel: () => Promise<void>;
```

Add implementation alongside existing actions:
```typescript
checkSentinel: async () => {
  try {
    const isReadOnly = await invoke<boolean>('get_read_only_state');
    set({ isReadOnly });
  } catch {
    set({ isReadOnly: false }); // fail open — don't block user if check fails
  }
},
```

---

### React: `router.tsx` Root `beforeLoad`

Extend to call `checkSentinel()` after `loadSettings()`:

```typescript
beforeLoad: async () => {
  await useSettingsStore.getState().loadSettings();
  await useSettingsStore.getState().checkSentinel();
},
```

No other route changes needed. `checkSentinel()` only sets `isReadOnly` in the store — it does not redirect. The banner in `App.tsx` is reactive and renders automatically when `isReadOnly` becomes `true`.

---

### React: `SettingsPage.tsx` Read-Only Blocking

In `SettingsPage.tsx`, destructure `isReadOnly` from the store:

```typescript
const { settings, upsertSettings, isWriting, isReadOnly } = useSettingsStore();
```

Update `isSaveDisabled`:
```typescript
const isSaveDisabled = !payDate1Valid || !payDate2Valid || isWriting || isReadOnly;
```

Add inline read-only message in the footer (below the Save button, before the `saved`/`saveError` feedback):
```tsx
{isReadOnly && (
  <p className="type-label" style={{ color: 'var(--color-amber)' }}>
    Read-only: another instance is open. Close it to make changes.
  </p>
)}
```

The message uses amber (`var(--color-amber)` = `#F5A800`) to match the banner color — visually consistent read-only system state. Do NOT use `var(--color-red, #ff5555)` — red is reserved for errors, not read-only state.

---

### Vitest: `useSettingsStore.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

beforeEach(() => {
  // Reset store to initial state before each test
  useSettingsStore.setState({
    settings: null,
    isWriting: false,
    isReadOnly: false,
    error: null,
  });
  vi.clearAllMocks();
});

describe('checkSentinel', () => {
  it('sets isReadOnly: true when get_read_only_state returns true', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true);
    await useSettingsStore.getState().checkSentinel();
    expect(useSettingsStore.getState().isReadOnly).toBe(true);
  });

  it('sets isReadOnly: false when get_read_only_state returns false', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(false);
    await useSettingsStore.getState().checkSentinel();
    expect(useSettingsStore.getState().isReadOnly).toBe(false);
  });

  it('defaults isReadOnly to false on invoke failure', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('IPC error'));
    await useSettingsStore.getState().checkSentinel();
    expect(useSettingsStore.getState().isReadOnly).toBe(false);
  });

  it('isReadOnly starts as false in initial state', () => {
    expect(useSettingsStore.getState().isReadOnly).toBe(false);
  });
});
```

---

### Vitest: `SettingsPage.test.tsx` Additions

Add two tests to the existing `src/features/settings/SettingsPage.test.tsx` file. Use the same mock pattern already in the file for `useSettingsStore`:

```typescript
it('disables Save button and shows read-only message when isReadOnly is true', () => {
  vi.mocked(useSettingsStore).mockReturnValue({
    settings: { payFrequency: 'monthly', payDates: '"1"', savingsTargetPct: 10,
      dataFolderPath: '/some/path', onboardingComplete: true,
      id: 1, budgetName: null, startMonth: null, createdAt: '', updatedAt: '' },
    upsertSettings: vi.fn(),
    isWriting: false,
    isReadOnly: true,
    error: null,
    loadSettings: vi.fn(),
    checkSentinel: vi.fn(),
    setReadOnly: vi.fn(),
  });
  render(<SettingsPage />);
  expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  expect(screen.getByText(/read-only: another instance is open/i)).toBeInTheDocument();
});

it('does not show read-only message when isReadOnly is false', () => {
  vi.mocked(useSettingsStore).mockReturnValue({
    settings: { payFrequency: 'monthly', payDates: '"1"', savingsTargetPct: 10,
      dataFolderPath: '/some/path', onboardingComplete: true,
      id: 1, budgetName: null, startMonth: null, createdAt: '', updatedAt: '' },
    upsertSettings: vi.fn(),
    isWriting: false,
    isReadOnly: false,
    error: null,
    loadSettings: vi.fn(),
    checkSentinel: vi.fn(),
    setReadOnly: vi.fn(),
  });
  render(<SettingsPage />);
  expect(screen.queryByText(/read-only: another instance is open/i)).not.toBeInTheDocument();
});
```

---

### E2E Integration Tests (`e2e-integration/`)

The architecture specifies WebdriverIO + tauri-driver for integration tests against the built app. The `e2e-integration/` folder does not yet exist. This story creates it.

**Setup:**
1. `npm install --save-dev webdriverio @wdio/cli @wdio/spec-reporter tauri-driver`
2. Create `wdio.conf.ts` at project root per tauri-driver documentation
3. Add `"test:e2e:integration": "wdio run wdio.conf.ts"` script to `package.json`

**Test file: `e2e-integration/sentinel-lock.test.ts`**

The test must pre-create or pre-delete the lock file before launching the app:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { browser, $ } from '@wdio/globals';

// DATA_FOLDER env var points to a test data folder whose path matches settings
const DATA_FOLDER = process.env.TEST_DATA_FOLDER!;
const LOCK_FILE = path.join(DATA_FOLDER, 'garbanzobeans.lock');

describe('Sentinel Lock', () => {
  afterEach(async () => {
    // Clean up lock file between tests
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  });

  it('opens in read-write mode when no lock file exists', async () => {
    // Ensure no lock file before launch
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    // App is launched by wdio runner; navigate to settings
    const banner = await $('[data-testid="read-only-banner"]');
    expect(await banner.isExisting()).toBe(false);
  });

  it('opens in read-only mode when lock file exists', async () => {
    // Pre-create lock file to simulate another instance
    fs.writeFileSync(LOCK_FILE, 'locked\n');
    // App is launched by wdio runner
    const banner = await $('[data-testid="read-only-banner"]');
    await banner.waitForExist({ timeout: 5000 });
    expect(await banner.getText()).toContain('Read-Only');
  });
});
```

**Note:** Full WebdriverIO + tauri-driver setup is complex and may span this story and Story 1.8 or 1.9. If time-constrained, create the `e2e-integration/` folder with a stub `sentinel-lock.test.ts` and document the setup steps needed. The Vitest tests cover the React-side behavior sufficiently for the initial implementation.

---

### Styling Reference (Read-Only State)

| Use | Token | Value |
|-----|-------|-------|
| Read-only banner bg (App.tsx — already wired) | `var(--color-amber)` | `#F5A800` |
| Read-only banner text (App.tsx — already wired) | `var(--color-bg-app)` | `#111214` |
| Inline read-only message on SettingsPage | `var(--color-amber)` | `#F5A800` |

Amber is used for read-only state (caution/informational). Red (`var(--color-red, #ff5555)`) is reserved for errors.

---

### Previous Story Learnings (from Story 1.6)

1. **`try_lock()` instead of `lock()` in close handler** — The single `Mutex<Connection>` in `DbState` serializes all DB commands. Use `try_lock()` in the close handler so a slow in-flight command doesn't deadlock the close event. If the lock isn't available, WAL checkpoint is skipped (acceptable for clean-close scenarios).
2. **`isReadOnly` from store vs `isReadOnly` prop** — Use `useSettingsStore()` hook inside `SettingsPage` to read `isReadOnly`; do not pass it as a prop. Consistent with how `isWriting` and `error` are read.
3. **`setReadOnly` is scaffolded but not the primary mechanism** — `setReadOnly()` exists for external callers but the canonical way to update `isReadOnly` in this story is through `checkSentinel()` which reads the authoritative Rust state. Do not call `setReadOnly(true)` directly from UI code.
4. **router.tsx guard order** — The root `beforeLoad` runs before any child route guards. Adding `checkSentinel()` to root `beforeLoad` ensures `isReadOnly` is set before any child component renders.
5. **`guardTurnTheMonth()` is NOT on `/settings` route** — Confirmed removed in Story 1.6 review. Do not add it back.

---

### What This Story Does NOT Touch

- `App.tsx` — banner is already implemented; no changes needed
- `src/stores/useSettingsStore.ts` `isReadOnly` field and `setReadOnly` action — already scaffolded; just add `checkSentinel` alongside
- Other screens (`/`, `/ledger`, `/merchant-rules`) — all placeholder components; read-only write-blocking for those screens deferred to the stories that implement them
- No new migrations — sentinel is a filesystem artifact, not a DB concept
- No new Rust plugins — only `rusqlite` (already installed) and `std::fs`

## File List

### New Files
- `src-tauri/src/sentinel.rs`
- `e2e/sentinel.spec.ts`
- `e2e-integration/sentinel-lock.test.ts` (stub with setup instructions)
- `e2e-integration/` (directory created)

### Modified Files
- `src-tauri/src/lib.rs` — `ReadOnlyState`, `DataFolderState`, sentinel detection in setup, close handler, register `get_read_only_state`
- `src-tauri/src/commands/mod.rs` — `get_read_only_state` command
- `src/stores/useSettingsStore.ts` — `checkSentinel` action added
- `src/stores/useSettingsStore.test.ts` — 4 `checkSentinel` tests added
- `src/router.tsx` — `checkSentinel()` added to root `beforeLoad`
- `src/features/settings/SettingsPage.tsx` — `isReadOnly` check on Save + inline message
- `src/features/settings/SettingsPage.test.tsx` — `checkSentinel` added to mock helper; 2 read-only tests added
- `_bmad-output/implementation-artifacts/deferred-work.md` — 2 deferred items added

## Dev Agent Record

### Implementation Plan

1. Created `sentinel.rs` with `check_and_acquire` (file-existence → write if absent), `release` (best-effort delete), and `wal_checkpoint` (PRAGMA TRUNCATE) — all best-effort with errors ignored.
2. Added `ReadOnlyState(Mutex<bool>)` and `DataFolderState(Mutex<Option<String>>)` to `lib.rs`. Sentinel query runs on `conn` before it moves into `DbState` — mandatory ordering since `Mutex<Connection>` consumes the connection. Used `optional().ok().flatten().flatten()` to handle no-row (pre-onboarding) and NULL column in a single expression.
3. Added `on_window_event` close handler using `use tauri::Manager;` inside the closure (Tauri 2 requires trait in scope). Used explicit `let val = ...; val` block pattern (not block-return expression) to satisfy the borrow checker for mutex guards. Used `try_lock()` on DbState to avoid deadlock during in-flight commands. Cloned `DataFolderState` path string before releasing the guard.
4. Added `get_read_only_state` command — reads `ReadOnlyState`, handles poisoned mutex with `unwrap_or_else`.
5. Added `checkSentinel()` to `useSettingsStore` — calls `get_read_only_state`, fails open (isReadOnly: false) on error. Called from root `beforeLoad` after `loadSettings()`.
6. Updated `SettingsPage.tsx` to destructure `isReadOnly`, include it in `isSaveDisabled`, and show amber inline message when true.
7. Tests: 4 new `checkSentinel` unit tests in existing `useSettingsStore.test.ts`; 2 new read-only tests in `SettingsPage.test.tsx`; 6 new Playwright tests in `e2e/sentinel.spec.ts` (mocked invoke); `e2e-integration/sentinel-lock.test.ts` stub for future WebdriverIO setup.

### Completion Notes

All ACs satisfied:
- AC1: `sentinel::check_and_acquire` writes the lock file if absent → app opens read-write.
- AC2: Lock file detected on startup → `ReadOnlyState(true)` → `checkSentinel()` → `isReadOnly: true` → amber banner in `App.tsx` (already implemented).
- AC3: `SettingsPage` Save button disabled + inline amber message when `isReadOnly`. Other screens are placeholders; write-blocking deferred to their respective implementation stories.
- AC4: `on_window_event(CloseRequested)` runs WAL checkpoint + sentinel file deletion when we own the lock.

Test counts: 38 Vitest (7 files) + 4 Rust cargo tests = 42 total unit/integration tests passing. 6 Playwright E2E sentinel tests passing. Pre-existing E2E failures (app.spec, design-system.spec, settings navigate-away) are documented in deferred-work.md; none caused by Story 1.7.

Borrow checker note: the `on_window_event` closure required `let val = ...; val` pattern instead of expression-at-end-of-block for mutex guards, and `clone()` for the data folder path to avoid keeping `DataFolderState` locked during `sentinel::release`.

### Change Log

- 2026-04-06: Story created — Sentinel lock detection, WAL checkpoint on close, read-only banner wiring, SettingsPage write blocking.
- 2026-04-06: Story implemented — `sentinel.rs` module, `ReadOnlyState`/`DataFolderState` managed state, `get_read_only_state` command, `checkSentinel` store action, SettingsPage read-only blocking, 6 new Vitest tests, 6 new Playwright E2E tests.
- 2026-04-06: Code review — 2 patches, 3 deferred, 8 dismissed.

### Review Findings

- [x] [Review][Patch] TOCTOU race in `check_and_acquire`: `exists()` + `write()` is non-atomic — two simultaneous launches can both claim the lock. Fixed: replaced with `OpenOptions::create_new()` (atomic O_CREAT|O_EXCL). [`src-tauri/src/sentinel.rs:18-24`]
- [x] [Review][Patch] `DataFolderState` not updated after `init_data_folder` completes — post-onboarding close skips `sentinel::release()`, leaving a stale lock on disk; next launch sees it and enters permanent read-only. Fixed: `init_data_folder` now accepts and updates `DataFolderState` and `ReadOnlyState`. [`src-tauri/src/commands/mod.rs`]
- [x] [Review][Defer] `isReadOnly` not refreshed if the other instance closes during the session — detection is init-only per spec; user is stuck read-only until restart [`src-tauri/src/lib.rs:58-63`] — deferred, pre-existing design decision
- [x] [Review][Defer] `.ok()` silently discards non-`QueryReturnedNoRows` rusqlite errors in sentinel query, treating all DB errors as "no settings row" [`src-tauri/src/lib.rs:47-56`] — deferred, pre-existing pattern, low practical risk
- [x] [Review][Defer] E2E integration stub uses `browser.closeWindow()` which may not trigger Tauri `CloseRequested`, so the "deletes lock file after close" test may never exercise the close handler [`e2e-integration/sentinel-lock.test.ts:84`] — deferred to Story 1.9
